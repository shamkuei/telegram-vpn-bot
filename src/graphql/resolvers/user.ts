import { User } from '@/db/schema/index.js'
import { Context } from '../context.js'

// ============================================================================
// User Field Resolvers
// ============================================================================

export async function getWallet(user: User, _args: any, _ctx: Context) {
  const { walletQueries } = await import('@/db/queries.js')
  let wallet = await walletQueries.getByUserId(user.id)

  if (!wallet) {
    wallet = await walletQueries.create(user.id)
  }

  return wallet
}

export async function getSubscriptions(user: User, _args: any, _ctx: Context) {
  const { subscriptionQueries } = await import('@/db/queries.js')
  return await subscriptionQueries.getActiveByUserId(user.id)
}

export async function getVpnAccounts(user: User, _args: any, _ctx: Context) {
  const { vpnAccountQueries } = await import('@/db/queries.js')
  return await vpnAccountQueries.getActiveByUserId(user.id)
}

export async function getDevices(user: User, _args: any, _ctx: Context) {
  const { deviceQueries } = await import('@/db/queries.js')
  return await deviceQueries.getByUserId(user.id)
}

export async function getActiveTestAccounts(user: User, _args: any, _ctx: Context) {
  const { testAccountQueries } = await import('@/db/queries.js')
  return await testAccountQueries.getActiveByUserId(user.id)
}

export async function getReferralsAsReferrer(user: User, _args: any, _ctx: Context) {
  const { referralQueries } = await import('@/db/queries.js')
  return await referralQueries.getByReferrerId(user.telegramId)
}

export async function getReferralAsReferred(user: User, _args: any, _ctx: Context) {
  if (!user.referredBy) return null

  const { referralQueries } = await import('@/db/queries.js')
  const { referralQueries } = await import('@/db/queries.js')
  const { db } = await import('@/db/index.js')
  const { referrals } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [referral] = await db.select().from(referrals).where(eq(referrals.referredId, user.telegramId))
  return referral || null
}

export async function getReseller(user: User, _args: any, _ctx: Context) {
  if (!user.isReseller) return null

  const { db } = await import('@/db/index.js')
  const { resellers } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [reseller] = await db.select().from(resellers).where(eq(resellers.userId, user.id))
  return reseller || null
}

export async function getByVpnAccount(vpnAccount: any, _args: any, _ctx: Context) {
  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, vpnAccount.userId))
  return user
}

export async function getByWallet(wallet: any, _args: any, _ctx: Context) {
  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, wallet.userId))
  return user
}

export async function getByTransaction(transaction: any, _args: any, _ctx: Context) {
  if (!transaction.adminId) return null

  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, transaction.adminId))
  return user
}

export async function getByPayment(payment: any, _args: any, _ctx: Context) {
  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, payment.userId))
  return user
}

export async function getByReferral(referral: any, _args: any, _ctx: Context) {
  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.telegramId, referral.referrerId))
  return user
}

export async function getByReferred(referral: any, _args: any, _ctx: Context) {
  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.telegramId, referral.referredId))
  return user
}

export async function getByGiftCode(giftCode: any, _args: any, _ctx: Context) {
  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, giftCode.createdBy))
  return user
}

export async function getByGiftRedemption(giftRedemption: any, _args: any, _ctx: Context) {
  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, giftRedemption.userId))
  return user
}

export async function getByReseller(reseller: any, _args: any, _ctx: Context) {
  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, reseller.userId))
  return user
}

export async function getByResellerApproval(reseller: any, _args: any, _ctx: Context) {
  if (!reseller.approvedBy) return null

  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, reseller.approvedBy))
  return user
}

export async function getByResellerTransaction(transaction: any, _args: any, _ctx: Context) {
  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, transaction.customerId))
  return user
}

export async function getByDevice(device: any, _args: any, _ctx: Context) {
  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, device.userId))
  return user
}

export async function getByTestAccount(testAccount: any, _args: any, _ctx: Context) {
  if (!testAccount.convertedToSubscriptionId) return null

  const { db } = await import('@/db/index.js')
  const { subscriptions } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, testAccount.convertedToSubscriptionId))
  return subscription
}

export async function getByUsageAlert(alert: any, _args: any, _ctx: Context) {
  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, alert.userId))
  return user
}

export async function getByPromoCode(promoCode: any, _args: any, _ctx: Context) {
  if (!promoCode.createdBy) return null

  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, promoCode.createdBy))
  return user
}

export async function getByAuditLog(auditLog: any, _args: any, _ctx: Context) {
  if (!auditLog.actorId) return null

  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, auditLog.actorId))
  return user
}
