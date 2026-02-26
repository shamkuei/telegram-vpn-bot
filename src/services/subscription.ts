import { db, withTransaction } from '@/db/index'
import { subscriptions, plans, servers, paymentLogs, vpnAccounts } from '@/db/schema/index'
import { eq, and, sql, asc } from 'drizzle-orm'
import { marzban } from '@/marzban/index'
import { CacheInvalidation } from '@/cache/index'
import type { NewSubscription } from '@/db/schema/index'

// ============================================================================
// Subscription Service
// ============================================================================

export interface CreateSubscriptionInput {
  planId: number
  serverId?: number
  autoRenew?: boolean
  paymentMethod?: string
  promoCode?: string
}

export interface SubscriptionResponse {
  success: boolean
  subscription?: any
  vpnAccount?: any
  message: string
}

// ============================================================================
// Create Subscription
// ============================================================================

export async function createSubscription(user: any, input: CreateSubscriptionInput): Promise<SubscriptionResponse> {
  try {
    // Get plan
    const plan = await getPlanById(input.planId)
    if (!plan) {
      return {
        success: false,
        message: 'Plan not found'
      }
    }

    // Get server (if not specified, choose from allowed servers)
    let server = null
    if (input.serverId) {
      server = await getServerById(input.serverId)
    } else {
      server = await selectBestServer()
    }

    if (!server) {
      return {
        success: false,
        message: 'No available servers'
      }
    }

    // Check promo code if provided
    let discountCents = 0
    if (input.promoCode) {
      const promoResult = await applyPromoCode(input.promoCode, plan.id)
      if (!promoResult.valid) {
        return {
          success: false,
          message: promoResult.message || 'Invalid promo code'
        }
      }
      discountCents = promoResult.discountCents || 0
    }

    // Calculate final price
    const finalPriceCents = Math.max(0, plan.priceUsdCents - discountCents)

    // Create subscription record
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + plan.durationDays)

    const [subscription] = await db
      .insert(subscriptions)
      .values({
        userId: user.id,
        planId: plan.id,
        serverId: server.id,
        status: 'active',
        startedAt: new Date(),
        expiresAt,
        autoRenew: input.autoRenew !== false,
        dataLimitGb: plan.dataLimitGb ? (plan.dataLimitGb * 1_000_000_000).toString() : null,
        usedDataGb: 0,
        deviceLimit: plan.deviceLimit,
        pricePaidCents: finalPriceCents,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()

    // Create Marzban user
    const marzbanUser = await marzban.createUser({
      username: generateMarzbanUsername(user),
      status: 'active',
      expire: Math.floor(expiresAt.getTime() / 1000),
      data_limit: plan.dataLimitGb ? plan.dataLimitGb * 1_000_000_000 : 0,
      data_limit_reset_strategy: 'no_reset',
      proxies: getProxiesForServer(server),
      inbounds: getInboundsForServer(server)
    })

    // Create VPN account record
    const [vpnAccount] = await db.insert(vpnAccounts).values({
      userId: user.id,
      serverId: server.id,
      accountName: `${plan.name} - ${server.city}`,
      accountKey: generateAccountKey(),
      marzbanUsername: marzbanUser.username,
      marzbanToken: generateMarzbanToken(),
      marzbanSubscriptionUrl: marzbanUser.subscription_url,
      status: 'active',
      dataLimitBytes: plan.dataLimitGb ? plan.dataLimitGb * 1_000_000_000 : null,
      usedDataBytes: 0,
      expiresAt,
      subscriptionId: subscription.id,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning()

    // Update user with Marzban username
    await updateUserMarzbanUsername(user.id, marzbanUser.username)

    // Invalidate cache
    await CacheInvalidation.invalidateSubscription(subscription.id, user.id)

    return {
      success: true,
      subscription,
      vpnAccount,
      message: 'Subscription created successfully'
    }
  } catch (error) {
    console.error('Create subscription error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create subscription'
    }
  }
}

// ============================================================================
// Renew Subscription
// ============================================================================

export async function renewSubscription(user: any, subscriptionId: number): Promise<SubscriptionResponse> {
  try {
    const subscription = await getSubscriptionById(subscriptionId)

    if (!subscription || subscription.userId !== user.id) {
      return {
        success: false,
        message: 'Subscription not found'
      }
    }

    const plan = await getPlanById(subscription.planId)
    if (!plan) {
      return {
        success: false,
        message: 'Associated plan not found'
      }
    }

    // Calculate new expiration
    const expiresAt = new Date(subscription.expiresAt)
    expiresAt.setDate(expiresAt.getDate() + plan.durationDays)

    // Update subscription
    const [updated] = await db
      .update(subscriptions)
      .set({
        expiresAt,
        status: 'active',
        usedDataGb: 0,
        lastRenewalAttemptAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(subscriptions.id, subscriptionId))
      .returning()

    // Update Marzban user
    if (updated.marzbanUsername) {
      await marzban.updateUser(updated.marzbanUsername, {
        expire: Math.floor(expiresAt.getTime() / 1000)
      })
    }

    // Invalidate cache
    await CacheInvalidation.invalidateSubscription(subscriptionId, user.id)

    return {
      success: true,
      subscription: updated,
      message: 'Subscription renewed successfully'
    }
  } catch (error) {
    console.error('Renew subscription error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to renew subscription'
    }
  }
}

// ============================================================================
// Cancel Subscription
// ============================================================================

export async function cancelSubscription(user: any, subscriptionId: number) {
  const subscription = await getSubscriptionById(subscriptionId)

  if (!subscription || subscription.userId !== user.id) {
    throw new Error('Subscription not found')
  }

  await db.transaction(async (tx) => {
    // Update subscription status
    await tx
      .update(subscriptions)
      .set({
        status: 'cancelled',
        autoRenew: false,
        updatedAt: new Date()
      })
      .where(eq(subscriptions.id, subscriptionId))

    // Disable Marzban user
    if (subscription.marzbanUsername) {
      await marzban.updateUser(subscription.marzbanUsername, { status: 'disabled' })
    }
  })

  await CacheInvalidation.invalidateSubscription(subscriptionId, user.id)
}

// ============================================================================
// Get Expiring Subscriptions
// ============================================================================

export async function getSubscriptionsNeedingRenewal(daysThreshold: number = 3) {
  const thresholdDate = new Date()
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold)

  const expiring = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, 'active'),
        eq(subscriptions.autoRenew, true),
        sql`${subscriptions.expiresAt} <= ${thresholdDate}`
      )
    )
    .orderBy(asc(subscriptions.expiresAt))

  return expiring
}

