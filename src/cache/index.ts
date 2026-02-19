import Redis from 'ioredis'
import { config } from '@/config/index.js'

// ============================================================================
// Redis Client Setup
// ============================================================================

const redisOptions = {
  host: new URL(config.REDIS_URL).hostname,
  port: parseInt(new URL(config.REDIS_URL).port) || 6379,
  password: config.REDIS_PASSWORD || undefined,
  db: config.REDIS_DB,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000)
    return delay
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  lazyConnect: false
}

export const redis = new Redis(redisOptions)

// Health check
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const result = await redis.ping()
    return result === 'PONG'
  } catch (error) {
    console.error('Redis health check failed:', error)
    return false
  }
}

// Graceful shutdown
export async function closeRedis(): Promise<void> {
  try {
    await redis.quit()
    console.log('Redis connection closed')
  } catch (error) {
    console.error('Error closing Redis connection:', error)
    throw error
  }
}

// ============================================================================
// Cache Key Prefixes
// ============================================================================

export const CacheKeys = {
  // Session storage
  SESSION: (telegramId: number) => `${config.REDIS_PREFIX}session:${telegramId}`,

  // User cache
  USER: (telegramId: number) => `${config.REDIS_PREFIX}user:${telegramId}`,
  USER_BY_ID: (id: number) => `${config.REDIS_PREFIX}user:id:${id}`,

  // Marzban user cache
  MARZBAN_USER: (username: string) => `${config.REDIS_PREFIX}marzban_user:${username}`,

  // Plan cache
  PLAN: (planId: number) => `${config.REDIS_PREFIX}plan:${planId}`,
  PLANS_ACTIVE: `${config.REDIS_PREFIX}plans:active`,
  PLANS_FEATURED: `${config.REDIS_PREFIX}plans:featured`,

  // Server cache
  SERVERS_ACTIVE: `${config.REDIS_PREFIX}servers:active`,
  SERVERS_PUBLIC: `${config.REDIS_PREFIX}servers:public`,
  SERVER: (serverId: number) => `${config.REDIS_PREFIX}server:${serverId}`,

  // Subscription cache
  SUBSCRIPTION: (subscriptionId: number) => `${config.REDIS_PREFIX}subscription:${subscriptionId}`,
  USER_SUBSCRIPTIONS: (userId: number) => `${config.REDIS_PREFIX}user:${userId}:subscriptions`,
  VPN_ACCOUNTS: (userId: number) => `${config.REDIS_PREFIX}user:${userId}:vpn_accounts`,

  // Wallet cache
  WALLET: (userId: number) => `${config.REDIS_PREFIX}wallet:${userId}`,

  // Payment cache
  PAYMENT: (paymentId: number) => `${config.REDIS_PREFIX}payment:${paymentId}`,
  PAYMENT_PENDING: (provider: string) => `${config.REDIS_PREFIX}payments:pending:${provider}`,

  // Rate limiting
  RATE_LIMIT: (target: string, endpoint: string) =>
    `${config.REDIS_PREFIX}ratelimit:${target}:${endpoint}`,

  // Locks
  LOCK: (resource: string, identifier: string) =>
    `${config.REDIS_PREFIX}lock:${resource}:${identifier}`,

  // Subscription URL cache
  SUB_URL: (username: string) => `${config.REDIS_PREFIX}sub_url:${username}`,

  // Usage stats cache
  USAGE: (date: string, username: string) =>
    `${config.REDIS_PREFIX}usage:${date}:${username}`,

  // Gift codes
  GIFT_CODE: (code: string) => `${config.REDIS_PREFIX}gift:${code}`,

  // Promo codes
  PROMO_CODE: (code: string) => `${config.REDIS_PREFIX}promo:${code}`,

  // Referral
  REFERRAL: (code: string) => `${config.REDIS_PREFIX}referral:${code}`
}

// ============================================================================
// Cache TTL Constants (in seconds)
// ============================================================================

export const CacheTTL = {
  // Short-lived cache (1-5 minutes)
  VERY_SHORT: 60,
  SHORT: 300, // 5 minutes

  // Medium cache (15-60 minutes)
  MEDIUM: 900, // 15 minutes
  LONG: 3600, // 1 hour

  // Long cache (hours)
  VERY_LONG: 86400, // 24 hours
  WEEK: 604800, // 7 days

  // Session cache
  SESSION: 7200, // 2 hours
  ADMIN_SESSION: 28800 // 8 hours
}

// ============================================================================
// Cache Helper Functions
// ============================================================================

