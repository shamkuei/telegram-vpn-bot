import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core'
import { promoDiscountTypeEnum } from './enums.js'
import { users } from './users.js'
import { plans } from './plans.js'

export const promoCodes = pgTable(
  'promo_codes',
  {
    id: serial('id').primaryKey(),

    // Code Information
    code: varchar('code', { length: 50 }).notNull().unique(),

    // Discount
    discountType: promoDiscountTypeEnum('discount_type').notNull(),
    discountValue: integer('discount_value').notNull(), // Percentage (0-100) or fixed amount in cents
    maxDiscountCents: integer('max_discount_cents'), // Cap on discount amount

    // Applicability
    appliesToPlanIds: integer('applies_to_plan_ids').array(),
    minPurchaseCents: integer('min_purchase_cents').default(0),

    // Usage Limits
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').notNull().default(0),
    maxUsesPerUser: integer('max_uses_per_user').notNull().default(1),

    // Validity
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }),

    // Status
    isActive: boolean('is_active').notNull().default(true),

    // Creator
    createdBy: bigint('created_by', { mode: 'number' }).references(() => users.id),
    note: text('note'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    codeIdx: index('idx_promo_codes_code').on(table.code),
    isActiveIdx: index('idx_promo_codes_is_active').on(table.isActive),
    validityIdx: index('idx_promo_codes_validity').on(table.validFrom, table.validUntil)
  })
)

export type PromoCode = typeof promoCodes.$inferSelect
export type NewPromoCode = typeof promoCodes.$inferInsert
