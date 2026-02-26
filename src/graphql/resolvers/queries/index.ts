import type { Context } from '@/graphql/context'

// ============================================================================
// Query Implementations
// ============================================================================

export const getMe = async (_parent: any, _args: any, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }
  return ctx.user
}

export const getUser = async (_parent: any, args: { telegramId: number }, ctx: Context) => {
  // Admin only
  if (!ctx.isAdmin) {
    throw new Error('Admin access required')
  }

  const { userQueries } = await import('@/db/queries.js')
  return await userQueries.findById(args.telegramId)
}

export const getUserByReferralCode = async (
  _parent: any,
  args: { code: string },
  ctx: Context
) => {
  const { userQueries } = await import('@/db/queries.js')
  return await userQueries.findByReferralCode(args.code)
}

export const getPlans = async (
  _parent: any,
  args: {
    isActive?: boolean
    isPublic?: boolean
    planType?: string
    isFeatured?: boolean
  },
  ctx: Context
) => {
  const { planQueries } = await import('@/db/queries.js')

  if (args.isFeatured) {
    return await planQueries.getFeatured()
  }

  if (args.planType) {
    return await planQueries.getByType(args.planType)
  }

  return await planQueries.getActivePublic()
}

export const getPlan = async (_parent: any, args: { id: number }, ctx: Context) => {
  const { planQueries } = await import('@/db/queries.js')
  return await planQueries.findById(args.id)
}

export const getServers = async (
  _parent: any,
  args: { status?: string; isPublic?: boolean; regionId?: number },
  ctx: Context
) => {
  const { serverQueries } = await import('@/db/queries.js')

  if (args.regionId) {
    return await serverQueries.getByRegion(args.regionId)
  }

  return args.isPublic ? await serverQueries.getPublicActive() : await serverQueries.getActive()
}

export const getServer = async (_parent: any, args: { id: number }, ctx: Context) => {
  const { serverQueries } = await import('@/db/queries.js')
  return await serverQueries.findById(args.id)
}

export const getRegions = async (_parent: any, _args: any, ctx: Context) => {
  const { db } = await import('@/db/index.js')
  const { serverRegions } = await import('@/db/schema/index.js')

  return await db.select().from(serverRegions).orderBy(desc => desc.priority)
}

export const getMySubscriptions = async (
  _parent: any,
  args: { status?: string },
  ctx: Context
) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { subscriptionQueries } = await import('@/db/queries.js')
  return await subscriptionQueries.getActiveByUserId(ctx.user.id)
}

export const getSubscription = async (_parent: any, args: { id: number }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { subscriptionQueries } = await import('@/db/queries.js')
  const subscription = await subscriptionQueries.findById(args.id)

  // Check ownership or admin
  if (!subscription || (subscription.userId !== ctx.user.id && !ctx.isAdmin)) {
    throw new Error('Subscription not found')
  }

  return subscription
}

export const getMyVpnAccounts = async (
  _parent: any,
  args: { status?: string },
  ctx: Context
) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { vpnAccountQueries } = await import('@/db/queries.js')
  return await vpnAccountQueries.getActiveByUserId(ctx.user.id)
}

export const getMyWallet = async (_parent: any, _args: any, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { walletQueries } = await import('@/db/queries.js')
  let wallet = await walletQueries.getByUserId(ctx.user.id)

  // Create wallet if doesn't exist
  if (!wallet) {
    wallet = await walletQueries.create(ctx.user.id)
  }

  return wallet
}

export const getMyTransactions = async (
  _parent: any,
  args: { type?: string; status?: string; limit?: number; offset?: number },
  ctx: Context
) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { db } = await import('@/db/index.js')
  const { walletTransactions, wallets } = await import('@/db/schema/index.js')
  const { eq, desc, and } = await import('drizzle-orm')

  // Get user's wallet
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, ctx.user.id))

  if (!wallet) {
    return []
  }

  let whereClause = eq(walletTransactions.walletId, wallet.id)

  if (args.type) {
    whereClause = and(whereClause, eq(walletTransactions.type, args.type as any))
  }

  if (args.status) {
    whereClause = and(whereClause, eq(walletTransactions.status, args.status as any))
  }

  return await db
    .select()
    .from(walletTransactions)
    .where(whereClause)
    .orderBy(desc(walletTransactions.createdAt))
    .limit(args.limit || 50)
    .offset(args.offset || 0)
}

export const getPayment = async (_parent: any, args: { id: number }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { paymentQueries } = await import('@/db/queries.js')
  const payment = await paymentQueries.findById(args.id)

  // Check ownership or admin
  if (!payment || (payment.userId !== ctx.user.id && !ctx.isAdmin)) {
    throw new Error('Payment not found')
  }

  return payment
}

export const getMyReferrals = async (
  _parent: any,
  args: { status?: string },
  ctx: Context
) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { referralQueries } = await import('@/db/queries.js')
  return await referralQueries.getByReferrerId(ctx.user.telegramId)
}

