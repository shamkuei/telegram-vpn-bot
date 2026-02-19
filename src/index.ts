import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { config } from '@/config/index.js'

// ============================================================================
// Import Routes
// ============================================================================

import { graphqlHandler } from '@/graphql/index.js'
import { healthRoutes } from '@/routes/health.js'
import { webhookRoutes } from '@/routes/webhooks.js'
import { apiRoutes } from '@/routes/api/index.js'

// ============================================================================
// Hono App
// ============================================================================

export const app = new Hono()

// ============================================================================
// Middleware
// ============================================================================

// CORS
app.use('*', cors({
  origin: config.APP_URL,
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}))

// Logger (development only)
if (config.LOG_LEVEL === 'debug') {
  app.use('*', logger())
}

// Pretty JSON (development only)
if (config.NODE_ENV === 'development') {
  app.use('*', prettyJSON())
}

// Request ID middleware
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID?.() || Math.random().toString(36).substring(7)
  c.header('X-Request-ID', requestId)
  return next()
})

// ============================================================================
// Routes
// ============================================================================

// Health check
app.route('/', healthRoutes)

// GraphQL endpoint
app.all('/graphql', async (c) => {
  return graphqlHandler(c.req.raw)
})

// Webhooks (no auth required)
app.route('/webhooks', webhookRoutes)

// API routes (with auth)
app.route('/api', apiRoutes)

// ============================================================================
// Error Handling
// ============================================================================

// Not found handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Not Found',
    message: 'The requested resource was not found',
    path: c.req.path
  }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err)

  // Don't leak error details in production
  const isDevelopment = config.NODE_ENV === 'development'

  return c.json({
    success: false,
    error: isDevelopment ? err.name : 'Internal Server Error',
    message: isDevelopment ? err.message : 'An unexpected error occurred',
    ...(isDevelopment && { stack: err.stack })
  }, 500)
})

// ============================================================================
// Server
// ============================================================================

export type AppType = typeof app

export async function startServer() {
  const { serve } = await import('@hono/node-server')
  const {AddressInfo} = await import('node:net')

  const server = serve({
    fetch: app.fetch,
    port: config.API_PORT
  })

  const address = server.address() as AddressInfo
  const port = address.port

  console.log(`🚀 Server running on port ${port}`)
  console.log(`📊 GraphQL: http://localhost:${port}/graphql`)
  console.log(`🏥 Health: http://localhost:${port}/health`)

  return server
}

// Start server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer()
}
