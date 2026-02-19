import {
  bigserial,
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  unique
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { subscriptionStatusEnum } from './enums.js'
import { users } from './users.js'
import { plans } from './plans.js'
import { servers } from './servers.js'
import { serverRegions } from './regions.js'
import { giftCodes } from './gift-codes.js'
import { paymentLogs } from './payments.js'

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // User Association
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Plan Association
    planId: integer('plan_id')
      .notNull()
      .references(() => plans.id),

    // Server Selection (if applicable)
    serverId: integer('server_id').references(() => servers.id),
    regionId: integer('region_id').references(() => serverRegions.id),

    // Subscription Status
    status: subscriptionStatusEnum('status').notNull().default('active'),

    // Duration
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    // Auto-Renewal
    autoRenew: boolean('auto_renew').notNull().default(true),
    lastRenewalAttemptAt: timestamp('last_renewal_attempt_at', { withTimezone: true }),

    // Usage Tracking
    dataLimitGb: bigint('data_limit_gb', { mode: 'number' }),
    usedDataGb: bigint('used_data_gb', { mode: 'number' }).notNull().default(0),
    resetDayOfMonth: integer('reset_day_of_month'), // Day of month for data reset (1-31)

    // Device Limit
    deviceLimit: integer('device_limit').notNull(),

    // Gift/Referral Tracking
    isGift: boolean('is_gift').notNull().default(false),
    giftCode: varchar('gift_code', { length: 50 }).references(() => giftCodes.code),
    isReferralReward: boolean('is_referral_reward').notNull().default(false),

    // Pricing at purchase
    pricePaidCents: integer('price_paid_cents').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),

    // Payment Reference
    paymentLogId: bigint('payment_log_id', { mode: 'number' }).references(() => paymentLogs.id),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index('idx_subscriptions_user_id').on(table.userId),
    planIdIdx: index('idx_subscriptions_plan_id').on(table.planId),
    serverIdIdx: index('idx_subscriptions_server_id').on(table.serverId),
    statusIdx: index('idx_subscriptions_status').on(table.status),
    expiresAtIdx: index('idx_subscriptions_expires_at').on(table.expiresAt),
    autoRenewIdx: index('idx_subscriptions_auto_renew').on(table.autoRenew),
    expiringSoonIdx: index('idx_subscriptions_expiring_soon').on(
      table.userId,
      table.expiresAt
    ),
    userActiveIdx: index('idx_subscriptions_user_active').on(
      table.userId,
      table.status,
      table.expiresAt
    ),
    // Partial index for subscriptions needing renewal
    needRenewalIdx: index('idx_subscriptions_need_renewal').on(
      table.id,
      table.userId,
      table.planId
    ).where(
      sql`${table.status} = 'active' AND ${table.autoRenew} = true AND ${table.expiresAt} BETWEEN NOW() AND NOW() + INTERVAL '3 days'`
    )
  })
)

export type Subscription = typeof subscriptions.$inferSelect
export type NewSubscription = typeof subscriptions.$inferInsert
