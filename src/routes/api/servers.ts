import { Hono } from 'hono'
import type { AppType } from '@/index'

export const serverRoutes = new Hono<AppType>()

// Get all public servers
serverRoutes.get('/', async (c) => {
  const { serverQueries } = await import('@/db/queries.js')
  const servers = await serverQueries.getPublicActive()

  return c.json({ servers })
})

// Get server by ID
serverRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { serverQueries } = await import('@/db/queries.js')
  const server = await serverQueries.findById(id)

  if (!server) {
    return c.json({ error: 'Server not found' }, 404)
  }

  return c.json({ server })
})

// Get servers by region
serverRoutes.get('/region/:regionId', async (c) => {
  const regionId = parseInt(c.req.param('regionId'))
  const { serverQueries } = await import('@/db/queries.js')
  const servers = await serverQueries.getByRegion(regionId)

  return c.json({ servers })
})

// Get regions
serverRoutes.get('/regions', async (c) => {
  const { db } = await import('@/db/index.js')
  const { serverRegions } = await import('@/db/schema/index.js')

  const regions = await db.select().from(serverRegions).orderBy((region) => region.priority)

  return c.json({ regions })
})
