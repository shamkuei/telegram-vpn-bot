import {
  bigserial,
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core'
import { auditActorTypeEnum, auditStatusEnum } from './enums.js'

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // Actor
    actorType: auditActorTypeEnum('actor_type').notNull(),
    actorId: bigint('actor_id', { mode: 'number' }),

    // Action
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: bigint('entity_id', { mode: 'number' }),

    // Changes
    oldValues: text('old_values'), // JSON string
    newValues: text('new_values'), // JSON string

    // Context
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    requestId: varchar('request_id', { length: 100 }),

    // Result
    status: auditStatusEnum('status').notNull(),
    errorMessage: text('error_message'),

    // Metadata
    metadata: text('metadata'), // JSON string

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    actorIdx: index('idx_audit_logs_actor').on(table.actorType, table.actorId),
    actionIdx: index('idx_audit_logs_action').on(table.action),
    entityIdx: index('idx_audit_logs_entity').on(table.entityType, table.entityId),
    createdAtIdx: index('idx_audit_logs_created_at').on(table.createdAt),
    ipAddressIdx: index('idx_audit_logs_ip_address').on(table.ipAddress),
    requestIdIdx: index('idx_audit_logs_request_id').on(table.requestId),
    // Partial index for failed actions (security monitoring)
    failedIdx: index('idx_audit_logs_failed').on(table.actorType, table.actorId, table.createdAt).where(
      sql`${table.status} = 'failed'`
    )
  })
)

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
