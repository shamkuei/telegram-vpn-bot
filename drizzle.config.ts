import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vpn_bot'
  },
  tablesFilter: ['public.*'],
  verbose: true,
  strict: true
} satisfies Config
