import { eq, and, desc, asc, sql, inArray, isNull, isNotNull, or } from 'drizzle-orm'
import { db } from './index'
import * as schema from './schema/index'
import type { NewAuditLog } from './schema/index'
import type { NewManualPayment } from './schema/index'

// ============================================================================
// User Queries
// ============================================================================

export const userQueries = {
  // Find user by Telegram ID
  findByTelegramId: async (telegramId: number) => {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.telegramId, telegramId))
      .limit(1)
    return user || null
  },

  // Find user by referral code
  findByReferralCode: async (referralCode: string) => {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.referralCode, referralCode))
      .limit(1)
    return user || null
  },

  // Find user by ID
  findById: async (id: number) => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)
    return user || null
  },

  // Get active users count
  getActiveCount: async () => {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(eq(schema.users.status, 'active'))
    return result?.count || 0
  },

  // Get users with pagination
  getPaginated: async (limit: number, offset: number, status?: string) => {
    const where = status ? eq(schema.users.status, status as any) : undefined
    return await db
      .select()
      .from(schema.users)
      .where(where)
      .orderBy(desc(schema.users.createdAt))
      .limit(limit)
      .offset(offset)
  },

  // Update last activity
  updateLastActivity: async (userId: number) => {
    await db
      .update(schema.users)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
  }
}

// ============================================================================
// Server Queries
// ============================================================================

export const serverQueries = {
  // Get all active servers
  getActive: async () => {
    return await db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.status, 'active'))
      .orderBy(desc(schema.servers.priority))
  },

  // Get public active servers
  getPublicActive: async () => {
    return await db
      .select()
      .from(schema.servers)
      .where(and(eq(schema.servers.status, 'active'), eq(schema.servers.isPublic, true)))
      .orderBy(desc(schema.servers.priority))
  },

  // Find server by ID
  findById: async (id: number) => {
    const [server] = await db.select().from(schema.servers).where(eq(schema.servers.id, id)).limit(1)
    return server || null
  },

  // Find server by Marzban node ID
  findByMarzbanNodeId: async (nodeId: number) => {
    const [server] = await db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.marzbanNodeId, nodeId))
      .limit(1)
    return server || null
  },

  // Get servers by region
  getByRegion: async (regionId: number) => {
    return await db
      .select()
      .from(schema.servers)
      .where(
        and(eq(schema.servers.status, 'active'), eq(schema.servers.regionId, regionId))
      )
      .orderBy(desc(schema.servers.priority))
  },

  // Update server load
  updateLoad: async (serverId: number, currentUsers: number, loadPercentage: number) => {
    await db
      .update(schema.servers)
      .set({
        currentUsers,
        loadPercentage: loadPercentage.toString(),
        updatedAt: new Date()
      })
      .where(eq(schema.servers.id, serverId))
  }
}

// ============================================================================
// VPN Account Queries
// ============================================================================

export const vpnAccountQueries = {
  // Get VPN accounts by user
  getByUserId: async (userId: number) => {
    return await db
      .select()
      .from(schema.vpnAccounts)
      .where(eq(schema.vpnAccounts.userId, userId))
      .orderBy(desc(schema.vpnAccounts.createdAt))
  },

  // Get active VPN accounts by user
  getActiveByUserId: async (userId: number) => {
    return await db
      .select()
      .from(schema.vpnAccounts)
      .where(
        and(eq(schema.vpnAccounts.userId, userId), eq(schema.vpnAccounts.status, 'active'))
      )
      .orderBy(desc(schema.vpnAccounts.createdAt))
  },

  // Find by Marzban username
  findByMarzbanUsername: async (marzbanUsername: string) => {
    const [account] = await db
      .select()
      .from(schema.vpnAccounts)
      .where(eq(schema.vpnAccounts.marzbanUsername, marzbanUsername))
      .limit(1)
    return account || null
  },

  // Get expiring accounts
  getExpiringSoon: async (hours: number = 24) => {
    const expiresAtThreshold = new Date(Date.now() + hours * 60 * 60 * 1000)
    return await db
      .select()
      .from(schema.vpnAccounts)
      .where(
        and(
          eq(schema.vpnAccounts.status, 'active'),
          sql`${schema.vpnAccounts.expiresAt} <= ${expiresAtThreshold}`
        )
      )
      .orderBy(asc(schema.vpnAccounts.expiresAt))
  },

  // Update usage
  updateUsage: async (accountId: number, usedBytes: number) => {
    await db
      .update(schema.vpnAccounts)
      .set({ usedDataBytes: usedBytes, updatedAt: new Date() })
      .where(eq(schema.vpnAccounts.id, accountId))
  }
}

