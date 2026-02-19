import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core'
import { users } from './users.js'

export const featureFlags = pgTable(
  'feature_flags',
  {
    id: serial('id').primaryKey(),

    // Flag Information
    name: varchar('name', { length: 100 }).notNull().unique(),
    description: text('description'),

    // Flag Configuration
    isEnabled: boolean('is_enabled').notNull().default(false),
    rolloutPercentage: integer('rollout_percentage').notNull().default(0), // 0-100

    // Targeting
    allowedUserIds: bigint('allowed_user_ids', { mode: 'number' }).array(),
    allowedUserTiers: varchar('allowed_user_tiers', { length: 50 }).array(),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    nameIdx: index('idx_feature_flags_name').on(table.name),
    isEnabledIdx: index('idx_feature_flags_is_enabled').on(table.isEnabled)
  })
)

export type FeatureFlag = typeof featureFlags.$inferSelect
export type NewFeatureFlag = typeof featureFlags.$inferInsert

export const userFeatureFlags = pgTable(
  'user_feature_flags',
  {
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    featureFlagId: integer('feature_flag_id')
      .notNull()
      .references(() => featureFlags.id, { onDelete: 'cascade' }),
    isEnabled: boolean('is_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index('idx_user_feature_flags_user').on(table.userId),
    featureFlagIdIdx: index('idx_user_feature_flags_flag').on(table.featureFlagId),
    isEnabledIdx: index('idx_user_feature_flags_enabled').on(table.isEnabled)
  })
)

export type UserFeatureFlag = typeof userFeatureFlags.$inferSelect
export type NewUserFeatureFlag = typeof userFeatureFlags.$inferInsert
