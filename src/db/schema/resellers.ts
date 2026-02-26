import {
  bigserial,
  bigint,
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { resellerStatusEnum, resellerTransactionTypeEnum, resellerTransactionStatusEnum } from './enums'
import { users } from './users'
import { subscriptions } from './subscriptions'
import { paymentLogs } from './payments'

export const resellers = pgTable(
  'resellers',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // User Association
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Reseller Information
    businessName: varchar('business_name', { length: 128 }),
    taxId: varchar('tax_id', { length: 50 }),

    // Tier & Commission
    tier: varchar('tier', { length: 20 }).notNull().default('bronze'),
    commissionRate: decimal('commission_rate', { precision: 4, scale: 2 }).notNull(), // Percentage

    // Limits
    maxMonthlySalesCents: integer('max_monthly_sales_cents'),
    currentMonthSalesCents: integer('current_month_sales_cents').notNull().default(0),
    currentMonthStart: text('current_month_start').notNull().default(
      sql`DATE_TRUNC('month', CURRENT_DATE)::text`
    ),

    // Balance
    pendingCommissionCents: integer('pending_commission_cents').notNull().default(0),
    paidCommissionCents: integer('paid_commission_cents').notNull().default(0),

    // Status
    status: resellerStatusEnum('status').notNull().default('pending'),

    // Approval
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: bigint('approved_by', { mode: 'number' }).references(() => users.id),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index('idx_resellers_user_id').on(table.userId),
    statusIdx: index('idx_resellers_status').on(table.status),
    tierIdx: index('idx_resellers_tier').on(table.tier)
  })
)

export type Reseller = typeof resellers.$inferSelect
export type NewReseller = typeof resellers.$inferInsert

export const resellerTransactions = pgTable(
  'reseller_transactions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // Reseller Association
    resellerId: bigint('reseller_id', { mode: 'number' })
      .notNull()
      .references(() => resellers.id, { onDelete: 'cascade' }),

    // Customer (who made the purchase)
    customerId: bigint('customer_id', { mode: 'number' }).notNull().references(() => users.id),

    // Transaction Details
    transactionType: resellerTransactionTypeEnum('transaction_type').notNull(),

    // Sale Amount
    saleAmountCents: integer('sale_amount_cents').notNull(),
    commissionCents: integer('commission_cents').notNull(),

    // Reference
    subscriptionId: bigint('subscription_id', { mode: 'number' }).references(() => subscriptions.id),
    paymentLogId: bigint('payment_log_id', { mode: 'number' }).references(() => paymentLogs.id),

    // Status
    status: resellerTransactionStatusEnum('status').notNull().default('pending'),

    // Payout Tracking
    payoutId: bigint('payout_id', { mode: 'number' }),
    payoutDate: timestamp('payout_date', { withTimezone: true }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    resellerIdIdx: index('idx_reseller_txns_reseller_id').on(table.resellerId),
    customerIdIdx: index('idx_reseller_txns_customer_id').on(table.customerId),
    typeIdx: index('idx_reseller_txns_type').on(table.transactionType),
    statusIdx: index('idx_reseller_txns_status').on(table.status),
    createdAtIdx: index('idx_reseller_txns_created_at').on(table.createdAt),
    pendingPayoutIdx: index('idx_reseller_txns_pending_payout').on(
      table.id,
      table.resellerId,
      table.commissionCents
    )
  })
)

export type ResellerTransaction = typeof resellerTransactions.$inferSelect
export type NewResellerTransaction = typeof resellerTransactions.$inferInsert
