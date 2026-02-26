import type { Plan } from '@/db/schema/plans'

export async function getAllowedRegions(plan: Plan, _args: any, _ctx: any) {
  if (!plan.allowedRegionIds || plan.allowedRegionIds.length === 0) {
    return []
  }

  const { db } = await import('@/db/index.js')
  const { serverRegions } = await import('@/db/schema/index.js')
  const { inArray } = await import('drizzle-orm')

  return await db.select().from(serverRegions).where(inArray(serverRegions.id, plan.allowedRegionIds))
}

export async function getAllowedServers(plan: Plan, _args: any, _ctx: any) {
  if (!plan.allowedServerIds || plan.allowedServerIds.length === 0) {
    return []
  }

  const { db } = await import('@/db/index.js')
  const { servers } = await import('@/db/schema/index.js')
  const { inArray } = await import('drizzle-orm')

  return await db.select().from(servers).where(inArray(servers.id, plan.allowedServerIds))
}

export function getPriceUsd(plan: Plan) {
  return plan.priceUsdCents / 100
}

export function getDataLimit(plan: Plan) {
  return plan.dataLimitGb ? plan.dataLimitGb * 1_000_000_000 : null
}

export async function getByGiftCode(giftCode: any, _args: any, _ctx: any) {
  const { db } = await import('@/db/index.js')
  const { plans } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [plan] = await db.select().from(plans).where(eq(plans.id, giftCode.planId))
  return plan || null
}

export async function getByPromoCode(promoCode: any, _args: any, _ctx: any) {
  if (!promoCode.appliesToPlanIds || promoCode.appliesToPlanIds.length === 0) {
    return []
  }

  const { db } = await import('@/db/index.js')
  const { plans } = await import('@/db/schema/index.js')
  const { inArray } = await import('drizzle-orm')

  return await db.select().from(plans).where(inArray(plans.id, promoCode.appliesToPlanIds))
}
