import { z } from 'zod'

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_NAME: z.string().default('telegram-vpn-bot'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Database
  DATABASE_URL: z.string().url(),
  DB_POOL_MIN: z.coerce.number().default(5),
  DB_POOL_MAX: z.coerce.number().default(50),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),
  REDIS_PREFIX: z.string().default('vpn_bot:'),

  // Marzban API
  MARZBAN_API_URL: z.string().url(),
  MARZBAN_ADMIN_USERNAME: z.string(),
  MARZBAN_ADMIN_PASSWORD: z.string(),
  MARZBAN_TIMEOUT: z.coerce.number().default(30000),
  MARZBAN_RETRY_ATTEMPTS: z.coerce.number().default(3),
  MARZBAN_RETRY_DELAY: z.coerce.number().default(1000),

  // Telegram Bot
  TELEGRAM_BOT_TOKEN: z.string(),
  TELEGRAM_WEBHOOK_URL: z.string().optional(),
  TELEGRAM_ADMIN_IDS: z.string().transform((val) => val.split(',').map(Number)),
  TELEGRAM_LOG_CHANNEL_ID: z.coerce.number().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Payment Providers
  CRYPTOPAY_API_KEY: z.string().optional(),
  CRYPTOPAY_WEBHOOK_SECRET: z.string().optional(),
  NOWPAYMENTS_API_KEY: z.string().optional(),
  NOWPAYMENTS_API_IPN_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(30),
  RATE_LIMIT_ADMIN_MAX_REQUESTS: z.coerce.number().default(100),

  // GraphQL
  GRAPHQL_PLAYGROUND: z.string().transform((val) => val === 'true').default('true'),
  GRAPHQL_INTROSPECTION: z.string().transform((val) => val === 'true').default('true'),

  // Workers
  CONCURRENCY_PAYMENT_WORKER: z.coerce.number().default(5),
  CONCURRENCY_MARZBAN_WORKER: z.coerce.number().default(10),
  CONCURRENCY_NOTIFICATION_WORKER: z.coerce.number().default(20),
  CONCURRENCY_SCHEDULED_WORKER: z.coerce.number().default(3),

  // Monitoring
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default('development'),
  PROMETHEUS_ENABLED: z.string().transform((val) => val === 'true').default('false'),
  PROMETHEUS_PORT: z.coerce.number().default(9090),

  // Feature Flags
  ENABLE_TEST_ACCOUNTS: z.string().transform((val) => val === 'true').default('true'),
  ENABLE_GIFT_CODES: z.string().transform((val) => val === 'true').default('true'),
  ENABLE_RESELLER_SYSTEM: z.string().transform((val) => val === 'true').default('true'),
  ENABLE_REFERRAL_SYSTEM: z.string().transform((val) => val === 'true').default('true'),
  ENABLE_SMART_ALERTS: z.string().transform((val) => val === 'true').default('true')
})

export type Env = z.infer<typeof envSchema>

function validateEnv(): Env {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      throw new Error(
        `Environment validation failed:\n${missingVars.join('\n')}\n\nPlease check your .env file.`
      )
    }
    throw error
  }
}

export const config = validateEnv()

export const isDevelopment = config.NODE_ENV === 'development'
export const isProduction = config.NODE_ENV === 'production'
export const isTest = config.NODE_ENV === 'test'
