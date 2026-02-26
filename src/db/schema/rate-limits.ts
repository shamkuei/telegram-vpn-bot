import {
  bigserial,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
  unique
} from 'drizzle-orm/pg-core'
import { rateLimitTargetTypeEnum } from './enums'

export const rateLimits = pgTable(
  'rate_limits',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // Target
    targetType: rateLimitTargetTypeEnum('target_type').notNull(),
    targetId: varchar('target_id', { length: 100 }).notNull(),

    // Endpoint/Action
    endpoint: varchar('endpoint', { length: 100 }).notNull(),

    // Limits
    maxRequests: integer('max_requests').notNull(),
    windowSeconds: integer('window_seconds').notNull(),

    // Current Count
    currentCount: integer('current_count').notNull().default(0),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),

    // Block Status
    isBlocked: boolean('is_blocked').notNull().default(false),
    blockedUntil: timestamp('blocked_until', { withTimezone: true }),
    blockCount: integer('block_count').notNull().default(0),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    targetIdx: index('idx_rate_limits_target').on(table.targetType, table.targetId),
    endpointIdx: index('idx_rate_limits_endpoint').on(table.endpoint),
    isBlockedIdx: index('idx_rate_limits_is_blocked').on(table.isBlocked),
    windowStartIdx: index('idx_rate_limits_window_start').on(table.windowStart),
    lookupIdx: index('idx_rate_limits_lookup').on(
      table.targetType,
      table.targetId,
      table.endpoint,
      table.windowStart
    ),
    targetEndpointUnique: unique('rate_limits_target_endpoint_unique').on(
      table.targetType,
      table.targetId,
      table.endpoint
    )
  })
)

export type RateLimit = typeof rateLimits.$inferSelect
export type NewRateLimit = typeof rateLimits.$inferInsert
