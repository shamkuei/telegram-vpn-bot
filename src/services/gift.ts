import { db, withTransaction } from '@/db/index'
import { giftCodes, giftRedemptions, subscriptions, plans, vpnAccounts, servers } from '@/db/schema/index'
import { eq, and, gte, lt, sql, desc } from 'drizzle-orm'
import { marzban } from '@/marzban/index'

// ============================================================================
// Types
// ============================================================================

export interface ClaimGiftCodeInput {
  code: string
  ipAddress?: string
}

export interface ClaimGiftCodeResult {
  success: boolean
  message: string
  subscription?: any
  giftCode?: any
}

// ============================================================================
// Gift Service
// ============================================================================

export const giftService = {
  /**
   * Claim a gift code and create a subscription
   */
  async claimGiftCode(user: any, input: ClaimGiftCodeInput): Promise<ClaimGiftCodeResult> {
    try {
      // Validate gift code
      const giftCode = await this.getGiftCodeByCode(input.code)

      if (!giftCode) {
        return {
          success: false,
          message: 'Invalid gift code'
        }
      }

      // Check if code is active
      if (!giftCode.isActive) {
        return {
          success: false,
          message: 'This gift code is not active'
        }
      }

      // Check if expired
      if (giftCode.expiresAt && new Date(giftCode.expiresAt) < new Date()) {
        return {
          success: false,
          message: 'This gift code has expired'
        }
      }

      // Check if max uses reached
      if (giftCode.maxUses !== null && giftCode.usedCount >= giftCode.maxUses) {
        return {
          success: false,
          message: 'This gift code has reached its maximum uses'
        }
      }

      // Check if user has already claimed this code
      const hasClaimed = await this.hasUserClaimedCode(giftCode.id, user.id)
      if (hasClaimed) {
        return {
          success: false,
          message: 'You have already claimed this gift code'
        }
      }

      // Check if user is allowed (if restricted)
      if (giftCode.allowedUserIds && giftCode.allowedUserIds.length > 0) {
        if (!giftCode.allowedUserIds.includes(user.id)) {
          return {
            success: false,
            message: 'You are not eligible to claim this gift code'
          }
        }
      }

      // Check account age requirement
      if (giftCode.minAccountAgeDays) {
        const accountAgeMs = Date.now() - new Date(user.createdAt).getTime()
        const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24)
        if (accountAgeDays < giftCode.minAccountAgeDays) {
          return {
            success: false,
            message: `Your account must be at least ${giftCode.minAccountAgeDays} days old to claim this code`
          }
        }
      }

      // Get plan
      const plan = await this.getPlanById(giftCode.planId)
      if (!plan) {
        return {
          success: false,
          message: 'Associated plan not found'
        }
      }

      // Get default server
      const server = await this.getDefaultServer()
      if (!server) {
        return {
          success: false,
          message: 'No available servers'
        }
      }

      // Create subscription and VPN account within transaction
      const result = await withTransaction(async (tx) => {
        // Calculate expiration
        const expiresAt = new Date()
        if (giftCode.durationDays) {
          expiresAt.setDate(expiresAt.getDate() + giftCode.durationDays)
        } else if (plan.durationDays) {
          expiresAt.setDate(expiresAt.getDate() + plan.durationDays)
        } else {
          expiresAt.setDate(expiresAt.getDate() + 30) // Default 30 days
        }

        // Create subscription
        const [subscription] = await tx.insert(subscriptions).values({
          userId: user.id,
          planId: plan.id,
          serverId: server.id,
          status: 'active',
          startedAt: new Date(),
          expiresAt,
          autoRenew: false,
          dataLimitGb: giftCode.dataLimitGb ? (giftCode.dataLimitGb * 1_000_000_000).toString() : null,
          usedDataGb: 0,
          deviceLimit: plan.deviceLimit,
          pricePaidCents: 0,
          currency: 'USD',
          createdAt: new Date(),
          updatedAt: new Date()
        }).returning()

        // Create Marzban user
        const marzbanUsername = `user_${user.telegramId}_${Date.now()}`
        const marzbanUser = await marzban.createUser({
          username: marzbanUsername,
          status: 'active',
          expire: Math.floor(expiresAt.getTime() / 1000),
          data_limit: giftCode.dataLimitGb ? giftCode.dataLimitGb * 1_000_000_000 : 0,
          data_limit_reset_strategy: 'no_reset',
          proxies: { vmess: {}, vless: {} },
          inbounds: {
            vmess: server.marzbanNodeName ? [server.marzbanNodeName] : [],
            vless: server.marzbanNodeName ? [server.marzbanNodeName] : []
          }
        })

        // Create VPN account
        const [vpnAccount] = await tx.insert(vpnAccounts).values({
          userId: user.id,
          serverId: server.id,
          accountName: `Gift: ${plan.name}`,
          accountKey: crypto.randomUUID(),
          marzbanUsername: marzbanUser.username,
          marzbanToken: crypto.randomUUID(),
          marzbanSubscriptionUrl: marzbanUser.subscription_url,
          status: 'active',
          dataLimitBytes: giftCode.dataLimitGb ? giftCode.dataLimitGb * 1_000_000_000 : null,
          usedDataBytes: 0,
          expiresAt,
          subscriptionId: subscription.id,
          createdAt: new Date(),
          updatedAt: new Date()
        }).returning()

        // Record redemption
        await tx.insert(giftRedemptions).values({
          giftCodeId: giftCode.id,
          userId: user.id,
          subscriptionId: subscription.id,
          ipAddress: input.ipAddress,
          redeemedAt: new Date(),
          createdAt: new Date()
        })

        // Update gift code usage count
        await tx.update(giftCodes)
          .set({
            usedCount: sql`${giftCodes.usedCount} + 1`,
            updatedAt: new Date()
          })
          .where(eq(giftCodes.id, giftCode.id))

        return { subscription, vpnAccount }
      })

      return {
        success: true,
        message: 'Gift code claimed successfully',
        subscription: result.subscription,
        giftCode
      }
    } catch (error) {
      console.error('Claim gift code error:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to claim gift code'
      }
    }
  },

  /**
   * Get gift code by code string
   */
  async getGiftCodeByCode(code: string) {
    const [giftCode] = await db
      .select()
      .from(giftCodes)
      .where(eq(giftCodes.code, code.toUpperCase()))
      .limit(1)

    return giftCode || null
  },

  /**
   * Check if user has already claimed a gift code
   */
  async hasUserClaimedCode(codeId: number, userId: number) {
    const [redemption] = await db
      .select()
      .from(giftRedemptions)
      .where(
        and(
          eq(giftRedemptions.giftCodeId, codeId),
          eq(giftRedemptions.userId, userId)
        )
      )
      .limit(1)

    return !!redemption
  },

  /**
   * Get plan by ID
   */
  async getPlanById(planId: number) {
    const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
    return plan || null
  },

  /**
   * Get default server (first active public server)
   */
  async getDefaultServer() {
    const [server] = await db
      .select()
      .from(servers)
      .where(
        and(
          eq(servers.status, 'active'),
          eq(servers.isPublic, true)
        )
      )
      .orderBy((servers) => servers.priority)
      .limit(1)

    return server || null
  }
}
