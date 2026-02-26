import { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { getUserProfileText } from '@/bot/utils/profile'

// ============================================================================
// Types
// ============================================================================

type BotContext = Context

// ============================================================================
// Profile Handler
// ============================================================================

export async function profileHandler(ctx: BotContext) {
  const action = ctx.match?.[2] || ''

  switch (action) {
    case 'view':
      await handleViewProfile(ctx)
      break
    case 'edit':
      await handleEditProfile(ctx)
      break
    case 'vpn_keys':
      await handleViewVpnKeys(ctx)
      break
    default:
      await handleViewProfile(ctx)
  }
}

// ============================================================================
// View Profile
// ============================================================================

async function handleViewProfile(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const { userQueries, walletQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  // Get wallet
  let wallet = await walletQueries.getByUserId(user.id)
  if (!wallet) {
    wallet = await walletQueries.create(user.id)
  }

  const message = getUserProfileText(user, wallet)

  const keyboard = new InlineKeyboard()
    .text('🔑 My VPN Keys', 'profile:vpn_keys')
    .row()
    .text('💳 My Wallet', 'wallet:view')
    .row()
    .text('👥 Referral Link', `referral:view`)
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// View VPN Keys
// ============================================================================

async function handleViewVpnKeys(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const { userQueries, vpnAccountQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  const vpnAccounts = await vpnAccountQueries.getActiveByUserId(user.id)

  if (vpnAccounts.length === 0) {
    const keyboard = new InlineKeyboard()
      .text('📦 Browse Plans', 'plans:page:1')
      .row()
      .text('🏠 Main Menu', 'menu:main')

    await ctx.reply(
      '🔑 *Your VPN Keys*\n\n' +
      'You don\'t have any active VPN accounts.\n' +
      'Browse our plans to get started!',
      { parse_mode: 'Markdown', reply_markup: keyboard }
    )
    return
  }

  let message = `🔑 *Your VPN Keys* (${vpnAccounts.length})\n\n`

  for (const account of vpnAccounts) {
    message += `
🌐 *${account.accountName}*
Server: ${account.serverId || 'Unknown'}
Status: ${account.status}
Subscription URL: ${account.marzbanSubscriptionUrl || 'N/A'}
`
  }

  const keyboard = new InlineKeyboard()
    .text('🔄 Refresh', 'profile:vpn_keys')
    .row()
    .text('⬅️ Back to Profile', 'profile:view')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
    disable_web_page_preview: true
  })
}

// ============================================================================
// Edit Profile (placeholder)
// ============================================================================

async function handleEditProfile(ctx: BotContext) {
  await ctx.reply('⚠️ Profile editing is not yet implemented.')
}
