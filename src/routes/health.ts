import { Hono } from 'hono'
import { checkDatabaseHealth } from '@/db/index.js'
import { checkRedisHealth, redis } from '@/cache/index.js'
import { marzban } from '@/marzban/index.js'

export const healthRoutes = new Hono()

// Basic health check
healthRoutes.get('/health', async (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

// Detailed health check
healthRoutes.get('/health/detailed', async (c) => {
  const checks = {
    server: { status: 'ok' as const },
    database: await checkDatabaseHealth(),
    redis: await checkRedisHealth(),
    marzban: false
  }

  // Check Marzban if configured
  try {
    checks.marzban = await marzban.healthCheck()
  } catch {
    checks.marzban = false
  }

  const allHealthy = Object.entries(checks).every(([key, value]) => {
    if (key === 'server') return true
    return value === true
  })

  return c.json({
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
  }, allHealthy ? 200 : 503)
})

// Readiness check
healthRoutes.get('/ready', async (c) => {
  const dbHealthy = await checkDatabaseHealth()
  const redisHealthy = await checkRedisHealth()

  if (!dbHealthy || !redisHealthy) {
    return c.json({
      status: 'not_ready',
      database: dbHealthy,
      redis: redisHealthy
    }, 503)
  }

  return c.json({
    status: 'ready',
    database: dbHealthy,
    redis: redisHealthy
  })
})

// Liveness check
healthRoutes.get('/live', (c) => {
  return c.json({
    status: 'alive',
    timestamp: new Date().toISOString()
  })
})