export class CacheService {
  /**
   * Get a value from cache
   */
  static async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key)
      if (!value) return null
      return JSON.parse(value) as T
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error)
      return null
    }
  }

  /**
   * Set a value in cache with optional TTL
   */
  static async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value)
      if (ttl) {
        await redis.setex(key, ttl, serialized)
      } else {
        await redis.set(key, serialized)
      }
      return true
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error)
      return false
    }
  }

  /**
   * Delete a value from cache
   */
  static async del(key: string): Promise<boolean> {
    try {
      await redis.del(key)
      return true
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error)
      return false
    }
  }

  /**
   * Delete multiple keys matching a pattern
   */
  static async delPattern(pattern: string): Promise<number> {
    try {
      const keys = await redis.keys(pattern)
      if (keys.length === 0) return 0
      return await redis.del(...keys)
    } catch (error) {
      console.error(`Cache delete pattern error for ${pattern}:`, error)
      return 0
    }
  }

  /**
   * Check if a key exists
   */
  static async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(key)
      return result === 1
    } catch (error) {
      console.error(`Cache exists error for key ${key}:`, error)
      return false
    }
  }

  /**
   * Increment a counter
   */
  static async incr(key: string): Promise<number> {
    try {
      return await redis.incr(key)
    } catch (error) {
      console.error(`Cache increment error for key ${key}:`, error)
      return 0
    }
  }

  /**
   * Increment with expiration
   */
  static async incrWithExpiry(key: string, ttl: number): Promise<number> {
    try {
      const value = await redis.incr(key)
      if (value === 1) {
        await redis.expire(key, ttl)
      }
      return value
    } catch (error) {
      console.error(`Cache increment with expiry error for key ${key}:`, error)
      return 0
    }
  }

  /**
   * Get TTL of a key
   */
  static async ttl(key: string): Promise<number> {
    try {
      return await redis.ttl(key)
    } catch (error) {
      console.error(`Cache TTL error for key ${key}:`, error)
      return -1
    }
  }

  /**
   * Set TTL for a key
   */
  static async expire(key: string, ttl: number): Promise<boolean> {
    try {
      await redis.expire(key, ttl)
      return true
    } catch (error) {
      console.error(`Cache expire error for key ${key}:`, error)
      return false
    }
  }
}

// ============================================================================
// Distributed Lock
// ============================================================================

export class DistributedLock {
  /**
   * Acquire a lock
   */
  static async acquire(
    resource: string,
    identifier: string,
    ttl: number = 30
  ): Promise<boolean> {
    const key = CacheKeys.LOCK(resource, identifier)
    try {
      const result = await redis.set(key, identifier, 'PX', ttl * 1000, 'NX')
      return result === 'OK'
    } catch (error) {
      console.error(`Lock acquire error for ${resource}:`, error)
      return false
    }
  }

  /**
   * Release a lock
   */
  static async release(resource: string, identifier: string): Promise<boolean> {
    const key = CacheKeys.LOCK(resource, identifier)
    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `
      const result = await redis.eval(script, 1, key, identifier)
      return result === 1
    } catch (error) {
      console.error(`Lock release error for ${resource}:`, error)
      return false
    }
  }

  /**
   * Extend a lock
   */
  static async extend(resource: string, identifier: string, ttl: number = 30): Promise<boolean> {
    const key = CacheKeys.LOCK(resource, identifier)
    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `
      const result = await redis.eval(script, 1, key, identifier, ttl * 1000)
      return result === 1
    } catch (error) {
      console.error(`Lock extend error for ${resource}:`, error)
      return false
    }
  }
}

// ============================================================================
// Rate Limiting
// ============================================================================

export class RateLimiter {
  /**
   * Check if request is allowed
   */
  static async check(
    target: string,
    endpoint: string,
    maxRequests: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const key = CacheKeys.RATE_LIMIT(target, endpoint)
    const now = Date.now()
    const windowStart = Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000)
    const windowKey = `${key}:${windowStart}`

    try {
      const current = await redis.incr(windowKey)
      if (current === 1) {
        await redis.pexpire(windowKey, windowSeconds * 1000)
      }

      const resetAt = new Date(windowStart + windowSeconds * 1000)
      const remaining = Math.max(0, maxRequests - current)
      const allowed = current <= maxRequests

      return { allowed, remaining, resetAt }
    } catch (error) {
      console.error(`Rate limit check error for ${target}:${endpoint}:`, error)
      // Fail open - allow request on error
      return { allowed: true, remaining: maxRequests, resetAt: new Date(now + windowSeconds * 1000) }
    }
  }

  /**
   * Check and block if exceeded
   */
  static async checkWithBlock(
    target: string,
    endpoint: string,
    maxRequests: number,
    windowSeconds: number,
    blockDuration: number = 60
  ): Promise<{ allowed: boolean; blocked: boolean; remaining: number; resetAt: Date }> {
    const result = await this.check(target, endpoint, maxRequests, windowSeconds)

    if (!result.allowed) {
      const blockKey = `${CacheKeys.RATE_LIMIT(target, endpoint)}:blocked`
      const blocked = await redis.get(blockKey)

      if (!blocked) {
        await redis.setex(blockKey, blockDuration, '1')
      }

      return { ...result, blocked: true }
    }

    return { ...result, blocked: false }
  }

  /**
   * Check if currently blocked
   */
  static async isBlocked(target: string, endpoint: string): Promise<boolean> {
    const blockKey = `${CacheKeys.RATE_LIMIT(target, endpoint)}:blocked`
    try {
      const blocked = await redis.exists(blockKey)
      return blocked === 1
    } catch {
      return false
    }
  }

  /**
   * Reset rate limit
   */
  static async reset(target: string, endpoint: string): Promise<void> {
    const pattern = `${CacheKeys.RATE_LIMIT(target, endpoint)}*`
    await CacheService.delPattern(pattern)
  }
}