// ============================================================================
// Plan Queries
// ============================================================================

export const planQueries = {
  // Get all active public plans
  getActivePublic: async () => {
    return await db
      .select()
      .from(schema.plans)
      .where(and(eq(schema.plans.isActive, true), eq(schema.plans.isPublic, true)))
      .orderBy(desc(schema.plans.priority), asc(schema.plans.priceUsdCents))
  },

  // Get featured plans
  getFeatured: async () => {
    return await db
      .select()
      .from(schema.plans)
      .where(
        and(
          eq(schema.plans.isActive, true),
          eq(schema.plans.isPublic, true),
          eq(schema.plans.isFeatured, true)
        )
      )
      .orderBy(desc(schema.plans.priority))
  },

  // Find by ID
  findById: async (id: number) => {
    const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, id)).limit(1)
    return plan || null
  },

  // Get by type
  getByType: async (planType: string) => {
    return await db
      .select()
      .from(schema.plans)
      .where(
        and(eq(schema.plans.isActive, true), eq(schema.plans.planType, planType as any))
      )
      .orderBy(asc(schema.plans.priceUsdCents))
  }
}

// ============================================================================
// Subscription Queries
// ============================================================================

export const subscriptionQueries = {
  // Get active subscriptions by user
  getActiveByUserId: async (userId: number) => {
    return await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .orderBy(desc(schema.subscriptions.expiresAt))
  },

  // Find by ID
  findById: async (id: number) => {
    const [subscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, id))
      .limit(1)
    return subscription || null
  },

  // Get expiring subscriptions (need renewal)
  getExpiringSoon: async (days: number = 3) => {
    const expiresAtThreshold = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    return await db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.status, 'active'),
          eq(schema.subscriptions.autoRenew, true),
          sql`${schema.subscriptions.expiresAt} <= ${expiresAtThreshold}`
        )
      )
      .orderBy(asc(schema.subscriptions.expiresAt))
  },

  // Get subscriptions that need usage alert
  getNeedingUsageAlert: async (threshold: number = 80) => {
    return await db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.status, 'active'),
          isNotNull(schema.subscriptions.dataLimitGb),
          sql`(${schema.subscriptions.usedDataGb}::float / NULLIF(${schema.subscriptions.dataLimitGb}::float, 0) * 100) >= ${threshold}`
        )
      )
  },

  // Update usage
  updateUsage: async (subscriptionId: number, usedGb: number) => {
    await db
      .update(schema.subscriptions)
      .set({ usedDataGb: usedGb, updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, subscriptionId))
  }
}

// ============================================================================
// Wallet Queries
// ============================================================================

export const walletQueries = {
  // Get wallet by user ID
  getByUserId: async (userId: number) => {
    const [wallet] = await db
      .select()
      .from(schema.wallets)
      .where(eq(schema.wallets.userId, userId))
      .limit(1)
    return wallet || null
  },

  // Create wallet for user
  create: async (userId: number, currency: string = 'USD') => {
    const [wallet] = await db
      .insert(schema.wallets)
      .values({
        userId,
        currency,
        balanceCents: 0,
        creditLimitCents: 0,
        frozenBalanceCents: 0,
        isActive: true,
        isFrozen: false
      })
      .returning()
    return wallet
  },

  // Update balance
  updateBalance: async (
    walletId: number,
    balanceCents: number,
    amountCents: number,
    type: 'credit' | 'debit'
  ) => {
    const operator = type === 'credit' ? sql`+` : sql`-`
    await db.execute(
      sql`UPDATE wallets SET
         balance_cents = balance_cents ${operator} ${amountCents},
         updated_at = NOW()
         WHERE id = ${walletId}
         AND balance_cents = ${balanceCents}`
    )
  }
}

// ============================================================================
// Payment Queries
// ============================================================================

