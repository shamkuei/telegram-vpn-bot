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
import { paymentProviderEnum, paymentStatusEnum } from './enums'
import { users } from './users'
import { subscriptions } from './subscriptions'

export const paymentLogs = pgTable(
  'payment_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // User Association
    userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),

    // Payment Provider
    provider: paymentProviderEnum('provider').notNull(),

    // Payment Information
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),

    // Cryptocurrency (if applicable)
    cryptoAmount: decimal('crypto_amount', { precision: 20, scale: 8 }),
    cryptoCurrency: varchar('crypto_currency', { length: 20 }),
    cryptoAddress: varchar('crypto_address', { length: 256 }),

    // Status Tracking
    status: paymentStatusEnum('status').notNull().default('pending'),

    // Provider Reference
    providerTransactionId: varchar('provider_transaction_id', { length: 256 }),
    providerInvoiceId: varchar('provider_invoice_id', { length: 256 }),

    // Subscription Reference
    subscriptionId: bigint('subscription_id', { mode: 'number' }).references(() => subscriptions.id),

    // Metadata
    metadata: text('metadata'), // JSON string

    // Fraud Detection
    ipAddress: varchar('ip_address', { length: 45 }), // IPv6 compatible
    userAgent: text('user_agent'),
    riskScore: decimal('risk_score', { precision: 3, scale: 2 }),

    // Timestamps
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index('idx_payment_logs_user_id').on(table.userId),
    providerIdx: index('idx_payment_logs_provider').on(table.provider),
    statusIdx: index('idx_payment_logs_status').on(table.status),
    subscriptionIdIdx: index('idx_payment_logs_subscription_id').on(table.subscriptionId),
    providerInvoiceIdx: index('idx_payment_logs_provider_invoice').on(
      table.provider,
      table.providerInvoiceId
    ),
    createdAtIdx: index('idx_payment_logs_created_at').on(table.createdAt),
    expiredAtIdx: index('idx_payment_logs_expired_at').on(table.expiredAt),
    // Partial index for pending payments needing check (removed NOW() - not IMMUTABLE)
    pendingCheckIdx: index('idx_payment_logs_pending_check').on(
      table.id,
      table.userId,
      table.provider
    ).where(
      sql`${table.status} IN ('pending', 'processing')`
    )
  })
)

export type PaymentLog = typeof paymentLogs.$inferSelect
export type NewPaymentLog = typeof paymentLogs.$inferInsert
