import {
  bigserial,
  bigint,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  boolean
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { testAccountStatusEnum } from './enums'
import { users } from './users'
import { vpnAccounts } from './vpn-accounts'
import { subscriptions } from './subscriptions'

export const testAccounts = pgTable(
  'test_accounts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // User Association
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // VPN Account Reference
    vpnAccountId: bigint('vpn_account_id', { mode: 'number' })
      .notNull()
      .unique()
      .references(() => vpnAccounts.id, { onDelete: 'cascade' }),

    // Test Configuration
    durationMinutes: integer('duration_minutes').notNull(),
    dataLimitMb: bigint('data_limit_mb', { mode: 'number' }),

    // Status
    status: testAccountStatusEnum('status').notNull().default('active'),

    // Timestamps
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    convertedToSubscriptionId: bigint('converted_to_subscription_id', { mode: 'number' }).references(
      () => subscriptions.id
    ),

    // Usage Tracking
    usedDataMb: bigint('used_data_mb', { mode: 'number' }).notNull().default(0),
    connectionMinutes: bigint('connection_minutes', { mode: 'number' }).notNull().default(0),

    // Conversion
    converted: boolean('converted').notNull().default(false),
    convertedAt: timestamp('converted_at', { withTimezone: true }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index('idx_test_accounts_user_id').on(table.userId),
    vpnAccountIdIdx: index('idx_test_accounts_vpn_account_id').on(table.vpnAccountId),
    statusIdx: index('idx_test_accounts_status').on(table.status),
    expiresAtIdx: index('idx_test_accounts_expires_at').on(table.expiresAt),
    userActiveIdx: index('idx_test_accounts_user_active').on(table.userId, table.status),
    // Partial index for expiring test accounts (removed NOW() - not IMMUTABLE)
    expiringSoonIdx: index('idx_test_accounts_expiring_soon').on(table.id, table.userId).where(
      sql`${table.status} = 'active'`
    )
  })
)

export type TestAccount = typeof testAccounts.$inferSelect
export type NewTestAccount = typeof testAccounts.$inferInsert
