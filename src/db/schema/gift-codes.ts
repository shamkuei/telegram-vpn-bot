import {
  bigserial,
  bigint,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  unique
} from 'drizzle-orm/pg-core'
import { giftCodeStatusEnum } from './enums.js'
import { plans } from './plans.js'
import { users } from './users.js'

export const giftCodes = pgTable(
  'gift_codes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // Code Information
    code: varchar('code', { length: 50 }).notNull().unique(),

    // Plan Association
    planId: integer('plan_id').notNull().references(() => plans.id),

    // Creator
    createdBy: bigint('created_by', { mode: 'number' }).notNull().references(() => users.id),

    // Value
    durationDays: integer('duration_days').notNull(),
    dataLimitGb: bigint('data_limit_gb', { mode: 'number' }),

    // Usage Limits
    maxUses: integer('max_uses').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),

    // Expiration
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    // Status
    status: giftCodeStatusEnum('status').notNull().default('active'),

    // Restrictions
    allowedUserIds: bigint('allowed_user_ids', { mode: 'number' }).array(),
    minAccountAgeDays: integer('min_account_age_days').default(0),

    // Metadata
    note: text('note'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    codeIdx: index('idx_gift_codes_code').on(table.code),
    statusIdx: index('idx_gift_codes_status').on(table.status),
    expiresAtIdx: index('idx_gift_codes_expires_at').on(table.expiresAt),
    createdByIdx: index('idx_gift_codes_created_by').on(table.createdBy)
  })
)

export type GiftCode = typeof giftCodes.$inferSelect
export type NewGiftCode = typeof giftCodes.$inferInsert

// Gift Redemptions table
export const giftRedemptions = pgTable(
  'gift_redemptions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // Gift Code Association
    giftCodeId: bigint('gift_code_id', { mode: 'number' })
      .notNull()
      .references(() => giftCodes.id, { onDelete: 'cascade' }),

    // User who redeemed
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Resulting Subscription
    subscriptionId: bigint('subscription_id', { mode: 'number' }).references(
      () => subscriptions.id
    ),

    // Redemption IP (anti-fraud)
    ipAddress: varchar('ip_address', { length: 45 }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    giftCodeIdIdx: index('idx_gift_redemptions_code_id').on(table.giftCodeId),
    userIdIdx: index('idx_gift_redemptions_user_id').on(table.userId),
    ipAddressIdx: index('idx_gift_redemptions_ip_address').on(table.ipAddress),
    createdAtIdx: index('idx_gift_redemptions_created_at').on(table.createdAt),
    giftCodeUserUnique: unique('gift_code_user_unique').on(table.giftCodeId, table.userId)
  })
)

export type GiftRedemption = typeof giftRedemptions.$inferSelect
export type NewGiftRedemption = typeof giftRedemptions.$inferInsert
