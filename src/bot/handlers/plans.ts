import { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { planQueries, userQueries } from '@/db/queries'
import { walletPurchaseService } from '@/services/wallet-purchase'
import { getWalletByUserId, createWallet } from '@/services/wallet'

// ============================================================================
// Types
// ============================================================================

type BotContext = Context

// ============================================================================
// Plans Handler
// ============================================================================

export async function plansHandler(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const action = ctx.match?.[2] || ''
  const param = ctx.match?.[3] || ''

  // Handle purchase actions
  if (action === 'buy' && param) {
    await handlePlanPurchase(ctx, parseInt(param))
    return
  }

  // Show plans list
  const plans = await planQueries.getActivePublic()

  if (plans.length === 0) {
    await ctx.reply('No plans available at the moment. Please check back later.')
    return
  }

  // Get user wallet for balance display
  const user = await userQueries.findByTelegramId(from.id)
  let walletBalance = 'N/A'
  let walletBalanceCents = 0

  if (user) {
    let wallet = await getWalletByUserId(user.id)
    if (!wallet) {
      wallet = await createWallet(user.id)
    }
    if (wallet) {
      const availableBalance = wallet.balanceCents - wallet.frozenBalanceCents
      walletBalance = `$${(availableBalance / 100).toFixed(2)}`
      walletBalanceCents = availableBalance
    }
  }

  const page = parseInt(ctx.match?.[2] || '1')
  const pageSize = 5
  const totalPages = Math.ceil(plans.length / pageSize)
  const startIndex = (page - 1) * pageSize
  const endIndex = startIndex + pageSize
  const pagePlans = plans.slice(startIndex, endIndex)

  let message = `💰 *Your Balance:* ${walletBalance}\n\n`
  message += `📦 *Available Plans* - Page ${page}/${totalPages}\n\n`

  for (const plan of pagePlans) {
    const priceUsd = (plan.priceUsdCents / 100).toFixed(2)
    const durationDays = plan.durationDays
    const dataLimit = plan.dataLimitGb ? `${plan.dataLimitGb} GB` : 'Unlimited'
    const deviceLimit = plan.deviceLimit === 1 ? '1 device' : `${plan.deviceLimit} devices`
    const canAfford = walletBalanceCents >= plan.priceUsdCents
    const statusIcon = canAfford ? '✅' : '❌'

    message += `
${statusIcon} *${plan.name}* - $${priceUsd}
   Duration: ${durationDays} days
   Data: ${dataLimit}
   Devices: ${deviceLimit}
   \`${plan.description || 'No description'}\`
`
  }

  const keyboard = new InlineKeyboard()

  // Plan buttons
  for (const plan of pagePlans) {
    const canAfford = walletBalanceCents >= plan.priceUsdCents
    const buttonLabel = canAfford ? `🛒 Buy ${plan.name}` : `💰 Buy ${plan.name} (Top-up required)`
    keyboard.text(buttonLabel, `plans:buy:${plan.id}`).row()
  }

  // Add wallet recharge button
  keyboard.text('💰 Top Up Wallet', 'wallet:recharge').row()

  // Pagination
  if (totalPages > 1) {
    if (page > 1) {
      keyboard.text('⬅️ Previous', `plans:page:${page - 1}`)
    }
    if (page < totalPages) {
      keyboard.text('➡️ Next', `plans:page:${page + 1}`)
    }
    keyboard.row()
  }

  keyboard.text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// Featured Plans Handler
// ============================================================================

export async function featuredPlansHandler(ctx: BotContext) {
  const plans = await planQueries.getFeatured()

  if (plans.length === 0) {
    await ctx.reply('No featured plans available.')
    return
  }

  let message = '⭐ *Featured Plans*\n\n'

  const keyboard = new InlineKeyboard()

  for (const plan of plans) {
    const priceUsd = (plan.priceUsdCents / 100).toFixed(2)
    message += `🔹 *${plan.name}* - $${priceUsd}\n`
    keyboard.text(`🛒 Buy ${plan.name}`, `plans:buy:${plan.id}`).row()
  }

  message += '\nClick on a plan to purchase!'

  keyboard.text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// Handle Plan Purchase with Wallet
// ============================================================================

async function handlePlanPurchase(ctx: BotContext, planId: number) {
  const from = ctx.from
  if (!from) return

  const { userQueries, planQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)
  const plan = await planQueries.findById(planId)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  if (!plan) {
    await ctx.reply('❌ Plan not found')
    return
  }

  if (!plan.isActive) {
    await ctx.reply('❌ This plan is currently not available')
    return
  }

  // Validate wallet balance
  const validation = await walletPurchaseService.validateWalletBalance(user.id, plan.id)

  if (!validation.valid) {
    const keyboard = new InlineKeyboard()
      .text('💰 Top Up Wallet', 'wallet:recharge')
      .row()
      .text('📦 Browse Plans', 'plans:page:1')
      .row()
      .text('🏠 Main Menu', 'menu:main')

    await ctx.reply(
      `❌ *Insufficient Wallet Balance*\n\n` +
      `Plan: ${plan.name}\n` +
      `Required: $${(validation.requiredAmount / 100).toFixed(2)}\n` +
      `Your Balance: $${(validation.currentBalance / 100).toFixed(2)}\n\n` +
      `Please top up your wallet to purchase this plan.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    )
    return
  }

  // Confirm purchase
  ctx.session.selectedPlan = plan.id

  const keyboard = new InlineKeyboard()
    .text('✅ Confirm Purchase', `plans:confirm:${plan.id}`)
    .row()
    .text('❌ Cancel', 'menu:main')

  await ctx.reply(
    `🛒 *Confirm Purchase*\n\n` +
    `Plan: ${plan.name}\n` +
    `Duration: ${plan.durationDays} days\n` +
    `Data: ${plan.dataLimitGb ? `${plan.dataLimitGb} GB` : 'Unlimited'}\n` +
    `Devices: ${plan.deviceLimit}\n` +
    `Price: $${(plan.priceUsdCents / 100).toFixed(2)}\n\n` +
    `The amount will be deducted from your wallet balance.\n` +
    `Current Balance: $${(validation.currentBalance / 100).toFixed(2)}\n` +
    `Remaining Balance: $${((validation.currentBalance - validation.requiredAmount) / 100).toFixed(2)}`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )
}

// ============================================================================
// Handle Purchase Confirmation
// ============================================================================

export async function handleConfirmPurchase(ctx: BotContext, planId: number) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  // Send processing message
  const processingMsg = await ctx.reply('⏳ Processing your purchase...')

  try {
    // Attempt purchase
    const result = await walletPurchaseService.purchaseWithWallet({
      userId: user.id,
      planId: planId
    })

    // Delete processing message
    await ctx.api.deleteMessage(processingMsg.chat.id, processingMsg.message_id).catch(() => {})

    if (result.success) {
      const keyboard = new InlineKeyboard()
        .text('👤 My Subscriptions', 'mysub:list')
        .row()
        .text('🏠 Main Menu', 'menu:main')

      await ctx.reply(
        `✅ *Purchase Successful!*\n\n` +
        `🎉 Your subscription is now active!\n\n` +
        `Use "My Subscriptions" to view your subscription details and get your VPN connection key.`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      )
    } else {
      const keyboard = new InlineKeyboard()
        .text('💰 Top Up Wallet', 'wallet:recharge')
        .row()
        .text('📦 Browse Plans', 'plans:page:1')
        .row()
        .text('🏠 Main Menu', 'menu:main')

      await ctx.reply(
        `❌ *Purchase Failed*\n\n` +
        `${result.message}`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      )
    }
  } catch (error) {
    console.error('Purchase error:', error)

    // Delete processing message
    await ctx.api.deleteMessage(processingMsg.chat.id, processingMsg.message_id).catch(() => {})

    await ctx.reply(
      '❌ An error occurred while processing your purchase. Please try again later.'
    )
  }

  // Clear session
  ctx.session.selectedPlan = undefined
}
