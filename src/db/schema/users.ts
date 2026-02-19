import {
  bigint,
  bigserial,
  boolean,
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  varchar
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { userStatusEnum, resellerTierEnum } from './enums.js'

export const users = pgTable(
  'users',
  {
    // Primary Key
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // Telegram Identification
    telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
    telegramUsername: varchar('telegram_username', { length: 32 }),
    telegramFirstName: varchar('telegram_first_name', { length: 64 }).notNull(),
    telegramLastName: varchar('telegram_last_name', { length: 64 }),
    telegramLanguageCode: varchar('telegram_language_code', { length: 10 }),

    // Account Status
    status: userStatusEnum('status').notNull().default('active'),

    // Marzban Integration
    marzbanUsername: varchar('marzban_username', { length: 64 }).unique(),
    marzbanUserId: integer('marzban_user_id'),
    marzbanAdminUsername: varchar('marzban_admin_username', { length: 64 }),

    // Referral System
    referredBy: bigint('referred_by', { mode: 'number' }).references(
      () => users.telegramId,
      { onDelete: 'set null' }
    ),
    referralCode: varchar('referral_code', { length: 20 }).notNull().unique(),

    // Reseller System
    isReseller: boolean('is_reseller').notNull().default(false),
    resellerTier: resellerTierEnum('reseller_tier'),

    // Metadata
    botBlockedAt: timestamp('bot_blocked_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Anti-Abuse
    isFlagged: boolean('is_flagged').notNull().default(false),
    flagReason: text('flag_reason'),
    flagCount: integer('flag_count').notNull().default(0),
    trustScore: decimal('trust_score', { precision: 3, scale: 2 })
      .notNull()
      .default('1.00'),

    // Rate Limiting Trackers
    failedPaymentAttempts: integer('failed_payment_attempts').notNull().default(0),
    failedPaymentResetAt: timestamp('failed_payment_reset_at', { withTimezone: true }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    telegramIdIdx: index('idx_users_telegram_id').on(table.telegramId),
    referralCodeIdx: index('idx_users_referral_code').on(table.referralCode),
    referredByIdx: index('idx_users_referred_by').on(table.referredBy),
    marzbanUsernameIdx: index('idx_users_marzban_username').on(table.marzbanUsername),
    statusIdx: index('idx_users_status').on(table.status),
    isResellerIdx: index('idx_users_is_reseller').on(table.isReseller),
    lastActivityIdx: index('idx_users_last_activity').on(table.lastActivityAt),
    createdAtIdx: index('idx_users_created_at').on(table.createdAt),
    isFlaggedIdx: index('idx_users_is_flagged').on(table.isFlagged),
    trustScoreIdx: index('idx_users_trust_score').on(table.trustScore),
    // Partial index for active users
    activeUsersIdx: index('idx_users_active').on(table.telegramId, table.status).where(
      sql`${table.status} = 'active' AND ${table.isFlagged} = false`
    )
  })
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