export const getReferralByCode = async (_parent: any, args: { code: string }, ctx: Context) => {
  const { db } = await import('@/db/index.js')
  const { referrals } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [referral] = await db.select().from(referrals).where(eq(referrals.referralCode, args.code))

  if (!referral) {
    throw new Error('Referral code not found')
  }

  return referral
}

export const validatePromoCode = async (
  _parent: any,
  args: { code: string; planId: number },
  ctx: Context
) => {
  const { db } = await import('@/db/index.js')
  const { promoCodes } = await import('@/db/schema/index.js')
  const { eq, and, gt, or } = await import('drizzle-orm')

  const now = new Date()

  const [promo] = await db
    .select()
    .from(promoCodes)
    .where(
      and(
        eq(promoCodes.code, args.code),
        eq(promoCodes.isActive, true),
        or(
          isNull(promoCodes.validUntil),
          gt(promoCodes.validUntil, now)
        )
      )
    )

  if (!promo) {
    throw new Error('Invalid or expired promo code')
  }

  // Check if applies to plan
  if (promo.appliesToPlanIds && promo.appliesToPlanIds.length > 0) {
    if (!promo.appliesToPlanIds.includes(args.planId)) {
      throw new Error('Promo code not applicable to this plan')
    }
  }

  // Check usage limits
  if (promo.maxUses && promo.usedCount >= promo.maxUses) {
    throw new Error('Promo code has reached maximum uses')
  }

  // Check per-user limit (if authenticated)
  if (ctx.user && promo.maxUsesPerUser > 0) {
    const { db } = await import('@/db/index.js')
    const { paymentLogs } = await import('@/db/schema/index.js')

    const userPayments = await db
      .select()
      .from(paymentLogs)
      .where(
        and(
          eq(paymentLogs.userId, ctx.user.id),
          sql`${paymentLogs.metadata}->>'promo_code' = ${args.code}`
        )
      )

    if (userPayments.length >= promo.maxUsesPerUser) {
      throw new Error('You have already used this promo code the maximum number of times')
    }
  }

  return promo
}

export const getMyDevices = async (_parent: any, _args: any, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { deviceQueries } = await import('@/db/queries.js')
  return await deviceQueries.getByUserId(ctx.user.id)
}

export const getMyTestAccounts = async (
  _parent: any,
  args: { status?: string },
  ctx: Context
) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { testAccountQueries } = await import('@/db/queries.js')
  return await testAccountQueries.getActiveByUserId(ctx.user.id)
}

export const getMyUsageAlerts = async (
  _parent: any,
  args: { unreadOnly?: boolean },
  ctx: Context
) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { db } = await import('@/db/index.js')
  const { usageAlerts } = await import('@/db/schema/index.js')
  const { eq, desc, isNull, and } = await import('drizzle-orm')

  let whereClause = eq(usageAlerts.userId, ctx.user.id)

  if (args.unreadOnly) {
    whereClause = and(whereClause, isNull(usageAlerts.readAt))
  }

  return await db
    .select()
    .from(usageAlerts)
    .where(whereClause)
    .orderBy(desc(usageAlerts.createdAt))
    .limit(50)
}

export const getMyReseller = async (_parent: any, _args: any, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  if (!ctx.user.isReseller) {
    return null
  }

  const { db } = await import('@/db/index.js')
  const { resellers } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [reseller] = await db.select().from(resellers).where(eq(resellers.userId, ctx.user.id))

  return reseller || null
}

export const getResellerTransactions = async (
  _parent: any,
  args: { status?: string },
  ctx: Context
) => {
  if (!ctx.user || !ctx.user.isReseller) {
    throw new Error('Reseller access required')
  }

  const { db } = await import('@/db/index.js')
  const { resellerTransactions, resellers } = await import('@/db/schema/index.js')
  const { eq, desc, and } = await import('drizzle-orm')

  const [reseller] = await db.select().from(resellers).where(eq(resellers.userId, ctx.user.id))

  if (!reseller) {
    return []
  }

  let whereClause = eq(resellerTransactions.resellerId, reseller.id)

  if (args.status) {
    whereClause = and(whereClause, eq(resellerTransactions.status, args.status as any))
  }

  return await db
    .select()
    .from(resellerTransactions)
    .where(whereClause)
    .orderBy(desc(resellerTransactions.createdAt))
    .limit(100)
}

export const getAuditLogs = async (
  _parent: any,
  args: {
    actorType?: string
    actorId?: number
    entityType?: string
    limit?: number
    offset?: number
  },
  ctx: Context
) => {
  if (!ctx.isAdmin) {
    throw new Error('Admin access required')
  }

  const { auditLogQueries } = await import('@/db/queries.js')

  if (args.actorType && args.actorId) {
    return await auditLogQueries.getRecentByActor(args.actorType, args.actorId, args.limit)
  }

  return await auditLogQueries.getRecentFailed(args.limit)
}