// ============================================================================
// Helpers
// ============================================================================

async function getPlanById(planId: number) {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId))
  return plan || null
}

async function getServerById(serverId: number) {
  const [server] = await db.select().from(servers).where(eq(servers.id, serverId))
  return server || null
}

async function selectBestServer() {
  const [server] = await db
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

  return server || null
}

async function applyPromoCode(code: string, planId: number) {
  const { db } = await import('@/db/index.js')
  const { promoCodes, plans } = await import('@/db/schema/index.js')
  const { eq, and, gt, or, isNull } = await import('drizzle-orm')

  const now = new Date()

  const [promo] = await db
    .select()
    .from(promoCodes)
    .where(
      and(
        eq(promoCodes.code, code),
        eq(promoCodes.isActive, true),
        or(isNull(promoCodes.validUntil), gt(promoCodes.validUntil, now))
      )
    )
    .limit(1)

  if (!promo) {
    return { valid: false, message: 'Invalid or expired promo code' }
  }

  // Check if applies to plan
  if (promo.appliesToPlanIds && promo.appliesToPlanIds.length > 0) {
    if (!promo.appliesToPlanIds.includes(planId)) {
      return { valid: false, message: 'Promo code not applicable to this plan' }
    }
  }

  // Check usage limits
  if (promo.maxUses && promo.usedCount >= promo.maxUses) {
    return { valid: false, message: 'Promo code has reached maximum uses' }
  }

  // Calculate discount
  const plan = await getPlanById(planId)
  if (!plan) {
    return { valid: false, message: 'Plan not found' }
  }

  let discountCents = 0
  if (promo.discountType === 'PERCENTAGE') {
    discountCents = Math.floor((plan.priceUsdCents * promo.discountValue) / 100)
  } else if (promo.discountType === 'FIXED') {
    discountCents = promo.discountValue
  }

  // Apply max discount cap
  if (promo.maxDiscountCents) {
    discountCents = Math.min(discountCents, promo.maxDiscountCents)
  }

  return {
    valid: true,
    promo,
    discountCents
  }
}

function generateMarzbanUsername(user: any): string {
  return `user_${user.telegramId}_${Date.now()}`
}

function generateAccountKey(): string {
  return crypto.randomUUID()
}

function generateMarzbanToken(): string {
  return crypto.randomUUID()
}

function getProxiesForServer(server: any) {
  // Return appropriate proxy configuration for server
  return {
    vmess: {},
    vless: {}
  }
}

function getInboundsForServer(server: any) {
  // Return appropriate inbound configuration for server
  return {
    vmess: server.marzbanNodeName ? [server.marzbanNodeName] : [],
    vless: server.marzbanNodeName ? [server.marzbanNodeName] : []
  }
}

async function updateUserMarzbanUsername(userId: number, marzbanUsername: string) {
  const { updateUserMarzbanUser: updateMarzbanUser } = await import('@/services/user.js')
  await updateMarzbanUser(userId, marzbanUsername)
}

async function getSubscriptionById(subscriptionId: number) {
  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId))
  return subscription || null
}

export { getPlanById, getServerById }
