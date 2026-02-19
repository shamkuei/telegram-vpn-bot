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
import { usageAlertTypeEnum } from './enums.js'
import { users } from './users.js'
import { subscriptions } from './subscriptions.js'

export const usageAlerts = pgTable(
  'usage_alerts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // User Association
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Subscription Association
    subscriptionId: bigint('subscription_id', { mode: 'number' })
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),

    // Alert Type
    alertType: usageAlertTypeEnum('alert_type').notNull(),

    // Alert Data
    thresholdPercentage: integer('threshold_percentage'),
    currentUsageGb: bigint('current_usage_gb', { mode: 'number' }),
    limitGb: bigint('limit_gb', { mode: 'number' }),

    // Delivery Status
    sentViaTelegram: boolean('sent_via_telegram').notNull().default(false),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),

    // Action Taken
    userAction: varchar('user_action', { length: 20 }), // renewed, upgraded, ignored
    actionTakenAt: timestamp('action_taken_at', { withTimezone: true }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index('idx_usage_alerts_user_id').on(table.userId),
    subscriptionIdIdx: index('idx_usage_alerts_subscription_id').on(table.subscriptionId),
    typeIdx: index('idx_usage_alerts_type').on(table.alertType),
    createdAtIdx: index('idx_usage_alerts_created_at').on(table.createdAt),
    unreadIdx: index('idx_usage_alerts_unread').on(table.userId, table.readAt)
  })
)

export type UsageAlert = typeof usageAlerts.$inferSelect
export type NewUsageAlert = typeof usageAlerts.$inferInsert
