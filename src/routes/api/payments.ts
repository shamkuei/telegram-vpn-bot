import { Hono } from 'hono'
import type { AppType } from '@/index.js'

export const paymentRoutes = new Hono<AppType>()

// Create payment
paymentRoutes.post('/', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const body = await c.req.json()
  const { createPayment } = await import('@/graphql/resolvers/mutations/index.js')

  try {
    const result = await createPayment(null, { input: body }, { user })
    return c.json(result)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Payment creation failed' }, 400)
  }
})

// Get payment by ID
paymentRoutes.get('/:id', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const id = parseInt(c.req.param('id'))
  const { paymentQueries } = await import('@/db/queries.js')
  const payment = await paymentQueries.findById(id)

  if (!payment || payment.userId !== user.id) {
    return c.json({ error: 'Payment not found' }, 404)
  }

  return c.json({ payment })
})

// Get user's payment history
paymentRoutes.get('/', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const { db } = await import('@/db/index.js')
  const { paymentLogs } = await import('@/db/schema/index.js')
  const { eq, desc } = await import('drizzle-orm')

  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  const payments = await db
    .select()
    .from(paymentLogs)
    .where(eq(paymentLogs.userId, user.id))
    .orderBy(desc(paymentLogs.createdAt))
    .limit(limit)
    .offset(offset)

  return c.json({ payments })
})

// Check payment status (for polling)
paymentRoutes.get('/:id/status', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const id = parseInt(c.req.param('id'))
  const { paymentQueries } = await import('@/db/queries.js')
  const payment = await paymentQueries.findById(id)

  if (!payment || payment.userId !== user.id) {
    return c.json({ error: 'Payment not found' }, 404)
  }

  return c.json({
    status: payment.status,
    confirmedAt: payment.confirmedAt,
    expiredAt: payment.expiredAt
  })
})
