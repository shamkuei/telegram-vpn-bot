import { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { referralService } from '@/services/referral.js'

// ============================================================================
// Types
// ============================================================================

type BotContext = Context

// ============================================================================
// Referral Handler
// ============================================================================

export async function referralHandler(ctx: BotContext) {
  const action = ctx.match?.[2] || ''

  switch (action) {
    case 'view':
      await handleViewReferral(ctx)
      break
    case 'link':
      await handleGetReferralLink(ctx)
      break
    case 'stats':
      await handleReferralStats(ctx)
      break
    default:
      await handleReferralMenu(ctx)
  }
}

// ============================================================================
// Referral Menu
// ============================================================================

async function handleReferralMenu(ctx: BotContext) {
  const keyboard = new InlineKeyboard()
    .text('🔗 My Referral Link', 'referral:link')
    .row()
    .text('📊 Statistics', 'referral:stats')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    '👥 *Referral Program*\n\n' +
    'Invite friends and earn rewards!\n\n' +
    '*How it works:*\n' +
    '1. Share your unique referral link\n' +
    '2. Friends sign up using your link\n' +
    '3. When they make a purchase, you earn rewards\n' +
    '4. Withdraw or use your rewards to get free VPN service',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )
}

// ============================================================================
// View Referral
// ============================================================================

async function handleViewReferral(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  await handleGetReferralLink(ctx)
}

// ============================================================================
// Get Referral Link
// ============================================================================

async function handleGetReferralLink(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  const referralLink = `https://t.me/${ctx.me.username}?start=${user.referralCode}`

  const keyboard = new InlineKeyboard()
    .text('📋 Copy Link', `referral:copy`)
    .row()
    .text('📊 Statistics', 'referral:stats')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  const message = `
🔗 *Your Referral Link*

${referralLink}

*Instructions:*
1. Copy the link above
2. Share it with your friends
3. When they sign up and make a purchase, you earn rewards!

*Rewards:*
• Earn 10% of every purchase made by your referrals
• Use rewards to get free VPN service or withdraw

*Terms:*
• Referral must complete a purchase
• Self-referrals are not allowed
• Suspicious activity will be investigated
  `

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
    disable_web_page_preview: true
  })
}

// ============================================================================
// Referral Stats
// ============================================================================

async function handleReferralStats(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const { userQueries, referralQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  const referrals = await referralQueries.getByReferrerId(user.telegramId)

  const completedReferrals = referrals.filter(r => r.status === 'completed')
  const pendingReferrals = referrals.filter(r => r.status === 'pending')
  const totalEarnedCents = completedReferrals.reduce((sum, r) => sum + r.rewardCents, 0)

  const keyboard = new InlineKeyboard()
    .text('🔗 My Referral Link', 'referral:link')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  const message = `
📊 *Referral Statistics*

*Total Referrals:* ${referrals.length}
✅ *Completed:* ${completedReferrals.length}
⏳ *Pending:* ${pendingReferrals.length}

💰 *Total Earned:* $${(totalEarnedCents / 100).toFixed(2)}

*Completed Referrals:*
${completedReferrals.map(r =>
  `• ${new Date(r.createdAt).toLocaleDateString()}: +$${(r.rewardCents / 100).toFixed(2)}`
).join('\n') || 'None yet'}
  `

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}
