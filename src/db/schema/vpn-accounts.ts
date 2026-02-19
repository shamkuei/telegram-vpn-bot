import {
  bigserial,
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
  boolean
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { vpnAccountStatusEnum } from './enums.js'
import { users } from './users.js'
import { servers } from './servers.js'
import { subscriptions } from './subscriptions.js'

export const vpnAccounts = pgTable(
  'vpn_accounts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // User Association
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Server Association
    serverId: integer('server_id')
      .notNull()
      .references(() => servers.id),

    // Account Information
    accountName: varchar('account_name', { length: 128 }).notNull(),
    accountKey: varchar('account_key', { length: 256 }).notNull(),

    // Marzban Integration
    marzbanUsername: varchar('marzban_username', { length: 64 }).notNull(),
    marzbanToken: varchar('marzban_token', { length: 256 }).notNull(),
    marzbanSubscriptionUrl: text('marzban_subscription_url'),

    // Account Status
    status: vpnAccountStatusEnum('status').notNull().default('active'),

    // Usage Limits
    dataLimitBytes: bigint('data_limit_bytes', { mode: 'number' }),
    usedDataBytes: bigint('used_data_bytes', { mode: 'number' }).notNull().default(0),

    // Expiration
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    // Subscription Reference
    subscriptionId: bigint('subscription_id', { mode: 'number' }).references(
      () => subscriptions.id
    ),

    // Test Account Tracking
    isTestAccount: boolean('is_test_account').notNull().default(false),
    testAccountDurationMinutes: integer('test_account_duration_minutes'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index('idx_vpn_accounts_user_id').on(table.userId),
    serverIdIdx: index('idx_vpn_accounts_server_id').on(table.serverId),
    marzbanUsernameIdx: index('idx_vpn_accounts_marzban_username').on(table.marzbanUsername),
    statusIdx: index('idx_vpn_accounts_status').on(table.status),
    subscriptionIdIdx: index('idx_vpn_accounts_subscription_id').on(table.subscriptionId),
    isTestIdx: index('idx_vpn_accounts_is_test').on(table.isTestAccount),
    expiresAtIdx: index('idx_vpn_accounts_expires_at').on(table.expiresAt),
    userServerIdx: index('idx_vpn_accounts_user_server').on(table.userId, table.serverId),
    // Composite index for active accounts with expiration
    activeExpiringIdx: index('idx_vpn_accounts_active_expiring').on(
      table.userId,
      table.expiresAt,
      table.status
    ),
    userServerUnique: unique('user_server_marzban_unique').on(
      table.userId,
      table.serverId,
      table.marzbanUsername
    )
  })
)

export type VpnAccount = typeof vpnAccounts.$inferSelect
export type NewVpnAccount = typeof vpnAccounts.$inferInsert
