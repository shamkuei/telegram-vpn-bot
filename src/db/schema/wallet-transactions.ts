import {
  bigserial,
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean
} from 'drizzle-orm/pg-core'
import { walletTransactionTypeEnum, walletTransactionStatusEnum } from './enums.js'
import { wallets } from './wallets.js'
import { users } from './users.js'

export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // Wallet Association
    walletId: bigint('wallet_id', { mode: 'number' })
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),

    // Transaction Information
    type: walletTransactionTypeEnum('type').notNull(),

    // Amount
    amountCents: integer('amount_cents').notNull(),
    balanceBeforeCents: integer('balance_before_cents').notNull(),
    balanceAfterCents: integer('balance_after_cents').notNull(),

    // Reference
    referenceType: varchar('reference_type', { length: 50 }),
    referenceId: varchar('reference_id', { length: 100 }),
    description: text('description'),

    // Status
    status: walletTransactionStatusEnum('status').notNull().default('completed'),

    // Admin Actions
    isManual: boolean('is_manual').notNull().default(false),
    adminId: bigint('admin_id', { mode: 'number' }).references(() => users.id),
    adminNote: text('admin_note'),

    // Reversal Tracking
    reversedByTransactionId: bigint('reversed_by_transaction_id', { mode: 'number' }).references(
      () => walletTransactions.id
    ),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    walletIdIdx: index('idx_wallet_txns_wallet_id').on(table.walletId),
    typeIdx: index('idx_wallet_txns_type').on(table.type),
    statusIdx: index('idx_wallet_txns_status').on(table.status),
    createdAtIdx: index('idx_wallet_txns_created_at').on(table.createdAt),
    referenceIdx: index('idx_wallet_txns_reference').on(table.referenceType, table.referenceId),
    reversalIdx: index('idx_wallet_txns_reversal').on(table.reversedByTransactionId),
    balanceHistoryIdx: index('idx_wallet_txns_balance_history').on(
      table.walletId,
      table.createdAt,
      table.amountCents
    )
  })
)

export type WalletTransaction = typeof walletTransactions.$inferSelect
export type NewWalletTransaction = typeof walletTransactions.$inferInsert
