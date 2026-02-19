import { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { config } from '@/config/index.js'
import { upsertUser } from '@/services/user.js'

// ============================================================================
// Types
// ============================================================================

type BotContext = Context

// ============================================================================
// Keyboards
// ============================================================================

function getMainKeyboard(telegramId: number): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text('📦 Browse Plans', `plans:page:1`)
    .row()
    .text('👤 My Subscriptions', `mysub:list`)
    .row()
    .text('💳 My Wallet', `wallet:view`)
    .row()
    .text('🎁 Gift Code', `gift:claim`)
    .row()
    .text('🧪 Test Account', `test:create`)
    .row()
    .text('👥 Referral Program', `referral:view`)
    .row()
    .text('⚙️ Profile', `profile:view`)

  return keyboard
}

// ============================================================================
// Start Handler
// ============================================================================

export async function startHandler(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  // Create or update user
  const user = await upsertUser({
    telegramId: from.id,
    telegramUsername: from.username,
    telegramFirstName: from.first_name,
    telegramLastName: from.last_name,
    telegramLanguageCode: from.language_code,
    referralCode: ctx.match // Extract from /start REFERRAL_CODE
  })

  // Get referral link
  const referralLink = `https://t.me/${ctx.me.username}?start=${user.referralCode}`

  const message = `
🌟 *Welcome to VPN Bot, ${user.telegramFirstName}!*

Fast, secure, and reliable VPN service at your fingertips.

🔹 *Features:*
• High-speed servers in multiple countries
• Multiple VPN protocols (Xray, V2Ray, Shadowsocks)
• Affordable pricing plans
• Instant activation after payment
• 24/7 support

🚀 *Get Started:*
Choose a plan and get connected in minutes!

*Your referral link:* ${referralLink}

Share it with friends and earn rewards! 🎁
`

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: getMainKeyboard(user.telegramId)
  })

  // Send admin notification if new user
  if (user.createdAt.getTime() === Date.now()) {
    await notifyAdminAboutNewUser(ctx, user)
  }
}

// ============================================================================
// Help Handler
// ============================================================================

export async function helpHandler(ctx: BotContext) {
  const message = `
📚 *Help & Commands*

*Available Commands:*
/start - Start the bot or get referral link
/help - Show this help message
/plans - Browse available VPN plans
/mysub - View your active subscriptions
/profile - View your profile and settings

*Main Features:*
📦 Browse Plans - View all available subscription plans
👤 My Subscriptions - Manage your active subscriptions
💳 Wallet - Check your balance and add funds
🎁 Gift Codes - Claim a gift code or view your gifts
🧪 Test Accounts - Try before you buy
👥 Referrals - Earn rewards by inviting friends

*Payment Methods:*
• Crypto (via CryptoPay)
• Credit Card (via Stripe)
• NOWPayments
• Wallet Balance

*Need Help?*
If you have any questions or issues, please contact our support team.

Thank you for using our service! 🙏
`

  await ctx.reply(message, { parse_mode: 'Markdown' })
}

// ============================================================================
// Admin Notifications
// ============================================================================

async function notifyAdminAboutNewUser(ctx: BotContext, user: any) {
  const adminIds = config.TELEGRAM_ADMIN_IDS

  if (!adminIds || adminIds.length === 0) return

  for (const adminId of adminIds) {
    try {
      await ctx.api.sendMessage(adminId, `
🆕 *New User Registered*

*Name:* ${user.telegramFirstName} ${user.telegramLastName || ''}
*Username:* @${user.telegramUsername || 'N/A'}
*Telegram ID:* \`${user.telegramId}\`
*Joined:* ${user.joinedAt.toLocaleString()}
*Referred By:* ${user.referredBy || 'None'}
      `, { parse_mode: 'Markdown' })
    } catch (error) {
      console.error(`Failed to notify admin ${adminId}:`, error)
    }
  }
}
