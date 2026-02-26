import {
  bigserial,
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
  unique
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { vpnAccounts } from './vpn-accounts'

export const devices = pgTable(
  'devices',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // User Association
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Device Information
    deviceFingerprint: varchar('device_fingerprint', { length: 256 }).notNull(),
    deviceName: varchar('device_name', { length: 128 }),
    deviceType: varchar('device_type', { length: 50 }), // mobile, desktop, router, etc.

    // VPN Account Association
    vpnAccountId: bigint('vpn_account_id', { mode: 'number' }).references(
      () => vpnAccounts.id,
      { onDelete: 'set null' }
    ),

    // Connection Status
    isConnected: boolean('is_connected').notNull().default(false),
    lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
    lastDisconnectedAt: timestamp('last_disconnected_at', { withTimezone: true }),

    // Usage
    totalDataMb: bigint('total_data_mb', { mode: 'number' }).notNull().default(0),
    totalConnectionMinutes: bigint('total_connection_minutes', { mode: 'number' }).notNull().default(0),

    // Security
    isBlocked: boolean('is_blocked').notNull().default(false),
    blockReason: text('block_reason'),

    // Timestamps
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index('idx_devices_user_id').on(table.userId),
    vpnAccountIdIdx: index('idx_devices_vpn_account_id').on(table.vpnAccountId),
    fingerprintIdx: index('idx_devices_fingerprint').on(table.deviceFingerprint),
    isConnectedIdx: index('idx_devices_is_connected').on(table.isConnected),
    isBlockedIdx: index('idx_devices_is_blocked').on(table.isBlocked),
    lastActivityIdx: index('idx_devices_last_activity').on(table.lastActivityAt),
    // Unique constraint for one active connection per device
    uniqueActiveIdx: index('idx_devices_unique_active').on(table.userId, table.deviceFingerprint).where(
      sql`${table.isConnected} = true`
    )
  })
)

export type Device = typeof devices.$inferSelect
export type NewDevice = typeof devices.$inferInsert
