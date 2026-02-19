import {
  bigserial,
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  varchar,
  unique
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users.js'

export const userSessions = pgTable(
  'user_sessions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // User Association
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Session Data
    sessionToken: varchar('session_token', { length: 256 }).notNull().unique(),

    // Device/Location
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    deviceFingerprint: varchar('device_fingerprint', { length: 256 }),

    // Session Status
    isActive: boolean('is_active').notNull().default(true),

    // Timestamps
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index('idx_sessions_user_id').on(table.userId),
    tokenIdx: index('idx_sessions_token').on(table.sessionToken),
    isActiveIdx: index('idx_sessions_is_active').on(table.isActive),
    ipAddressIdx: index('idx_sessions_ip_address').on(table.ipAddress),
    fingerprintIdx: index('idx_sessions_fingerprint').on(table.deviceFingerprint),
    expiresAtIdx: index('idx_sessions_expires_at').on(table.expiresAt),
    // Partial index for active sessions cleanup
    expiredCleanupIdx: index('idx_sessions_expired_cleanup').on(table.id, table.userId).where(
      sql`${table.isActive} = true AND ${table.expiresAt} < NOW()`
    )
  })
)

export type UserSession = typeof userSessions.$inferSelect
export type NewUserSession = typeof userSessions.$inferInsert
