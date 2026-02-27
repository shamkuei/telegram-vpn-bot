import 'dotenv/config'
import { Bot, GrammyError, session } from 'grammy'
import { autoRetry } from '@grammyjs/auto-retry'
// import { hydrateReply, parseMode } from 'grammy_parse_mode'
import { conversations, createConversation } from '@grammyjs/conversations'
import { config } from '@/config/index'

// ============================================================================
// Simple In-Memory Session Storage (for testing without Redis)
// ============================================================================

const memorySessions = new Map<string, any>()

const memoryStorage = {
  async read(key: string) {
    return memorySessions.get(key)
  },
  async write(key: string, value: any) {
    memorySessions.set(key, value)
  },
  async delete(key: string) {
    memorySessions.delete(key)
  }
}

// ============================================================================
// Bot Setup
// ============================================================================

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN)

// Auto-retry middleware
bot.api.config.use(autoRetry({
  maxRetryAttempts: 3,
  maxDelaySeconds: 60
}))

// Parse mode middleware (disabled - package not available)
// bot.use(hydrateReply)

// Session middleware (using in-memory storage for testing)
bot.use(
  session({
    initial: () => ({}),
    getSessionKey: (ctx) => {
      return ctx.from?.id.toString()
    },
    storage: memoryStorage
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
  pendingRechargeId?: number
  awaitingReference?: boolean
  awaitingRechargeReference?: boolean
  awaitingRechargeAmount?: boolean
  awaitingRejectionReason?: boolean
  awaitingRechargeRejectionReason?: boolean
  rejectingPaymentId?: number
  rejectingRechargeId?: number
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

import { startHandler } from './handlers/start'
import { helpHandler } from './handlers/help'
import { plansHandler, handleConfirmPurchase } from './handlers/plans'
import { mySubscriptionsHandler } from './handlers/subscriptions'
import { paymentHandler, handleScreenshotUpload, handlePaymentReferenceInput } from './handlers/payment'
import { profileHandler } from './handlers/profile'
import { giftHandler } from './handlers/gift'
import { testAccountHandler } from './handlers/test-account'
import { referralHandler } from './handlers/referral'
import {
  adminHandler,
  handlePaymentRejectionReason,
  handleRechargeRejectionReason
} from './handlers/admin'
import {
  walletHandler,
  handleWalletScreenshotUpload,
  handleWalletRechargeReferenceInput,
  handleRechargeAmountInput
} from './handlers/wallet'

// ============================================================================
// Register Handlers
// ============================================================================

// Start command
bot.command('start', startHandler)

// Help command
bot.command('help', helpHandler)

// Plans
bot.command('plans', plansHandler)
bot.callbackQuery(/^plans:(?!confirm)/, plansHandler)
bot.callbackQuery(/^plans:confirm:/, async (ctx) => {
  const planId = parseInt(ctx.match?.[3] || '0')
  await handleConfirmPurchase(ctx, planId)
})

// Wallet
bot.callbackQuery(/^wallet:/, walletHandler)

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
bot.command('recharge', adminHandler)
bot.callbackQuery(/^admin:/, adminHandler)

// Wallet command
bot.command('wallet', walletHandler)

// ============================================================================
// Handle Photo Messages (for screenshots)
// ============================================================================

bot.on('msg:photo', async (ctx) => {
  // Check if user has a pending wallet recharge
  const pendingRechargeId = (ctx.session as any).pendingRechargeId
  if (pendingRechargeId) {
    await handleWalletScreenshotUpload(ctx)
    return
  }

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

  // Check if awaiting recharge amount (user)
  const rechargeAmountHandled = await handleRechargeAmountInput(ctx, text)
  if (rechargeAmountHandled) return

  // Check if awaiting rejection reason (admin - payment)
  const rejectionHandled = await handlePaymentRejectionReason(ctx, text)
  if (rejectionHandled) return

  // Check if awaiting recharge rejection reason (admin - recharge)
  const rechargeRejectionHandled = await handleRechargeRejectionReason(ctx, text)
  if (rechargeRejectionHandled) return

  // Check if awaiting wallet recharge reference (user)
  const rechargeReferenceHandled = await handleWalletRechargeReferenceInput(ctx, text)
  if (rechargeReferenceHandled) return

  // Check if awaiting payment reference (user)
  const handled = await handlePaymentReferenceInput(ctx, text)
  if (handled) return
})

// ============================================================================
// Error Handler
// ============================================================================

bot.catch((err) => {
  console.error('Bot error:', err)

  if (err.ctx) {
    if (err instanceof GrammyError) {
      err.ctx.reply(
        '⚠️ An error occurred while processing your request. Please try again later.'
      ).catch(() => {})
    } else {
      err.ctx.reply(
        '⚠️ An unexpected error occurred. Our team has been notified.'
      ).catch(() => {})
    }
  }
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
    { command: 'wallet', description: 'View wallet balance and top up' },
    { command: 'mysub', description: 'View my subscriptions' },
    { command: 'profile', description: 'View my profile and settings' },
    { command: 'referral', description: 'Get my referral link' },
    { command: 'gift', description: 'Claim a gift code' },
    { command: 'test', description: 'Get a free test account' }
  ])
}

export { bot as default }

// ============================================================================
// Auto-start when run directly
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  startPolling().catch((err) => {
    console.error('Failed to start bot:', err)
    process.exit(1)
  })
}