export const paymentQueries = {
  // Get pending payments
  getPending: async () => {
    return await db
      .select()
      .from(schema.paymentLogs)
      .where(
        and(
          inArray(schema.paymentLogs.status, ['pending', 'processing'] as any[]),
          sql`${schema.paymentLogs.createdAt} > NOW() - INTERVAL '7 days'`
        )
      )
      .orderBy(asc(schema.paymentLogs.createdAt))
  },

  // Find by ID
  findById: async (id: number) => {
    const [payment] = await db
      .select()
      .from(schema.paymentLogs)
      .where(eq(schema.paymentLogs.id, id))
      .limit(1)
    return payment || null
  },

  // Find by provider invoice ID
  findByProviderInvoiceId: async (providerInvoiceId: string, provider: string) => {
    const [payment] = await db
      .select()
      .from(schema.paymentLogs)
      .where(
        and(
          eq(schema.paymentLogs.providerInvoiceId, providerInvoiceId),
          eq(schema.paymentLogs.provider, provider as any)
        )
      )
      .limit(1)
    return payment || null
  },

  // Get expired pending payments
  getExpiredPending: async () => {
    return await db
      .select()
      .from(schema.paymentLogs)
      .where(
        and(
          eq(schema.paymentLogs.status, 'pending'),
          isNotNull(schema.paymentLogs.expiredAt),
          sql`${schema.paymentLogs.expiredAt} < NOW()`
        )
      )
  },

  // Update status
  updateStatus: async (paymentId: number, status: string, confirmedAt?: Date) => {
    await db
      .update(schema.paymentLogs)
      .set({
        status: status as any,
        confirmedAt: confirmedAt || null,
        updatedAt: new Date()
      })
      .where(eq(schema.paymentLogs.id, paymentId))
  }
}

// ============================================================================
// Referral Queries
// ============================================================================

export const referralQueries = {
  // Get referrals by referrer
  getByReferrerId: async (referrerId: number) => {
    return await db
      .select()
      .from(schema.referrals)
      .where(eq(schema.referrals.referrerId, referrerId))
      .orderBy(desc(schema.referrals.createdAt))
  },

  // Get pending referrals
  getPending: async () => {
    return await db
      .select()
      .from(schema.referrals)
      .where(
        and(
          eq(schema.referrals.status, 'pending'),
          isNotNull(schema.referrals.expiresAt),
          sql`${schema.referrals.expiresAt} > NOW()`
        )
      )
  },

  // Find by referrer and referred
  findByReferrerAndReferred: async (referrerId: number, referredId: number) => {
    const [referral] = await db
      .select()
      .from(schema.referrals)
      .where(
        and(
          eq(schema.referrals.referrerId, referrerId),
          eq(schema.referrals.referredId, referredId)
        )
      )
      .limit(1)
    return referral || null
  }
}

// ============================================================================
// Device Queries
// ============================================================================

export const deviceQueries = {
  // Get devices by user
  getByUserId: async (userId: number) => {
    return await db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.userId, userId))
      .orderBy(desc(schema.devices.lastActivityAt))
  },

  // Get connected devices by user
  getConnectedByUserId: async (userId: number) => {
    return await db
      .select()
      .from(schema.devices)
      .where(
        and(eq(schema.devices.userId, userId), eq(schema.devices.isConnected, true))
      )
      .orderBy(desc(schema.devices.lastConnectedAt))
  },

  // Find by fingerprint
  findByFingerprint: async (fingerprint: string) => {
    return await db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.deviceFingerprint, fingerprint))
      .orderBy(desc(schema.devices.lastActivityAt))
  },

  // Count active devices for user
  countActiveByUserId: async (userId: number) => {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.devices)
      .where(
        and(eq(schema.devices.userId, userId), eq(schema.devices.isConnected, true))
      )
    return result?.count || 0
  }
}

// ============================================================================
// Test Account Queries
// ============================================================================

export const testAccountQueries = {
  // Get active test accounts by user
  getActiveByUserId: async (userId: number) => {
    return await db
      .select()
      .from(schema.testAccounts)
      .where(eq(schema.testAccounts.userId, userId))
      .orderBy(desc(schema.testAccounts.createdAt))
  },

  // Get expiring test accounts
  getExpiringSoon: async (minutes: number = 60) => {
    const expiresAtThreshold = new Date(Date.now() + minutes * 60 * 1000)
    return await db
      .select()
      .from(schema.testAccounts)
      .where(
        and(
          eq(schema.testAccounts.status, 'active'),
          sql`${schema.testAccounts.expiresAt} <= ${expiresAtThreshold}`
        )
      )
      .orderBy(asc(schema.testAccounts.expiresAt))
  },

  // Count active test accounts for user
  countActiveByUserId: async (userId: number) => {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.testAccounts)
      .where(and(eq(schema.testAccounts.userId, userId), eq(schema.testAccounts.status, 'active')))
    return result?.count || 0
  }
}

// ============================================================================
// Audit Log Queries
// ============================================================================

