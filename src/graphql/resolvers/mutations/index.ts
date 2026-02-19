import { Context } from '../context.js'
import { CacheInvalidation } from '@/cache/index.js'

// ============================================================================
// Mutation Implementations
// ============================================================================

export const upsertUser = async (_parent: any, args: { input: any }, ctx: Context) => {
  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq, sql } = await import('drizzle-orm')
  import { generateReferralCode } from '@/utils/referral.js'

  const { input } = args

  // Check if user exists
  const [existing] = await db.select().from(users).where(eq(users.telegramId, input.telegramId))

  if (existing) {
    // Update existing user
    const [updated] = await db
      .update(users)
      .set({
        telegramUsername: input.telegramUsername,
        telegramFirstName: input.telegramFirstName,
        telegramLastName: input.telegramLastName,
        telegramLanguageCode: input.telegramLanguageCode,
        lastActivityAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, existing.id))
      .returning()

    return updated
  }

  // Create new user
  const referralCode = input.referralCode || generateReferralCode()

  // Check if referred by someone
  let referredBy: number | null = null
  if (input.referralCode) {
    const { userQueries } = await import('@/db/queries.js')
    const referrer = await userQueries.findByReferralCode(input.referralCode)
    if (referrer) {
      referredBy = referrer.telegramId
    }
  }

  const [created] = await db
    .insert(users)
    .values({
      telegramId: input.telegramId,
      telegramUsername: input.telegramUsername,
      telegramFirstName: input.telegramFirstName,
      telegramLastName: input.telegramLastName,
      telegramLanguageCode: input.telegramLanguageCode,
      referralCode,
      referredBy,
      status: 'active',
      trustScore: '1.00',
      joinedAt: new Date(),
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    })
    .returning()

  return created
}

export const updateUser = async (_parent: any, args: { input: any }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const { input } = args

  const [updated] = await db
    .update(users)
    .set({
      ...input,
      updatedAt: new Date()
    })
    .where(eq(users.id, ctx.user.id))
    .returning()

  // Invalidate user cache
  await CacheInvalidation.invalidateUser(updated.id, updated.telegramId)

  return updated
}

export const createSubscription = async (_parent: any, args: { input: any }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { subscriptionService } = await import('@/services/subscription.js')
  return await subscriptionService.createSubscription(ctx.user, args.input)
}

export const renewSubscription = async (_parent: any, args: { subscriptionId: number }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { subscriptionService } = await import('@/services/subscription.js')
  return await subscriptionService.renewSubscription(ctx.user, args.subscriptionId)
}

export const cancelSubscription = async (_parent: any, args: { subscriptionId: number }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { subscriptionService } = await import('@/services/subscription.js')

  await subscriptionService.cancelSubscription(ctx.user, args.subscriptionId)

  return {
    success: true,
    message: 'Subscription cancelled successfully',
    errors: []
  }
}

export const updateAutoRenew = async (_parent: any, args: { subscriptionId: number; autoRenew: boolean }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { db } = await import('@/db/index.js')
  const { subscriptions } = await import('@/db/schema/index.js')
  const { eq, and } = await import('drizzle-orm')

  const [updated] = await db
    .update(subscriptions)
    .set({
      autoRenew: args.autoRenew,
      updatedAt: new Date()
    })
    .where(and(eq(subscriptions.id, args.subscriptionId), eq(subscriptions.userId, ctx.user.id)))
    .returning()

  if (!updated) {
    throw new Error('Subscription not found')
  }

  // Invalidate cache
  await CacheInvalidation.invalidateSubscription(args.subscriptionId, ctx.user.id)

  return updated
}

export const createPayment = async (_parent: any, args: { input: any }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { paymentService } = await import('@/services/payment.js')
  return await paymentService.createPayment(ctx.user, args.input)
}

