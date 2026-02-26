import type { MiddlewareHandler } from 'hono'
import type { Context } from '@/graphql/context'
import { CacheKeys, SessionStore } from '@/cache/index'

// ============================================================================
// Auth Middleware
// ============================================================================

/**
 * Authenticate user from session/JWT token
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // Get token from Authorization header
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return next()
  }

  try {
    // Decode JWT and get user
    const { verifyToken } = await import('@/utils/jwt.js')
    const payload = await verifyToken(token)

    if (payload && payload.telegramId) {
      const { authenticateUser } = await import('@/graphql/context.js')
      const user = await authenticateUser(c, payload.telegramId)

      if (user) {
        c.set('user', user)
        c.set('userId', user.id)
        c.set('telegramId', user.telegramId)
        c.set('isAdmin', user.isReseller || false)
      }
    }
  } catch {
    // Invalid token - continue without user
  }

  return next()
}

/**
 * Require authentication - returns 401 if not authenticated
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const user = c.get('user')

  if (!user) {
    return c.json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication required'
    }, 401)
  }

  return next()
}

/**
 * Require admin access
 */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const isAdmin = c.get('isAdmin')

  if (!isAdmin) {
    return c.json({
      success: false,
      error: 'Forbidden',
      message: 'Admin access required'
    }, 403)
  }

  return next()
}
