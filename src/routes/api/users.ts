import { Hono } from 'hono'
import type { AppType } from '@/index'

export const userRoutes = new Hono<AppType>()

// Get current user
userRoutes.get('/me', async (c) => {
  const user = c.get('user')

  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  return c.json({ user })
})

// Get user by Telegram ID (admin only)
userRoutes.get('/:telegramId', async (c) => {
  const isAdmin = c.get('isAdmin')
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403)
  }

  const telegramId = parseInt(c.req.param('telegramId'))
  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(telegramId)

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({ user })
})

// Update user
userRoutes.put('/me', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const body = await c.req.json()
  const { updateUser } = await import('@/graphql/resolvers/mutations/index.js')

  try {
    const updated = await updateUser(null, { input: body }, { user })
    return c.json({ user: updated })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Update failed' }, 400)
  }
})

// Get user's referrals
userRoutes.get('/me/referrals', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const { referralQueries } = await import('@/db/queries.js')
  const referrals = await referralQueries.getByReferrerId(user.telegramId)

  return c.json({ referrals })
})

// Get user's devices
userRoutes.get('/me/devices', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const { deviceQueries } = await import('@/db/queries.js')
  const devices = await deviceQueries.getByUserId(user.id)

  return c.json({ devices })
})

// Disconnect device
userRoutes.post('/me/devices/:deviceId/disconnect', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const deviceId = parseInt(c.req.param('deviceId'))
  const { deviceService } = await import('@/services/device.js')

  try {
    const device = await deviceService.disconnectDevice(user, deviceId)
    return c.json({ device })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Disconnect failed' }, 400)
  }
})
