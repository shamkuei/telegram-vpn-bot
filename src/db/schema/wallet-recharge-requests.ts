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
import { walletRechargeStatusEnum } from './enums'
import { users } from './users'

export const walletRechargeRequests = pgTable(
  'wallet_recharge_requests',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // User Association
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Admin who verified
    verifiedBy: bigint('verified_by', { mode: 'number' }).references(() => users.id),

    // Recharge Amount
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),

    // Request Status
    status: walletRechargeStatusEnum('status').notNull().default('awaiting_screenshot'),

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

    // Wallet Transaction Result (created after approval)
    walletTransactionId: bigint('wallet_transaction_id', { mode: 'number' }),

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
    userIdIdx: index('idx_wallet_recharge_user_id').on(table.userId),
    statusIdx: index('idx_wallet_recharge_status').on(table.status),
    verifiedByIdx: index('idx_wallet_recharge_verified_by').on(table.verifiedBy),
    createdAtIdx: index('idx_wallet_recharge_created_at').on(table.createdAt),
    expiresAtIdx: index('idx_wallet_recharge_expires_at').on(table.expiresAt),
    // Partial index for pending requests needing verification
    pendingVerificationIdx: index('idx_wallet_recharge_pending').on(
      table.id,
      table.userId,
      table.createdAt
    ).where(
      sql`${table.status} = 'pending' AND ${table.screenshotFileId} IS NOT NULL`
    ),
    // Partial index for expiring pending requests
    expiringPendingIdx: index('idx_wallet_recharge_expiring_pending').on(
      table.id,
      table.userId
    ).where(
      sql`${table.status} = 'pending'`
    )
  })
)

export type WalletRechargeRequest = typeof walletRechargeRequests.$inferSelect
export type NewWalletRechargeRequest = typeof walletRechargeRequests.$inferInsert
