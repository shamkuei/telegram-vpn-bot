import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '@/config/index.js'
import { schema } from './schema/index.js'
import * as schema from './schema/index.js'

// Create PostgreSQL connection
const connectionString = config.DATABASE_URL

// Query logging in development
const enableQueryLogging = config.LOG_LEVEL === 'debug'

// Create postgres client
export const client = postgres(connectionString, {
  max: config.DB_POOL_MAX,
  idle_timeout: 20,
  connect_timeout: 10,
  statement_timeout: 10000, // 10 seconds
  debug: enableQueryLogging ? (query) => console.log('[SQL]', query) : undefined
})

// Create Drizzle instance
export const db = drizzle(client, {
  schema,
  logger: enableQueryLogging
})

// Health check function
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await client`SELECT 1`
    return true
  } catch (error) {
    console.error('Database health check failed:', error)
    return false
  }
}

// Graceful shutdown
export async function closeDatabase(): Promise<void> {
  try {
    await client.end()
    console.log('Database connection closed')
  } catch (error) {
    console.error('Error closing database connection:', error)
    throw error
  }
}

// Transaction helper
export async function withTransaction<T>(
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return await db.transaction(callback)
}

export { schema }
export type Database = typeof db
