import type { MiddlewareHandler } from 'hono'
import { RateLimiter, CacheKeys } from '@/cache/index'
import type { Context } from '@/graphql/context'

// ============================================================================
// Rate Limiting Middleware
// ============================================================================

interface RateLimitConfig {
  maxRequests: number
  windowSeconds: number
  blockDuration?: number
}

// Default rate limits
const DEFAULT_LIMITS: RateLimitConfig = {
  maxRequests: 30,
  windowSeconds: 60,
  blockDuration: 300 // 5 minutes
}

const ADMIN_LIMITS: RateLimitConfig = {
  maxRequests: 100,
  windowSeconds: 60,
  blockDuration: 300
}

const WEBHOOK_LIMITS: RateLimitConfig = {
  maxRequests: 100,
  windowSeconds: 60,
  blockDuration: 60
}

/**
 * Get rate limit identifier from request
 */
function getRateLimitTarget(c: any): { type: 'user' | 'ip'; id: string } {
  // Use user ID if available
  if (c.get('userId')) {
    return { type: 'user', id: `user:${c.get('userId')}` }
  }

  // Fall back to IP address
  const ip = c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            'unknown'

  return { type: 'ip', id: `ip:${ip}` }
}

/**
 * Rate limiting middleware
 */
export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const isAdmin = c.get('isAdmin')
  const path = c.req.path

  // Skip rate limiting for admins and health endpoints
  if (isAdmin || path.startsWith('/health')) {
    return next()
  }

  // Use different limits for different endpoints
  let config = DEFAULT_LIMITS

  if (path.startsWith('/api/')) {
    config = isAdmin ? ADMIN_LIMITS : DEFAULT_LIMITS
  } else if (path.startsWith('/webhooks/')) {
    config = WEBHOOK_LIMITS
  }

  const target = getRateLimitTarget(c)
  const endpoint = `${c.req.method}:${path}`

  // Check rate limit
  const result = await RateLimiter.checkWithBlock(
    target.id,
    endpoint,
    config.maxRequests,
    config.windowSeconds,
    config.blockDuration || 300
  )

  // Set rate limit headers
  c.header('X-RateLimit-Limit', config.maxRequests.toString())
  c.header('X-RateLimit-Remaining', result.remaining.toString())
  c.header('X-RateLimit-Reset', Math.ceil(result.resetAt.getTime() / 1000).toString())

  if (!result.allowed || result.blocked) {
    return c.json({
      success: false,
      error: 'Too Many Requests',
      message: result.blocked
        ? `Rate limit exceeded. Try again after ${result.resetAt.toISOString()}`
        : 'Rate limit exceeded',
      resetAt: result.resetAt.toISOString()
    }, 429)
  }

  return next()
}

/**
 * Create a custom rate limit middleware with specific config
 */
export function createRateLimit(config: RateLimitConfig): MiddlewareHandler {
  return async (c, next) => {
    const target = getRateLimitTarget(c)
    const endpoint = `${c.req.method}:${c.req.path}`

    const result = await RateLimiter.checkWithBlock(
      target.id,
      endpoint,
      config.maxRequests,
      config.windowSeconds,
      config.blockDuration || 300
    )

    c.header('X-RateLimit-Limit', config.maxRequests.toString())
    c.header('X-RateLimit-Remaining', result.remaining.toString())
    c.header('X-RateLimit-Reset', Math.ceil(result.resetAt.getTime() / 1000).toString())

    if (!result.allowed || result.blocked) {
      return c.json({
        success: false,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        resetAt: result.resetAt.toISOString()
      }, 429)
    }

    return next()
  }
}
