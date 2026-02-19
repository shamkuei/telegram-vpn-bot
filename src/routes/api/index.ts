import { Hono } from 'hono'
import { authMiddleware } from '@/middleware/auth.js'
import { rateLimitMiddleware } from '@/middleware/rate-limit.js'

export const apiRoutes = new Hono()

// ============================================================================
// Apply Middleware
// ============================================================================

apiRoutes.use('*', authMiddleware)
apiRoutes.use('*', rateLimitMiddleware)

// ============================================================================
// API v1 Routes
// ============================================================================

import { userRoutes } from './users.js'
import { subscriptionRoutes } from './subscriptions.js'
import { paymentRoutes } from './payments.js'
import { walletRoutes } from './wallets.js'
import { serverRoutes } from './servers.js'
import { planRoutes } from './plans.js'

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
