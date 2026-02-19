import {
  bigint,
  boolean,
  decimal,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core'
import { serverStatusEnum, serverTypeEnum } from './enums.js'
import { serverRegions } from './regions.js'

export const servers = pgTable(
  'servers',
  {
    id: serial('id').primaryKey(),

    // Server Information
    name: varchar('name', { length: 64 }).notNull(),
    description: text('description'),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    city: varchar('city', { length: 64 }).notNull(),

    // Marzban Integration
    marzbanNodeId: integer('marzban_node_id'),
    marzbanNodeName: varchar('marzban_node_name', { length: 128 }),

    // Server Configuration
    serverType: serverTypeEnum('server_type').notNull(),
    protocol: varchar('protocol', { length: 50 }).notNull(),

    // Capacity & Load
    maxUsers: integer('max_users').notNull().default(1000),
    currentUsers: integer('current_users').notNull().default(0),
    loadPercentage: decimal('load_percentage', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),

    // Bandwidth
    totalBandwidthGb: bigint('total_bandwidth_gb', { mode: 'number' }).notNull(),
    usedBandwidthGb: bigint('used_bandwidth_gb', { mode: 'number' }).notNull().default(0),

    // Server Status
    status: serverStatusEnum('status').notNull().default('active'),
    isPublic: boolean('is_public').notNull().default(true),
    priority: integer('priority').notNull().default(0),

    // Geographic Priority (for smart routing)
    regionId: integer('region_id').references(() => serverRegions.id),

    // Performance Metrics
    avgLatencyMs: integer('avg_latency_ms'),
    lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    statusIdx: index('idx_servers_status').on(table.status),
    countryCityIdx: index('idx_servers_country_city').on(table.countryCode, table.city),
    regionIdx: index('idx_servers_region').on(table.regionId),
    priorityIdx: index('idx_servers_priority').on(table.priority),
    loadIdx: index('idx_servers_load').on(table.loadPercentage),
    publicActiveIdx: index('idx_servers_public_active').on(table.id, table.status)
  })
)

export type Server = typeof servers.$inferSelect
export type NewServer = typeof servers.$inferInsert
