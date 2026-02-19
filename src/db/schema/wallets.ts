import {
  bigserial,
  bigint,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  boolean,
  text
} from 'drizzle-orm/pg-core'
import { users } from './users.js'

export const wallets = pgTable(
  'wallets',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // User Association
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Balance (in smallest currency unit)
    balanceCents: integer('balance_cents').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),

    // Credit/Limit
    creditLimitCents: integer('credit_limit_cents').notNull().default(0),
    frozenBalanceCents: integer('frozen_balance_cents').notNull().default(0), // Held for pending transactions

    // Wallet Status
    isActive: boolean('is_active').notNull().default(true),
    isFrozen: boolean('is_frozen').notNull().default(false),
    freezeReason: text('freeze_reason'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index('idx_wallets_user_id').on(table.userId),
    isActiveIdx: index('idx_wallets_is_active').on(table.isActive),
    isFrozenIdx: index('idx_wallets_is_frozen').on(table.isFrozen)
  })
)

export type Wallet = typeof wallets.$inferSelect
export type NewWallet = typeof wallets.$inferInsert
