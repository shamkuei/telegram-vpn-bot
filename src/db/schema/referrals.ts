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
import { referralStatusEnum } from './enums'
import { users } from './users'

export const referrals = pgTable(
  'referrals',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // Referrer (who invited)
    referrerId: bigint('referrer_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Referred (who was invited)
    referredId: bigint('referred_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Referral Code Used
    referralCode: varchar('referral_code', { length: 20 }).notNull(),

    // Reward Status
    status: referralStatusEnum('status').notNull().default('pending'),

    // Reward Amount
    rewardCents: integer('reward_cents').notNull().default(0),
    rewardCurrency: varchar('reward_currency', { length: 3 }).notNull().default('USD'),

    // Completion Requirements
    requiredPurchaseCents: integer('required_purchase_cents'),
    purchasedAmountCents: integer('purchased_amount_cents').notNull().default(0),

    // Fraud Detection
    isSuspicious: boolean('is_suspicious').notNull().default(false),
    suspicionReason: text('suspicion_reason'),

    // Timestamps
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    referrerIdIdx: index('idx_referrals_referrer_id').on(table.referrerId),
    referredIdIdx: index('idx_referrals_referred_id').on(table.referredId),
    statusIdx: index('idx_referrals_status').on(table.status),
    codeIdx: index('idx_referrals_code').on(table.referralCode),
    completedAtIdx: index('idx_referrals_completed_at').on(table.completedAt),
    expiringIdx: index('idx_referrals_expiring').on(table.id, table.referrerId, table.expiresAt),
    referrerReferredUnique: unique('referrer_referred_unique').on(table.referrerId, table.referredId)
  })
)

export type Referral = typeof referrals.$inferSelect
export type NewReferral = typeof referrals.$inferInsert
