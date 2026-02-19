import { Hono } from 'hono'
import type { AppType } from '@/index.js'

export const subscriptionRoutes = new Hono<AppType>()

// Get user's subscriptions
subscriptionRoutes.get('/', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const { subscriptionQueries } = await import('@/db/queries.js')
  const subscriptions = await subscriptionQueries.getActiveByUserId(user.id)

  return c.json({ subscriptions })
})

// Get subscription by ID
subscriptionRoutes.get('/:id', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const id = parseInt(c.req.param('id'))
  const { subscriptionQueries } = await import('@/db/queries.js')
  const subscription = await subscriptionQueries.findById(id)

  if (!subscription || subscription.userId !== user.id) {
    return c.json({ error: 'Subscription not found' }, 404)
  }

  return c.json({ subscription })
})

// Create subscription
subscriptionRoutes.post('/', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const body = await c.req.json()
  const { createSubscription } = await import('@/graphql/resolvers/mutations/index.js')

  try {
    const result = await createSubscription(null, { input: body }, { user })
    return c.json(result)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Creation failed' }, 400)
  }
})

// Renew subscription
subscriptionRoutes.post('/:id/renew', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const id = parseInt(c.req.param('id'))
  const { renewSubscription } = await import('@/graphql/resolvers/mutations/index.js')

  try {
    const result = await renewSubscription(null, { subscriptionId: id }, { user })
    return c.json(result)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Renewal failed' }, 400)
  }
})

// Cancel subscription
subscriptionRoutes.post('/:id/cancel', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const id = parseInt(c.req.param('id'))
  const { cancelSubscription } = await import('@/graphql/resolvers/mutations/index.js')

  try {
    const result = await cancelSubscription(null, { subscriptionId: id }, { user })
    return c.json(result)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Cancellation failed' }, 400)
  }
})

// Update auto-renew
subscriptionRoutes.put('/:id/auto-renew', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const id = parseInt(c.req.param('id'))
  const { autoRenew } = await c.req.json()

  const { db } = await import('@/db/index.js')
  const { subscriptions } = await import('@/db/schema/index.js')
  const { eq, and } = await import('drizzle-orm')

  const [updated] = await db
    .update(subscriptions)
    .set({ autoRenew, updatedAt: new Date() })
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, user.id)))
    .returning()

  if (!updated) {
    return c.json({ error: 'Subscription not found' }, 404)
  }

  return c.json({ subscription: updated })
})
