import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  boolean,
  bigint
} from 'drizzle-orm/pg-core'
import { planTypeEnum, serverAccessTypeEnum } from './enums.js'

export const plans = pgTable(
  'plans',
  {
    id: serial('id').primaryKey(),

    // Plan Information
    name: varchar('name', { length: 64 }).notNull(),
    nameFa: varchar('name_fa', { length: 64 }),
    description: text('description'),
    descriptionFa: text('description_fa'),

    // Plan Type
    planType: planTypeEnum('plan_type').notNull(),

    // Duration
    durationDays: integer('duration_days').notNull(),

    // Pricing (in smallest currency unit, e.g., cents for USD)
    priceUsdCents: integer('price_usd_cents').notNull(),
    priceRial: bigint('price_rial', { mode: 'number' }),

    // Data Limits
    dataLimitGb: bigint('data_limit_gb', { mode: 'number' }),

    // Device Limits
    deviceLimit: integer('device_limit').notNull().default(1),

    // Server Access
    serverAccessType: serverAccessTypeEnum('server_access_type').notNull().default('all'),
    allowedRegionIds: integer('allowed_region_ids').array(),
    allowedServerIds: integer('allowed_server_ids').array(),

    // Plan Status
    isActive: boolean('is_active').notNull().default(true),
    isPublic: boolean('is_public').notNull().default(true),
    isFeatured: boolean('is_featured').notNull().default(false),
    priority: integer('priority').notNull().default(0),

    // Test Account Config
    maxTestAccountsPerUser: integer('max_test_accounts_per_user').notNull().default(3),
    testDurationMinutes: integer('test_duration_minutes').notNull().default(60),

    // Smart Alert Config
    usageAlertThreshold1: integer('usage_alert_threshold_1').default(80), // Alert at 80%
    usageAlertThreshold2: integer('usage_alert_threshold_2').default(95), // Alert at 95%

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    isActiveIdx: index('idx_plans_is_active').on(table.isActive, table.isPublic),
    planTypeIdx: index('idx_plans_plan_type').on(table.planType),
    featuredIdx: index('idx_plans_featured').on(table.priority).where(sql`${table.isFeatured} = true`),
    priceIdx: index('idx_plans_price').on(table.priceUsdCents)
  })
)

export type Plan = typeof plans.$inferSelect
export type NewPlan = typeof plans.$inferInsert
