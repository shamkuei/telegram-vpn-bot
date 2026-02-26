import type { Subscription } from '@/db/schema/subscriptions'

export async function getPlan(subscription: Subscription, _args: any, _ctx: any) {
  const { db } = await import('@/db/index.js')
  const { plans } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId))
  return plan || null
}

export async function getServer(subscription: Subscription, _args: any, _ctx: any) {
  if (!subscription.serverId) return null

  const { db } = await import('@/db/index.js')
  const { servers } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [server] = await db.select().from(servers).where(eq(servers.id, subscription.serverId))
  return server || null
}

export async function getRegion(subscription: Subscription, _args: any, _ctx: any) {
  if (!subscription.regionId) return null

  const { db } = await import('@/db/index.js')
  const { serverRegions } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [region] = await db.select().from(serverRegions).where(eq(serverRegions.id, subscription.regionId))
  return region || null
}

export async function getUser(subscription: Subscription, _args: any, _ctx: any) {
  const { db } = await import('@/db/index.js')
  const { users } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [user] = await db.select().from(users).where(eq(users.id, subscription.userId))
  return user || null
}

export async function getPaymentLog(subscription: Subscription, _args: any, _ctx: any) {
  if (!subscription.paymentLogId) return null

  const { db } = await import('@/db/index.js')
  const { paymentLogs } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [payment] = await db.select().from(paymentLogs).where(eq(paymentLogs.id, subscription.paymentLogId))
  return payment || null
}

export function getDaysRemaining(subscription: Subscription) {
  const now = new Date()
  const expiresAt = new Date(subscription.expiresAt)
  const diffMs = expiresAt.getTime() - now.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

export function getIsExpiring(subscription: Subscription) {
  const daysRemaining = getDaysRemaining(subscription)
  return daysRemaining <= 3
}

export function getUsagePercentage(subscription: Subscription) {
  if (!subscription.dataLimitGb || subscription.dataLimitGb === 0) {
    return 0
  }
  return Math.min(100, Math.floor((subscription.usedDataGb / subscription.dataLimitGb) * 100))
}

export function getRemainingDataGb(subscription: Subscription) {
  if (!subscription.dataLimitGb) {
    return null
  }
  return Math.max(0, subscription.dataLimitGb - subscription.usedDataGb)
}

export function getPriceUsd(subscription: Subscription) {
  return subscription.pricePaidCents / 100
}

export async function getByVpnAccount(vpnAccount: any, _args: any, _ctx: any) {
  if (!vpnAccount.subscriptionId) return null

  const { db } = await import('@/db/index.js')
  const { subscriptions } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, vpnAccount.subscriptionId))
  return subscription || null
}

export async function getByPayment(payment: any, _args: any, _ctx: any) {
  if (!payment.subscriptionId) return null

  const { db } = await import('@/db/index.js')
  const { subscriptions } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, payment.subscriptionId))
  return subscription || null
}

export async function getByResellerTransaction(transaction: any, _args: any, _ctx: any) {
  if (!transaction.subscriptionId) return null

  const { db } = await import('@/db/index.js')
  const { subscriptions } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, transaction.subscriptionId))
  return subscription || null
}

export async function getByGiftRedemption(giftRedemption: any, _args: any, _ctx: any) {
  if (!giftRedemption.subscriptionId) return null

  const { db } = await import('@/db/index.js')
  const { subscriptions } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, giftRedemption.subscriptionId))
  return subscription || null
}

export async function getByTestAccount(testAccount: any, _args: any, _ctx: any) {
  if (!testAccount.convertedToSubscriptionId) return null

  const { db } = await import('@/db/index.js')
  const { subscriptions } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, testAccount.convertedToSubscriptionId))
  return subscription || null
}

export async function getByUsageAlert(alert: any, _args: any, _ctx: any) {
  const { db } = await import('@/db/index.js')
  const { subscriptions } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, alert.subscriptionId))
  return subscription || null
}
