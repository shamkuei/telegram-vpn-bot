import { db, withTransaction } from '@/db/index'
import { testAccounts, subscriptions, vpnAccounts, plans, servers } from '@/db/schema/index'
import { eq, and, sql, desc, asc } from 'drizzle-orm'
import { marzban } from '@/marzban/index'

// ============================================================================
// Types
// ============================================================================

export interface CreateTestAccountInput {
  planId: number
  serverId: number
}

export interface CreateTestAccountResult {
  success: boolean
  message: string
  testAccount?: any
  vpnAccount?: any
}

export interface ConvertTestAccountInput {
  testAccountId: number
  planId: number
}

export interface ConvertTestAccountResult {
  success: boolean
  message: string
  subscription?: any
  vpnAccount?: any
}

// ============================================================================
// Test Account Service
// ============================================================================

export const testAccountService = {
  /**
   * Create a test account for a user
   */
  async createTestAccount(user: any, input: CreateTestAccountInput): Promise<CreateTestAccountResult> {
    try {
      // Check if user has reached their test account limit
      const activeCount = await this.countActiveByUserId(user.id)

      // Get plan to check max test accounts
      const plan = await this.getPlanById(input.planId)
      if (!plan) {
        return {
          success: false,
          message: 'Plan not found'
        }
      }

      const maxTestAccounts = plan.maxTestAccountsPerUser || 3

      if (activeCount >= maxTestAccounts) {
        return {
          success: false,
          message: `You have reached your test account limit (${maxTestAccounts})`
        }
      }

      // Check if user has an active test account already
      const existingActive = await this.getActiveByUserId(user.id)
      if (existingActive.length > 0) {
        const latest = existingActive[0]
        const remainingMinutes = Math.max(
          0,
          Math.floor((new Date(latest.expiresAt).getTime() - Date.now()) / 60000)
        )

        if (remainingMinutes > 0) {
          return {
            success: false,
            message: `You already have an active test account with ${remainingMinutes} minutes remaining`
          }
        }
      }

      // Get server
      const server = await this.getServerById(input.serverId)
      if (!server) {
        return {
          success: false,
          message: 'Server not found'
        }
      }

      // Create test account (60 minutes default)
      const durationMinutes = 60
      const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000)

      const [testAccount] = await db.insert(testAccounts).values({
        userId: user.id,
        planId: input.planId,
        serverId: input.serverId,
        status: 'active',
        durationMinutes,
        dataLimitBytes: plan.dataLimitGb ? Math.floor(plan.dataLimitGb * 1_000_000_000 / 10) : null, // 10% of plan limit
        usedDataBytes: 0,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning()

      // Create Marzban user for test
      const marzbanUsername = `test_${user.telegramId}_${Date.now()}`
      const marzbanUser = await marzban.createUser({
        username: marzbanUsername,
        status: 'active',
        expire: Math.floor(expiresAt.getTime() / 1000),
        data_limit: plan.dataLimitGb ? Math.floor(plan.dataLimitGb * 1_000_000_000 / 10) : 0,
        data_limit_reset_strategy: 'no_reset',
        proxies: { vmess: {}, vless: {} },
        inbounds: {
          vmess: server.marzbanNodeName ? [server.marzbanNodeName] : [],
          vless: server.marzbanNodeName ? [server.marzbanNodeName] : []
        }
      })

      // Create VPN account for test
      const [vpnAccount] = await db.insert(vpnAccounts).values({
        userId: user.id,
        serverId: input.serverId,
        accountName: `Test Account - ${plan.name}`,
        accountKey: crypto.randomUUID(),
        marzbanUsername: marzbanUser.username,
        marzbanToken: crypto.randomUUID(),
        marzbanSubscriptionUrl: marzbanUser.subscription_url,
        status: 'active',
        dataLimitBytes: plan.dataLimitGb ? Math.floor(plan.dataLimitGb * 1_000_000_000 / 10) : null,
        usedDataBytes: 0,
        expiresAt,
        testAccountId: testAccount.id,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning()

      return {
        success: true,
        message: 'Test account created successfully',
        testAccount: { ...testAccount, server, plan },
        vpnAccount
      }
    } catch (error) {
      console.error('Create test account error:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create test account'
      }
    }
  },

  /**
   * Convert test account to full subscription
   */
  async convertToSubscription(user: any, input: ConvertTestAccountInput): Promise<ConvertTestAccountResult> {
    try {
      // Get test account
      const testAccount = await this.findById(input.testAccountId)

      if (!testAccount) {
        return {
          success: false,
          message: 'Test account not found'
        }
      }

      if (testAccount.userId !== user.id) {
        return {
          success: false,
          message: 'Test account does not belong to you'
        }
      }

      if (testAccount.status !== 'active') {
        return {
          success: false,
          message: 'Test account is not active'
        }
      }

      // Get plan
      const plan = await this.getPlanById(input.planId)
      if (!plan) {
        return {
          success: false,
          message: 'Plan not found'
        }
      }

      // Get server from test account
      const server = await this.getServerById(testAccount.serverId)
      if (!server) {
        return {
          success: false,
          message: 'Server not found'
        }
      }

      // Create subscription within transaction
      const result = await withTransaction(async (tx) => {
        // Calculate expiration
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + plan.durationDays)

        // Create subscription
        const [subscription] = await tx.insert(subscriptions).values({
          userId: user.id,
          planId: plan.id,
          serverId: server.id,
          status: 'active',
          startedAt: new Date(),
          expiresAt,
          autoRenew: false,
          dataLimitGb: plan.dataLimitGb ? (plan.dataLimitGb * 1_000_000_000).toString() : null,
          usedDataGb: 0,
          deviceLimit: plan.deviceLimit,
          pricePaidCents: 0, // Free conversion from test account
          currency: 'USD',
          createdAt: new Date(),
          updatedAt: new Date()
        }).returning()

        // Update test account status
        await tx.update(testAccounts)
          .set({
            status: 'converted',
            subscriptionId: subscription.id,
            convertedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(testAccounts.id, input.testAccountId))

        // Update existing VPN account
        const [vpnAccount] = await tx.update(vpnAccounts)
          .set({
            subscriptionId: subscription.id,
            accountName: `${plan.name} - ${server.city}`,
            dataLimitBytes: plan.dataLimitGb ? plan.dataLimitGb * 1_000_000_000 : null,
            expiresAt,
            updatedAt: new Date()
          })
          .where(eq(vpnAccounts.testAccountId, input.testAccountId))
          .returning()

        // Update Marzban user
        if (vpnAccount.marzbanUsername) {
          await marzban.updateUser(vpnAccount.marzbanUsername, {
            expire: Math.floor(expiresAt.getTime() / 1000),
            data_limit: plan.dataLimitGb ? plan.dataLimitGb * 1_000_000_000 : 0
          })
        }

        return { subscription, vpnAccount }
      })

      return {
        success: true,
        message: 'Test account converted to subscription successfully',
        subscription: result.subscription,
        vpnAccount: result.vpnAccount
      }
    } catch (error) {
      console.error('Convert test account error:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to convert test account'
      }
    }
  },

  /**
   * Get active test accounts by user
   */
  async getActiveByUserId(userId: number) {
    return await db
      .select()
      .from(testAccounts)
      .where(
        and(
          eq(testAccounts.userId, userId),
          eq(testAccounts.status, 'active')
        )
      )
      .orderBy(desc(testAccounts.createdAt))
  },

  /**
   * Count active test accounts for user
   */
  async countActiveByUserId(userId: number) {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(testAccounts)
      .where(
        and(
          eq(testAccounts.userId, userId),
          eq(testAccounts.status, 'active')
        )
      )

    return result?.count || 0
  },

  /**
   * Get expiring test accounts
   */
  async getExpiringSoon(minutes: number = 10) {
    const expiresAtThreshold = new Date(Date.now() + minutes * 60 * 1000)

    return await db
      .select()
      .from(testAccounts)
      .where(
        and(
          eq(testAccounts.status, 'active'),
          sql`${testAccounts.expiresAt} <= ${expiresAtThreshold}`
        )
      )
      .orderBy(asc(testAccounts.expiresAt))
  },

  /**
   * Mark expired test accounts
   */
  async markExpired() {
    const expired = await this.getExpired()

    for (const account of expired) {
      await db.update(testAccounts)
        .set({
          status: 'expired',
          updatedAt: new Date()
        })
        .where(eq(testAccounts.id, account.id))

      // Disable Marzban user
      const vpnAccount = await this.getVpnAccountByTestId(account.id)
      if (vpnAccount?.marzbanUsername) {
        try {
          await marzban.updateUser(vpnAccount.marzbanUsername, { status: 'disabled' })
        } catch (error) {
          console.error('Failed to disable Marzban user:', error)
        }
      }
    }

    return expired.length
  },

  /**
   * Find test account by ID
   */
  async findById(id: number) {
    const [account] = await db.select().from(testAccounts).where(eq(testAccounts.id, id)).limit(1)
    return account || null
  },

  /**
   * Get plan by ID
   */
  async getPlanById(planId: number) {
    const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
    return plan || null
  },

  /**
   * Get server by ID
   */
  async getServerById(serverId: number) {
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1)
    return server || null
  },

  /**
   * Get expired test accounts
   */
  async getExpired() {
    return await db
      .select()
      .from(testAccounts)
      .where(
        and(
          eq(testAccounts.status, 'active'),
          sql`${testAccounts.expiresAt} < NOW()`
        )
      )
  },

  /**
   * Get VPN account by test account ID
   */
  async getVpnAccountByTestId(testAccountId: number) {
    const [vpnAccount] = await db
      .select()
      .from(vpnAccounts)
      .where(eq(vpnAccounts.testAccountId, testAccountId))
      .limit(1)

    return vpnAccount || null
  }
}
