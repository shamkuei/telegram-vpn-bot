import { db, withTransaction } from '@/db/index'
import { wallets, subscriptions, vpnAccounts, users, plans, servers } from '@/db/schema/index'
import { eq, and, sql } from 'drizzle-orm'
import { marzban } from '@/marzban/index'
import { debit } from '@/services/wallet'
import { CacheInvalidation } from '@/cache/index'
import type { Plan, User } from '@/db/schema/index'

// ============================================================================
// Wallet Purchase Service
// ============================================================================

export interface PurchaseWithWalletInput {
  userId: number
  planId: number
  serverId?: number
}

export interface PurchaseWithWalletResponse {
  success: boolean
  subscription?: any
  message: string
  insufficientBalance?: boolean
  currentBalance?: number
  requiredAmount?: number
}

// ============================================================================
// Purchase Configuration
// ============================================================================

export const PURCHASE_CONFIG = {
  allowPartialPayment: false, // Set to true to allow multiple partial payments
}

// ============================================================================
// Purchase Plan with Wallet Balance
// ============================================================================

export async function purchaseWithWallet(
  input: PurchaseWithWalletInput
): Promise<PurchaseWithWalletResponse> {
  return await withTransaction(async (tx) => {
    try {
      // Get user
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1)

      if (!user) {
        return {
          success: false,
          message: 'User not found'
        }
      }

      // Get plan
      const [plan] = await tx
        .select()
        .from(plans)
        .where(eq(plans.id, input.planId))
        .limit(1)

      if (!plan) {
        return {
          success: false,
          message: 'Plan not found'
        }
      }

      // Check if plan is active
      if (!plan.isActive) {
        return {
          success: false,
          message: 'This plan is currently not available'
        }
      }

      // Get user's wallet
      const [wallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, input.userId))
        .limit(1)

      if (!wallet) {
        return {
          success: false,
          message: 'Wallet not found. Please create a wallet first.'
        }
      }

      // Check if wallet is active
      if (!wallet.isActive) {
        return {
          success: false,
          message: 'Your wallet is currently inactive. Please contact support.'
        }
      }

      // Check if wallet is frozen
      if (wallet.isFrozen) {
        return {
          success: false,
          message: `Your wallet is frozen. Reason: ${wallet.freezeReason || 'Please contact support.'}`
        }
      }

      // Check balance
      const availableBalance = wallet.balanceCents - wallet.frozenBalanceCents
      const requiredAmount = plan.priceUsdCents

      if (availableBalance < requiredAmount) {
        return {
          success: false,
          message: `Insufficient wallet balance. Required: $${(requiredAmount / 100).toFixed(2)}, Available: $${(availableBalance / 100).toFixed(2)}`,
          insufficientBalance: true,
          currentBalance: availableBalance,
          requiredAmount
        }
      }

      // Select server
      let server
      if (input.serverId) {
        [server] = await tx
          .select()
          .from(servers)
          .where(
            and(
              eq(servers.id, input.serverId),
              eq(servers.status, 'active')
            )
          )
          .limit(1)
      } else {
        [server] = await tx
          .select()
          .from(servers)
          .where(
            and(
              eq(servers.status, 'active'),
              eq(servers.isPublic, true),
              sql`${servers.currentUsers} < ${servers.maxUsers}`
            )
          )
          .orderBy((servers) => servers.loadPercentage)
          .limit(1)
      }

      if (!server) {
        return {
          success: false,
          message: 'No available servers. Please try again later.'
        }
      }

      // Debit wallet
      const debitResult = await debit(
        wallet.id,
        requiredAmount,
        'subscription_purchase',
        plan.id.toString(),
        `Subscription purchase: ${plan.name}`
      )

      // Calculate expiration
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + plan.durationDays)

      // Create subscription
      const [subscription] = await tx
        .insert(subscriptions)
        .values({
          userId: user.id,
          planId: plan.id,
          serverId: server.id,
          status: 'active',
          startedAt: new Date(),
          expiresAt,
          autoRenew: true,
          dataLimitGb: plan.dataLimitGb ? (plan.dataLimitGb * 1_000_000_000).toString() : null,
          usedDataGb: 0,
          deviceLimit: plan.deviceLimit,
          pricePaidCents: requiredAmount,
          currency: 'USD',
          paymentLogId: debitResult.id,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning()

      // Generate Marzban username
      const marzbanUsername = `user_${user.telegramId}_${Date.now()}`

      // Create Marzban user
      const marzbanUser = await marzban.createUser({
        username: marzbanUsername,
        status: 'active',
        expire: Math.floor(expiresAt.getTime() / 1000),
        data_limit: plan.dataLimitGb ? plan.dataLimitGb * 1_000_000_000 : 0,
        data_limit_reset_strategy: 'no_reset',
        proxies: getProxiesForServer(server),
        inbounds: getInboundsForServer(server)
      })

      // Create VPN account
      await tx.insert(vpnAccounts).values({
        userId: user.id,
        serverId: server.id,
        accountName: `${plan.name} - ${server.city}`,
        accountKey: crypto.randomUUID(),
        marzbanUsername: marzbanUser.username,
        marzbanToken: crypto.randomUUID(),
        marzbanSubscriptionUrl: marzbanUser.subscription_url,
        status: 'active',
        dataLimitBytes: plan.dataLimitGb ? plan.dataLimitGb * 1_000_000_000 : null,
        usedDataBytes: 0,
        expiresAt,
        subscriptionId: subscription.id,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      // Update user with Marzban username
      await tx
        .update(users)
        .set({
          marzbanUsername,
          updatedAt: new Date()
        })
        .where(eq(users.id, user.id))

      // Invalidate cache
      await CacheInvalidation.invalidateUser(user.id, user.telegramId)

      return {
        success: true,
        subscription,
        message: 'Subscription purchased successfully using wallet balance'
      }
    } catch (error) {
      console.error('Purchase with wallet error:', error)
      throw error
    }
  })
}

// ============================================================================
// Validate Wallet Balance for Purchase
// ============================================================================

export async function validateWalletBalance(
  userId: number,
  planId: number
): Promise<{ valid: boolean; currentBalance: number; requiredAmount: number; message: string }> {
  try {
    // Get user's wallet
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1)

    if (!wallet) {
      return {
        valid: false,
        currentBalance: 0,
        requiredAmount: 0,
        message: 'Wallet not found'
      }
    }

    // Get plan price
    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1)

    if (!plan) {
      return {
        valid: false,
        currentBalance: wallet.balanceCents - wallet.frozenBalanceCents,
        requiredAmount: 0,
        message: 'Plan not found'
      }
    }

    const availableBalance = wallet.balanceCents - wallet.frozenBalanceCents
    const requiredAmount = plan.priceUsdCents

    const valid = availableBalance >= requiredAmount

    return {
      valid,
      currentBalance: availableBalance,
      requiredAmount,
      message: valid
        ? 'Sufficient balance'
        : `Insufficient balance. Required: $${(requiredAmount / 100).toFixed(2)}, Available: $${(availableBalance / 100).toFixed(2)}`
    }
  } catch (error) {
    console.error('Validate wallet balance error:', error)
    return {
      valid: false,
      currentBalance: 0,
      requiredAmount: 0,
      message: 'Failed to validate balance'
    }
  }
}

// ============================================================================
// Get User's Wallet Balance
// ============================================================================

export async function getUserWalletBalance(userId: number): Promise<{
  balanceCents: number
  frozenBalanceCents: number
  availableBalanceCents: number
  currency: string
  isActive: boolean
  isFrozen: boolean
} | null> {
  try {
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1)

    if (!wallet) {
      return null
    }

    return {
      balanceCents: wallet.balanceCents,
      frozenBalanceCents: wallet.frozenBalanceCents,
      availableBalanceCents: wallet.balanceCents - wallet.frozenBalanceCents,
      currency: wallet.currency,
      isActive: wallet.isActive,
      isFrozen: wallet.isFrozen
    }
  } catch (error) {
    console.error('Get user wallet balance error:', error)
    return null
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function getProxiesForServer(server: any) {
  return {
    vmess: {},
    vless: {}
  }
}

function getInboundsForServer(server: any) {
  return {
    vmess: server.marzbanNodeName ? [server.marzbanNodeName] : [],
    vless: server.marzbanNodeName ? [server.marzbanNodeName] : []
  }
}

// ============================================================================
// Export Service Object
// ============================================================================

export const walletPurchaseService = {
  purchaseWithWallet,
  validateWalletBalance,
  getUserWalletBalance
}
