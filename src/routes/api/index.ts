import { Hono } from 'hono'
import { authMiddleware } from '@/middleware/auth'
import { rateLimitMiddleware } from '@/middleware/rate-limit'

export const apiRoutes = new Hono()

// ============================================================================
// Apply Middleware
// ============================================================================

apiRoutes.use('*', authMiddleware)
apiRoutes.use('*', rateLimitMiddleware)

// ============================================================================
// API v1 Routes
// ============================================================================

import { userRoutes } from './users'
import { subscriptionRoutes } from './subscriptions'
import { paymentRoutes } from './payments'
import { walletRoutes } from './wallets'
import { serverRoutes } from './servers'
import { planRoutes } from './plans'

apiRoutes.route('/users', userRoutes)
apiRoutes.route('/subscriptions', subscriptionRoutes)
apiRoutes.route('/payments', paymentRoutes)
apiRoutes.route('/wallet', walletRoutes)
apiRoutes.route('/servers', serverRoutes)
apiRoutes.route('/plans', planRoutes)

// ============================================================================
// Version Endpoint
// ============================================================================

apiRoutes.get('/version', (c) => {
  return c.json({
    version: '1.0.0',
    name: 'Telegram VPN Bot API',
    environment: process.env.NODE_ENV
  })
})
