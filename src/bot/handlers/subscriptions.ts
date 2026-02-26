import { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { subscriptionQueries } from '@/db/queries'
import { getUserSubscriptionsText, getSubscriptionKeyboard } from '@/bot/utils/subscription'

// ============================================================================
// Types
// ============================================================================

type BotContext = Context

// ============================================================================
// My Subscriptions Handler
// ============================================================================

export async function mySubscriptionsHandler(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  const subscriptions = await subscriptionQueries.getActiveByUserId(user.id)

  if (subscriptions.length === 0) {
    const keyboard = new InlineKeyboard()
      .text('📦 Browse Plans', 'plans:page:1')
      .row()
      .text('🏠 Main Menu', 'menu:main')

    await ctx.reply(
      '📭 *You have no active subscriptions*\n\n' +
      'Browse our plans and get connected!',
      { parse_mode: 'Markdown', reply_markup: keyboard }
    )
    return
  }

  let message = `👤 *My Subscriptions* (${subscriptions.length})\n\n`

  for (const subscription of subscriptions) {
    const { statusIcon, statusText } = getSubscriptionStatus(subscription)
    const daysRemaining = Math.floor(
      (new Date(subscription.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )

    message += `
${statusIcon} *${subscription.plan?.name || 'Unknown Plan'}*
   Status: ${statusText}
   Expires: ${daysRemaining > 0 ? `in ${daysRemaining} days` : 'expired'}
   ${subscription.serverId ? `🌍 Server ID: ${subscription.serverId}` : ''}
`
  }

  const keyboard = getSubscriptionKeyboard(subscriptions[0]) // Show options for first subscription

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// Subscription Detail Handler
// ============================================================================

export async function subscriptionDetailHandler(ctx: BotContext) {
  const subscriptionId = parseInt(ctx.match?.[2] || '0')

  if (!subscriptionId) {
    return await mySubscriptionsHandler(ctx)
  }

  const { subscriptionQueries } = await import('@/db/queries.js')
  const subscription = await subscriptionQueries.findById(subscriptionId)

  if (!subscription) {
    await ctx.reply('❌ Subscription not found')
    return
  }

  const message = await getUserSubscriptionsText(subscription)
  const keyboard = getSubscriptionKeyboard(subscription)

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// Helpers
// ============================================================================

function getSubscriptionStatus(subscription: any) {
  switch (subscription.status) {
    case 'active':
      return { statusIcon: '✅', statusText: 'Active' }
    case 'expiring':
      return { statusIcon: '⚠️', statusText: 'Expiring Soon' }
    case 'expired':
      return { statusIcon: '❌', statusText: 'Expired' }
    case 'suspended':
      return { statusIcon: '🔒', statusText: 'Suspended' }
    default:
      return { statusIcon: '❓', statusText: subscription.status }
  }
}
