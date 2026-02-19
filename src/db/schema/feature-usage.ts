import {
  bigserial,
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core'
import { users } from './users.js'

export const featureUsage = pgTable(
  'feature_usage',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // User Association
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Feature
    featureCode: varchar('feature_code', { length: 50 }).notNull(),

    // Usage Data
    usageCount: integer('usage_count').notNull().default(1),
    usageMetadata: text('usage_metadata'), // JSON string

    // Timestamp
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

    // Context
    contextType: varchar('context_type', { length: 50 }), // test_account, subscription, etc.
    contextId: varchar('context_id', { length: 100 }),
    ipAddress: varchar('ip_address', { length: 45 })
  },
  (table) => ({
    userIdIdx: index('idx_feature_usage_user_id').on(table.userId),
    featureCodeIdx: index('idx_feature_usage_feature_code').on(table.featureCode),
    occurredAtIdx: index('idx_feature_usage_occurred_at').on(table.occurredAt),
    userFeatureIdx: index('idx_feature_usage_user_feature').on(
      table.userId,
      table.featureCode,
      table.occurredAt
    ),
    contextIdx: index('idx_feature_usage_context').on(table.contextType, table.contextId),
    ipAddressIdx: index('idx_feature_usage_ip_address').on(table.ipAddress)
  })
)

export type FeatureUsage = typeof featureUsage.$inferSelect
export type NewFeatureUsage = typeof featureUsage.$inferInsert
