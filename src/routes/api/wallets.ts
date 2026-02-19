import { Hono } from 'hono'
import type { AppType } from '@/index.js'

export const walletRoutes = new Hono<AppType>()

// Get wallet
walletRoutes.get('/', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const { walletQueries } = await import('@/db/queries.js')
  let wallet = await walletQueries.getByUserId(user.id)

  if (!wallet) {
    wallet = await walletQueries.create(user.id)
  }

  return c.json({ wallet })
})

// Get transactions
walletRoutes.get('/transactions', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const { db } = await import('@/db/index.js')
  const { walletTransactions, wallets } = await import('@/db/schema/index.js')
  const { eq, desc } = await import('drizzle-orm')

  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id))

  if (!wallet) {
    return c.json({ transactions: [] })
  }

  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')
  const type = c.req.query('type')
  const status = c.req.query('status')

  let whereClause = eq(walletTransactions.walletId, wallet.id)

  if (type) {
    whereClause = and(whereClause, eq(walletTransactions.type, type as any))
  }

  if (status) {
    whereClause = and(whereClause, eq(walletTransactions.status, status as any))
  }

  const transactions = await db
    .select()
    .from(walletTransactions)
    .where(whereClause)
    .orderBy(desc(walletTransactions.createdAt))
    .limit(limit)
    .offset(offset)

  return c.json({ transactions })
})

// Add funds (admin only)
walletRoutes.post('/add-funds', async (c) => {
  const isAdmin = c.get('isAdmin')
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403)
  }

  const { userId, amountCents, description } = await c.req.json()

  const { walletService } = await import('@/services/wallet.js')
  const transaction = await walletService.addFunds(userId, amountCents, description || 'Manual adjustment', true)

  return c.json({ transaction })
})

// Transfer funds between users
walletRoutes.post('/transfer', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const { toUserId, amountCents, description } = await c.req.json()

  const { walletService } = await import('@/services/wallet.js')

  try {
    const transaction = await walletService.transferFunds(
      user.id,
      toUserId,
      amountCents,
      description || 'Transfer'
    )

    return c.json({ transaction })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Transfer failed' }, 400)
  }
})