export const auditLogQueries = {
  // Create audit log
  create: async (log: NewAuditLog) => {
    const [auditLog] = await db.insert(schema.auditLogs).values(log).returning()
    return auditLog
  },

  // Get recent logs by actor
  getRecentByActor: async (actorType: string, actorId: number, limit: number = 100) => {
    return await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.actorType, actorType as any),
          eq(schema.auditLogs.actorId, actorId)
        )
      )
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit)
  },

  // Get failed actions (security monitoring)
  getRecentFailed: async (limit: number = 50) => {
    return await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.status, 'failed'))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit)
  }
}

// ============================================================================
// Manual Payment Queries
// ============================================================================

export const manualPaymentQueries = {
  // Create manual payment
  create: async (payment: NewManualPayment) => {
    const [newPayment] = await db.insert(schema.manualPayments).values(payment).returning()
    return newPayment
  },

  // Find by ID
  findById: async (id: number) => {
    const [payment] = await db
      .select()
      .from(schema.manualPayments)
      .where(eq(schema.manualPayments.id, id))
      .limit(1)
    return payment || null
  },

  // Get pending payments (for admin verification)
  getPending: async (limit: number = 50, offset: number = 0) => {
    return await db
      .select({
        payment: schema.manualPayments,
        user: schema.users,
        plan: schema.plans
      })
      .from(schema.manualPayments)
      .innerJoin(schema.users, eq(schema.manualPayments.userId, schema.users.id))
      .innerJoin(schema.plans, eq(schema.manualPayments.planId, schema.plans.id))
      .where(
        and(
          eq(schema.manualPayments.status, 'pending'),
          isNotNull(schema.manualPayments.screenshotFileId)
        )
      )
      .orderBy(desc(schema.manualPayments.createdAt))
      .limit(limit)
      .offset(offset)
  },

  // Get user payments
  getByUserId: async (userId: number) => {
    return await db
      .select({
        payment: schema.manualPayments,
        plan: schema.plans
      })
      .from(schema.manualPayments)
      .innerJoin(schema.plans, eq(schema.manualPayments.planId, schema.plans.id))
      .where(eq(schema.manualPayments.userId, userId))
      .orderBy(desc(schema.manualPayments.createdAt))
  },

  // Get pending payment count
  getPendingCount: async () => {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.manualPayments)
      .where(
        and(
          eq(schema.manualPayments.status, 'pending'),
          isNotNull(schema.manualPayments.screenshotFileId)
        )
      )
    return result?.count || 0
  },

  // Update payment status (approve/reject)
  updateStatus: async (
    paymentId: number,
    status: 'approved' | 'rejected' | 'expired',
    verifiedBy?: number,
    adminNote?: string,
    rejectionReason?: string,
    subscriptionId?: number
  ) => {
    const [updated] = await db
      .update(schema.manualPayments)
      .set({
        status,
        verifiedBy,
        verifiedAt: new Date(),
        adminNote,
        rejectionReason,
        subscriptionId,
        updatedAt: new Date()
      })
      .where(eq(schema.manualPayments.id, paymentId))
      .returning()
    return updated || null
  },

  // Attach screenshot to payment
  attachScreenshot: async (
    paymentId: number,
    fileId: string,
    fileUniqueId: string,
    filePath: string,
    mimeType: string,
    fileSize: number
  ) => {
    const [updated] = await db
      .update(schema.manualPayments)
      .set({
        screenshotFileId: fileId,
        screenshotFileUniqueId: fileUniqueId,
        screenshotFilePath: filePath,
        screenshotMimeType: mimeType,
        screenshotFileSizeBytes: fileSize,
        screenshotReceivedAt: new Date(),
        status: 'pending',
        updatedAt: new Date()
      })
      .where(eq(schema.manualPayments.id, paymentId))
      .returning()
    return updated || null
  },

  // Set payment reference (transaction ID from user)
  setPaymentReference: async (paymentId: number, reference: string) => {
    const [updated] = await db
      .update(schema.manualPayments)
      .set({
        paymentReference: reference,
        updatedAt: new Date()
      })
      .where(eq(schema.manualPayments.id, paymentId))
      .returning()
    return updated || null
  },

  // Get expired pending payments
  getExpiredPending: async () => {
    return await db
      .select()
      .from(schema.manualPayments)
      .where(
        and(
          eq(schema.manualPayments.status, 'pending'),
          isNotNull(schema.manualPayments.expiresAt),
          sql`${schema.manualPayments.expiresAt} < NOW()`
        )
      )
  },

  // Mark payment as expired
  markAsExpired: async (paymentId: number) => {
    const [updated] = await db
      .update(schema.manualPayments)
      .set({
        status: 'expired',
        updatedAt: new Date()
      })
      .where(eq(schema.manualPayments.id, paymentId))
      .returning()
    return updated || null
  }
}
