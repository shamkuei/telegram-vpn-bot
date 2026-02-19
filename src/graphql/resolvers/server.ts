import { Server } from '@/db/schema/index.js'

export async function getRegion(server: Server, _args: any, _ctx: any) {
  if (!server.regionId) return null

  const { db } = await import('@/db/index.js')
  const { serverRegions } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [region] = await db.select().from(serverRegions).where(eq(serverRegions.id, server.regionId))
  return region || null
}

export async function getRegionServers(region: any, _args: any, _ctx: any) {
  const { db } = await import('@/db/index.js')
  const { servers } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  return await db.select().from(servers).where(eq(servers.regionId, region.id))
}

export async function getByVpnAccount(vpnAccount: any, _args: any, _ctx: any) {
  const { db } = await import('@/db/index.js')
  const { servers } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [server] = await db.select().from(servers).where(eq(servers.id, vpnAccount.serverId))
  return server || null
}
