import { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { giftService } from '@/services/gift.js'

// ============================================================================
// Types
// ============================================================================

type BotContext = Context

// ============================================================================
// Gift Handler
// ============================================================================

export async function giftHandler(ctx: BotContext) {
  const action = ctx.match?.[2] || ''
  const param = ctx.match?.[3] || ''

  switch (action) {
    case 'claim':
      await handleClaimGift(ctx, param)
      break
    case 'view':
      await handleViewGifts(ctx)
      break
    default:
      await handleClaimGiftPrompt(ctx)
  }
}

// ============================================================================
// Claim Gift Prompt
// ============================================================================

async function handleClaimGiftPrompt(ctx: BotContext) {
  const keyboard = new InlineKeyboard()
    .text('🎁 Claim a Code', 'gift:claim_prompt')
    .row()
    .text('👁️ View My Gifts', 'gift:view')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    '🎁 *Gift Codes*\n\n' +
    'Have a gift code? Claim it to get free VPN access!\n\n' +
    '*Options:*\n' +
    '🎁 Claim a gift code\n' +
    '👁️ View your claimed gifts',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )
}

// ============================================================================
// Claim Gift Code
// ============================================================================

async function handleClaimGift(ctx: BotContext, code: string) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  if (!code) {
    await ctx.reply('Please enter the gift code:')
    return
  }

  // Claim gift code
  const result = await giftService.claimGiftCode(user, { code })

  if (!result.success) {
    const keyboard = new InlineKeyboard()
      .text('🔄 Try Again', 'gift:claim_prompt')
      .row()
      .text('🏠 Main Menu', 'menu:main')

    await ctx.reply(
      `❌ ${result.message}\n\n` +
      'Please check your code and try again.',
      { reply_markup: keyboard }
    )
    return
  }

  const keyboard = new InlineKeyboard()
    .text('📱 Get Subscription', `mysub:view:${result.subscription?.id}`)
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    `🎉 *Gift Claimed Successfully!*\n\n` +
    `You've received a gift subscription!\n\n` +
    `Plan: ${result.subscription?.plan?.name || 'N/A'}\n` +
    `Duration: ${result.subscription?.plan?.durationDays || 'N/A'} days\n\n` +
    'Tap the button below to view your subscription.',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )
}

// ============================================================================
// View Gifts
// ============================================================================

async function handleViewGifts(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  // Get user's gift redemptions
  const { db } = await import('@/db/index.js')
  const { giftRedemptions, giftCodes } = await import('@/db/schema/index.js')
  const { eq, desc } = await import('drizzle-orm')

  const redemptions = await db
    .select({
      redemption: giftRedemptions,
      code: giftCodes
    })
    .from(giftRedemptions)
    .innerJoin(giftCodes, eq(giftRedemptions.giftCodeId, giftCodes.id))
    .where(eq(giftRedemptions.userId, user.id))
    .orderBy(desc(giftRedemptions.createdAt))

  if (redemptions.length === 0) {
    const keyboard = new InlineKeyboard()
      .text('🎁 Claim a Code', 'gift:claim_prompt')
      .row()
      .text('🏠 Main Menu', 'menu:main')

    await ctx.reply(
      '🎁 *My Gift Codes*\n\n' +
      'You haven\'t claimed any gift codes yet.\n' +
      'Have a code? Claim it to get free VPN access!',
      { parse_mode: 'Markdown', reply_markup: keyboard }
    )
    return
  }

  let message = '🎁 *My Gift Codes*\n\n'

  for (const { redemption, code } of redemptions) {
    const plan = code.planId // Plan info would need to be fetched
    message += `🎁 Code: ${code.code}\n`
    message += `   Claimed: ${new Date(redemption.createdAt).toLocaleString()}\n\n`
  }

  const keyboard = new InlineKeyboard()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}
