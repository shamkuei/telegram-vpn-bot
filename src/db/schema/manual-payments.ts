import {
  bigserial,
  bigint,
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { manualPaymentStatusEnum } from './enums'
import { users } from './users'
import { plans } from './plans'

export const manualPayments = pgTable(
  'manual_payments',
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

    // Admin who verified
    verifiedBy: bigint('verified_by', { mode: 'number' }).references(() => users.id),

    // Payment Amount
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),

    // Payment Status
    status: manualPaymentStatusEnum('status').notNull().default('pending'),

    // Screenshot Information
    screenshotFileId: varchar('screenshot_file_id', { length: 256 }),
    screenshotFileUniqueId: varchar('screenshot_file_unique_id', { length: 256 }).notNull(),
    screenshotFilePath: varchar('screenshot_file_path', { length: 512 }),
    screenshotMimeType: varchar('screenshot_mime_type', { length: 100 }),
    screenshotFileSizeBytes: integer('screenshot_file_size_bytes'),

    // Payment Reference (Transaction ID, Note, etc.)
    paymentReference: varchar('payment_reference', { length: 256 }),
    userNote: text('user_note'),

    // Admin Notes
    adminNote: text('admin_note'),
    rejectionReason: text('rejection_reason'),

    // Subscription Result (created after approval)
    subscriptionId: bigint('subscription_id', { mode: 'number' }),

    // Fraud Detection
    ipAddress: varchar('ip_address', { length: 45 }),
    riskScore: decimal('risk_score', { precision: 3, scale: 2 }).default('0'),

    // Timestamps
    screenshotReceivedAt: timestamp('screenshot_received_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index('idx_manual_payments_user_id').on(table.userId),
    planIdIdx: index('idx_manual_payments_plan_id').on(table.planId),
    statusIdx: index('idx_manual_payments_status').on(table.status),
    verifiedByIdx: index('idx_manual_payments_verified_by').on(table.verifiedBy),
    createdAtIdx: index('idx_manual_payments_created_at').on(table.createdAt),
    expiresAtIdx: index('idx_manual_payments_expires_at').on(table.expiresAt),
    // Partial index for pending payments needing verification
    pendingVerificationIdx: index('idx_manual_payments_pending').on(
      table.id,
      table.userId,
      table.createdAt
    ).where(
      sql`${table.status} = 'pending' AND ${table.screenshotFileId} IS NOT NULL`
    ),
    // Partial index for expiring pending payments (removed NOW() - not IMMUTABLE)
    expiringPendingIdx: index('idx_manual_payments_expiring_pending').on(
      table.id,
      table.userId
    ).where(
      sql`${table.status} = 'pending'`
    )
  })
)

export type ManualPayment = typeof manualPayments.$inferSelect
export type NewManualPayment = typeof manualPayments.$inferInsert
