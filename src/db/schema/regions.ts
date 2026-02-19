import { index, integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const serverRegions = pgTable(
  'server_regions',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 64 }).notNull().unique(),
    code: varchar('code', { length: 10 }).notNull().unique(),
    description: text('description'),
    priority: integer('priority').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    nameIdx: index('idx_regions_name').on(table.name),
    codeIdx: index('idx_regions_code').on(table.code),
    priorityIdx: index('idx_regions_priority').on(table.priority)
  })
)

export type ServerRegion = typeof serverRegions.$inferSelect
export type NewServerRegion = typeof serverRegions.$inferInsert
