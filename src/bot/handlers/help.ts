import { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'

// ============================================================================
// Types
// ============================================================================

type BotContext = Context

// ============================================================================
// Help Handler
// ============================================================================

export async function helpHandler(ctx: BotContext) {
  const keyboard = new InlineKeyboard()
    .text('📋 Plans', 'plans:view')
    .row()
    .text('💳 My Subscription', 'mysub:view')
    .row()
    .text('👤 Profile', 'profile:view')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    '📚 *Help & Commands*\n\n' +
    '*Available Commands:*\n' +
    '/start - Start the bot or return to main menu\n' +
    '/help - Show this help message\n' +
    '/plans - View available VPN plans\n' +
    '/mysub - View my subscriptions\n' +
    '/profile - View my profile and settings\n' +
    '/gift - Claim a gift code\n' +
    '/test - Get a free test account\n' +
    '/referral - Get my referral link\n\n' +
    '*How to use:*\n' +
    '1. View available plans with /plans\n' +
    '2. Select a plan and choose payment method\n' +
    '3. Complete payment to activate your subscription\n' +
    '4. Receive your VPN configuration\n\n' +
    'Need help? Contact support.',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )
}