// ============================================================================
// Session Storage
// ============================================================================

export class SessionStore {
  /**
   * Get session data
   */
  static async get<T extends Record<string, any>>(telegramId: number): Promise<T | null> {
    const key = CacheKeys.SESSION(telegramId)
    return await CacheService.get<T>(key)
  }

  /**
   * Set session data
   */
  static async set<T extends Record<string, any>>(
    telegramId: number,
    data: T,
    ttl: number = CacheTTL.SESSION
  ): Promise<boolean> {
    const key = CacheKeys.SESSION(telegramId)
    return await CacheService.set(key, data, ttl)
  }

  /**
   * Update session field
   */
  static async updateField(
    telegramId: number,
    field: string,
    value: any,
    ttl: number = CacheTTL.SESSION
  ): Promise<boolean> {
    const key = CacheKeys.SESSION(telegramId)
    try {
      const session = (await CacheService.get(key)) || {}
      session[field] = value
      return await CacheService.set(key, session, ttl)
    } catch {
      return false
    }
  }

  /**
   * Delete session
   */
  static async delete(telegramId: number): Promise<boolean> {
    const key = CacheKeys.SESSION(telegramId)
    return await CacheService.del(key)
  }

  /**
   * Extend session TTL
   */
  static async extend(telegramId: number, ttl: number = CacheTTL.SESSION): Promise<boolean> {
    const key = CacheKeys.SESSION(telegramId)
    return await CacheService.expire(key, ttl)
  }
}

// ============================================================================
// Pub/Sub
// ============================================================================

export class PubSub {
  /**
   * Publish a message
   */
  static async publish(channel: string, message: any): Promise<number> {
    try {
      const serialized = JSON.stringify(message)
      return await redis.publish(channel, serialized)
    } catch (error) {
      console.error(`PubSub publish error for channel ${channel}:`, error)
      return 0
    }
  }

  /**
   * Subscribe to a channel
   */
  static async subscribe(
    channel: string,
    handler: (message: any) => void | Promise<void>
  ): Promise<Redis> {
    const subscriber = redis.duplicate()
    await subscriber.connect()
    await subscriber.subscribe(channel)

    subscriber.on('message', async (ch, message) => {
      if (ch === channel) {
        try {
          const data = JSON.parse(message)
          await handler(data)
        } catch (error) {
          console.error(`PubSub message handler error for channel ${channel}:`, error)
        }
      }
    })

    return subscriber
  }

  /**
   * Unsubscribe from a channel
   */
  static async unsubscribe(subscriber: Redis, channel: string): Promise<void> {
    await subscriber.unsubscribe(channel)
    await subscriber.disconnect()
  }
}

// ============================================================================
// Cache Invalidation Helpers
// ============================================================================

export class CacheInvalidation {
  /**
   * Invalidate user-related cache
   */
  static async invalidateUser(userId: number, telegramId?: number): Promise<void> {
    const keys = [
      CacheKeys.USER(userId),
      telegramId ? CacheKeys.USER(telegramId) : null,
      CacheKeys.USER_SUBSCRIPTIONS(userId),
      CacheKeys.VPN_ACCOUNTS(userId),
      CacheKeys.WALLET(userId)
    ].filter(Boolean) as string[]

    await Promise.all(keys.map((key) => CacheService.del(key)))
  }

  /**
   * Invalidate plan cache
   */
  static async invalidatePlans(): Promise<void> {
    await Promise.all([
      CacheService.del(CacheKeys.PLANS_ACTIVE),
      CacheService.del(CacheKeys.PLANS_FEATURED)
    ])
  }

  /**
   * Invalidate server cache
   */
  static async invalidateServers(): Promise<void> {
    await Promise.all([
      CacheService.del(CacheKeys.SERVERS_ACTIVE),
      CacheService.del(CacheKeys.SERVERS_PUBLIC)
    ])
  }

  /**
   * Invalidate subscription cache
   */
  static async invalidateSubscription(subscriptionId: number, userId: number): Promise<void> {
    await Promise.all([
      CacheService.del(CacheKeys.SUBSCRIPTION(subscriptionId)),
      CacheService.del(CacheKeys.USER_SUBSCRIPTIONS(userId))
    ])
  }
}

export { redis }
