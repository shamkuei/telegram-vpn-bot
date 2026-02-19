import { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { planQueries } from '@/db/queries.js'

// ============================================================================
// Types
// ============================================================================

type BotContext = Context

// ============================================================================
// Plans Handler
// ============================================================================

export async function plansHandler(ctx: BotContext) {
  const plans = await planQueries.getActivePublic()

  if (plans.length === 0) {
    await ctx.reply('No plans available at the moment. Please check back later.')
    return
  }

  const page = parseInt(ctx.match?.[2] || '1')
  const pageSize = 5
  const totalPages = Math.ceil(plans.length / pageSize)
  const startIndex = (page - 1) * pageSize
  const endIndex = startIndex + pageSize
  const pagePlans = plans.slice(startIndex, endIndex)

  let message = `📦 *Available Plans* - Page ${page}/${totalPages}\n\n`

  for (const plan of pagePlans) {
    const priceUsd = (plan.priceUsdCents / 100).toFixed(2)
    const durationDays = plan.durationDays
    const dataLimit = plan.dataLimitGb ? `${plan.dataLimitGb} GB` : 'Unlimited'
    const deviceLimit = plan.deviceLimit === 1 ? '1 device' : `${plan.deviceLimit} devices`

    message += `
🔹 *${plan.name}* - $${priceUsd}
   Duration: ${durationDays} days
   Data: ${dataLimit}
   Devices: ${deviceLimit}
   \`${plan.description || 'No description'}\`
`
  }

  const keyboard = new InlineKeyboard()

  // Plan buttons
  for (const plan of pagePlans) {
    keyboard.text(`🛒 Buy ${plan.name}`, `payment:create:${plan.id}`).row()
  }

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
    keyboard.text(`🛒 Buy ${plan.name}`, `payment:create:${plan.id}`).row()
  }

  message += '\nClick on a plan to purchase!'

  keyboard.text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}
