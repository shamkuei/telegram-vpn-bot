import { Bot, GrammyError, session } from 'grammy'
import { autoRetry } from '@grammyjs/auto-retry'
import { hydrateReply, parseMode } from 'grammy_parse_mode'
import { conversations, createConversation } from '@grammyjs/conversations'
import { config } from '@/config/index.js'
import { SessionStore } from '@/cache/index.js'

// ============================================================================
// Bot Setup
// ============================================================================

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN)

// Auto-retry middleware
bot.api.config.use(autoRetry({
  maxRetryAttempts: 3,
  maxDelaySeconds: 60
}))

// Parse mode middleware
bot.use(hydrateReply)

// Session middleware
bot.use(
  session({
    initial: () => ({}),
    getSessionKey: (ctx) => {
      return ctx.from?.id.toString()
    },
    storage: {
      async get(key) {
        const telegramId = parseInt(key)
        const session = await SessionStore.get(telegramId)
        return session || undefined
      },
      async set(key, value) {
        const telegramId = parseInt(key)
        await SessionStore.set(telegramId, value)
      },
      async delete(key) {
        const telegramId = parseInt(key)
        await SessionStore.delete(telegramId)
      }
    }
  })
)

// ============================================================================
// Context Type
// ============================================================================

export interface BotSession {
  state?: string
  selectedPlan?: number
  selectedServer?: number
  pendingPaymentId?: number
  awaitingReference?: boolean
  awaitingRejectionReason?: boolean
  rejectingPaymentId?: number
  pendingPayment?: {
    amount: number
    provider: string
    invoiceId: string
  }
  language?: string
  marzbanUsername?: string
}

export type BotContext = Context & {
  session: BotSession
}

// ============================================================================
// Import Handlers
// ============================================================================

import { startHandler } from './handlers/start.js'
import { helpHandler } from './handlers/help.js'
import { plansHandler } from './handlers/plans.js'
import { mySubscriptionsHandler } from './handlers/subscriptions.js'
import { paymentHandler, handleScreenshotUpload, handlePaymentReferenceInput } from './handlers/payment.js'
import { profileHandler } from './handlers/profile.js'
import { giftHandler } from './handlers/gift.js'
import { testAccountHandler } from './handlers/test-account.js'
import { referralHandler } from './handlers/referral.js'
import { adminHandler, handlePaymentRejectionReason } from './handlers/admin.js'

// ============================================================================
// Register Handlers
// ============================================================================

// Start command
bot.command('start', startHandler)

// Help command
bot.command('help', helpHandler)

// Plans
bot.command('plans', plansHandler)
bot.callbackQuery(/^plans:/, plansHandler)

// My subscriptions
bot.command('mysub', mySubscriptionsHandler)
bot.callbackQuery(/^mysub:/, mySubscriptionsHandler)

// Payment
bot.callbackQuery(/^payment:/, paymentHandler)

// Profile
bot.command('profile', profileHandler)
bot.callbackQuery(/^profile:/, profileHandler)

// Gift codes
bot.command('gift', giftHandler)
bot.callbackQuery(/^gift:/, giftHandler)

// Test accounts
bot.command('test', testAccountHandler)
bot.callbackQuery(/^test:/, testAccountHandler)

// Referral
bot.command('referral', referralHandler)
bot.callbackQuery(/^referral:/, referralHandler)

// Admin commands
bot.command('admin', adminHandler)
bot.command('verify_payment', adminHandler)
bot.command('payments', adminHandler)
bot.callbackQuery(/^admin:/, adminHandler)

// ============================================================================
// Handle Photo Messages (for screenshots)
// ============================================================================

bot.on('msg:photo', async (ctx) => {
  // Check if user has a pending payment
  const pendingPaymentId = (ctx.session as any).pendingPaymentId
  if (pendingPaymentId) {
    await handleScreenshotUpload(ctx)
    return
  }
})

// ============================================================================
// Handle Text Messages (for transaction reference & rejection reason)
// ============================================================================

bot.on('msg:text', async (ctx) => {
  const text = ctx.message?.text
  if (!text) return

  // Check if awaiting rejection reason (admin)
  const rejectionHandled = await handlePaymentRejectionReason(ctx, text)
  if (rejectionHandled) return

  // Check if awaiting payment reference (user)
  const handled = await handlePaymentReferenceInput(ctx, text)
  if (handled) return
})

// ============================================================================
// Error Handler
// ============================================================================

bot.catch((err) => {
  console.error('Bot error:', err)

  if (err instanceof GrammyError) {
    return ctx.reply(
      '⚠️ An error occurred while processing your request. Please try again later.'
    )
  }

  return ctx.reply(
    '⚠️ An unexpected error occurred. Our team has been notified.'
  )
})

// ============================================================================
// Webhook/Poling Setup
// ============================================================================

/**
 * Handle Telegram update
 */
export async function handleTelegramUpdate(update: any) {
  await bot.handleUpdate(update)
}

/**
 * Start webhook mode
 */
export async function startWebhook() {
  const url = config.TELEGRAM_WEBHOOK_URL

  if (!url) {
    throw new Error('TELEGRAM_WEBHOOK_URL is required for webhook mode')
  }

  // Set webhook
  await bot.api.setWebhook(url)

  console.log(`🤖 Bot webhook set to: ${url}`)
}

/**
 * Start polling mode (development)
 */
export async function startPolling() {
  console.log('🤖 Starting bot in polling mode...')

  await bot.start({
    drop_pending_updates: true,
    onStart: () => {
      console.log('✅ Bot started successfully')
    }
  })
}

/**
 * Stop bot
 */
export async function stopBot() {
  console.log('🛑 Stopping bot...')
  await bot.stop()
  console.log('✅ Bot stopped')
}

// ============================================================================
// Bot Info
// ============================================================================

export async function getBotInfo() {
  return await bot.api.getMe()
}

export async function setBotCommands() {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'Show help and available commands' },
    { command: 'plans', description: 'View available VPN plans' },
    { command: 'mysub', description: 'View my subscriptions' },
    { command: 'profile', description: 'View my profile and settings' },
    { command: 'referral', description: 'Get my referral link' },
    { command: 'gift', description: 'Claim a gift code' },
    { command: 'test', description: 'Get a free test account' }
  ])
}

export { bot as default }
