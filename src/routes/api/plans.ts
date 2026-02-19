import { Hono } from 'hono'
import type { AppType } from '@/index.js'

export const planRoutes = new Hono<AppType>()

// Get all public plans
planRoutes.get('/', async (c) => {
  const { planQueries } = await import('@/db/queries.js')
  const isFeatured = c.req.query('featured') === 'true'
  const planType = c.req.query('type')

  if (isFeatured) {
    const plans = await planQueries.getFeatured()
    return c.json({ plans })
  }

  if (planType) {
    const plans = await planQueries.getByType(planType)
    return c.json({ plans })
  }

  const plans = await planQueries.getActivePublic()
  return c.json({ plans })
})

// Get plan by ID
planRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { planQueries } = await import('@/db/queries.js')
  const plan = await planQueries.findById(id)

  if (!plan) {
    return c.json({ error: 'Plan not found' }, 404)
  }

  return c.json({ plan })
})

// Validate promo code
planRoutes.post('/validate-promo', async (c) => {
  const { code, planId } = await c.req.json()

  if (!code || !planId) {
    return c.json({ error: 'code and planId are required' }, 400)
  }

  const { validatePromoCode } = await import('@/graphql/resolvers/queries/index.js')

  try {
    const promo = await validatePromoCode(null, { code, planId }, {})
    return c.json({ valid: true, promo })
  } catch (error) {
    return c.json({
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid promo code'
    })
  }
})

// Calculate price with promo code
planRoutes.post('/calculate-price', async (c) => {
  const { planId, promoCode } = await c.req.json()

  const { planQueries } = await import('@/db/queries.js')
  const plan = await planQueries.findById(planId)

  if (!plan) {
    return c.json({ error: 'Plan not found' }, 404)
  }

  let priceCents = plan.priceUsdCents
  let discountCents = 0
  let promo = null

  if (promoCode) {
    const { validatePromoCode } = await import('@/graphql/resolvers/queries/index.js')

    try {
      promo = await validatePromoCode(null, { code: promoCode, planId }, {})

      // Apply discount
      if (promo.discountType === 'PERCENTAGE') {
        discountCents = Math.floor((plan.priceUsdCents * promo.discountValue) / 100)
      } else if (promo.discountType === 'FIXED') {
        discountCents = promo.discountValue
      }

      // Apply max discount cap
      if (promo.maxDiscountCents) {
        discountCents = Math.min(discountCents, promo.maxDiscountCents)
      }

      priceCents = Math.max(0, plan.priceUsdCents - discountCents)
    } catch {
      // Invalid promo code, ignore
    }
  }

  return c.json({
    originalPriceCents: plan.priceUsdCents,
    discountCents,
    finalPriceCents: priceCents,
    originalPriceUsd: plan.priceUsdCents / 100,
    discountUsd: discountCents / 100,
    finalPriceUsd: priceCents / 100,
    promo
  })
})