export const confirmPayment = async (_parent: any, args: { provider: string; providerInvoiceId: string; status: string }, ctx: Context) => {
  // This is for webhooks - doesn't require user auth
  const { paymentService } = await import('@/services/payment.js')
  return await paymentService.confirmPayment(args.provider, args.providerInvoiceId, args.status)
}

export const addFunds = async (_parent: any, args: { amountCents: number; description: string }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { walletService } = await import('@/services/wallet.js')
  const transaction = await walletService.addFunds(
    ctx.user.id,
    args.amountCents,
    args.description || 'Manual adjustment',
    true // isManual
  )

  return transaction
}

export const createGiftCode = async (_parent: any, args: { input: any }, ctx: Context) => {
  if (!ctx.user || !ctx.isAdmin) {
    throw new Error('Admin access required')
  }

  const { giftService } = await import('@/services/gift.js')
  return await giftService.createGiftCode(ctx.user, args.input)
}

export const claimGiftCode = async (_parent: any, args: { input: any }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { giftService } = await import('@/services/gift.js')
  return await giftService.claimGiftCode(ctx.user, args.input)
}

export const createTestAccount = async (_parent: any, args: { input: any }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { testAccountService } = await import('@/services/test-account.js')
  return await testAccountService.createTestAccount(ctx.user, args.input)
}

export const convertTestAccount = async (_parent: any, args: { input: any }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { testAccountService } = await import('@/services/test-account.js')
  return await testAccountService.convertToSubscription(ctx.user, args.input)
}

export const revokeVpnAccount = async (_parent: any, args: { accountId: number }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { vpnService } = await import('@/services/vpn.js')
  return await vpnService.revokeSubscription(ctx.user, args.accountId)
}

export const resetVpnAccountUsage = async (_parent: any, args: { accountId: number }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { vpnService } = await import('@/services/vpn.js')
  return await vpnService.resetUsage(ctx.user, args.accountId)
}

export const disconnectDevice = async (_parent: any, args: { deviceId: number }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { deviceService } = await import('@/services/device.js')
  return await deviceService.disconnectDevice(ctx.user, args.deviceId)
}

export const blockDevice = async (_parent: any, args: { deviceId: number; reason: string }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { deviceService } = await import('@/services/device.js')
  return await deviceService.blockDevice(ctx.user, args.deviceId, args.reason)
}

export const markAlertAsRead = async (_parent: any, args: { alertId: number }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { db } = await import('@/db/index.js')
  const { usageAlerts } = await import('@/db/schema/index.js')
  const { eq, and } = await import('drizzle-orm')

  const [updated] = await db
    .update(usageAlerts)
    .set({ readAt: new Date() })
    .where(and(eq(usageAlerts.id, args.alertId), eq(usageAlerts.userId, ctx.user.id)))
    .returning()

  if (!updated) {
    throw new Error('Alert not found')
  }

  return updated
}

export const handleAlert = async (_parent: any, args: { alertId: number; action: string }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { db } = await import('@/db/index.js')
  const { usageAlerts } = await import('@/db/schema/index.js')
  const { eq, and } = await import('drizzle-orm')

  const [updated] = await db
    .update(usageAlerts)
    .set({
      userAction: args.action,
      actionTakenAt: new Date()
    })
    .where(and(eq(usageAlerts.id, args.alertId), eq(usageAlerts.userId, ctx.user.id)))
    .returning()

  if (!updated) {
    throw new Error('Alert not found')
  }

  return updated
}

export const updateSession = async (_parent: any, args: { data: any }, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { SessionStore } = await import('@/cache/index.js')
  await SessionStore.set(ctx.user.telegramId, args.data)

  return {
    success: true,
    message: 'Session updated',
    errors: []
  }
}

export const clearSession = async (_parent: any, _args: any, ctx: Context) => {
  if (!ctx.user) {
    throw new Error('Not authenticated')
  }

  const { SessionStore } = await import('@/cache/index.js')
  await SessionStore.delete(ctx.user.telegramId)

  return {
    success: true,
    message: 'Session cleared',
    errors: []
  }
}
