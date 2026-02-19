import { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { paymentService } from '@/services/payment.js'

// ============================================================================
// Types
// ============================================================================

type BotContext = Context

// ============================================================================
// Payment Handler
// ============================================================================

export async function paymentHandler(ctx: BotContext) {
  const action = ctx.match?.[2] || ''
  const param = ctx.match?.[3] || ''

  switch (action) {
    case 'create':
      await handleCreatePayment(ctx, parseInt(param))
      break
    case 'confirm':
      await handleConfirmPayment(ctx, param)
      break
    case 'cancel':
      await handleCancelPayment(ctx, param)
      break
    case 'status':
      await handlePaymentStatus(ctx, parseInt(param))
      break
    default:
      await ctx.reply('❌ Invalid payment action')
  }
}

// ============================================================================
// Create Payment
// ============================================================================

async function handleCreatePayment(ctx: BotContext, planId: number) {
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

  // Create payment
  const result = await paymentService.createTelegramPayment(user, {
    planId,
    provider: 'cryptopay' // Default provider
  })

  if (!result.success) {
    await ctx.reply(`❌ ${result.message}`)
    return
  }

  // Show payment details
  const priceUsd = (result.payment?.amountCents || 0) / 100
  const keyboard = new InlineKeyboard()
    .text('💳 Pay with Crypto', result.paymentUrl || `payment:provider:crypto`)
    .row()
    .text('🔄 Check Status', `payment:status:${result.payment?.id}`)
    .row()
    .text('❌ Cancel', `payment:cancel:${result.payment?.id}`)
    .row()
    .text('🏠 Main Menu', 'menu:main')

  const message = `
💳 *Payment Pending*

*Plan:* ${plan.name}
*Amount:* $${priceUsd.toFixed(2)}
*Payment Method:* Crypto

⏳ Please complete the payment using the link below.

⏰ *Note:* Payment link expires in 30 minutes
  `

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })

  // Store pending payment in session
  if (result.payment) {
    ctx.session.pendingPayment = {
      amount: result.payment.amountCents,
      provider: result.payment.provider,
      invoiceId: result.payment.providerInvoiceId || ''
    }
  }
}

// ============================================================================
// Confirm Payment
// ============================================================================

async function handleConfirmPayment(ctx: BotContext, invoiceId: string) {
  const { paymentQueries } = await import('@/db/queries.js')
  const { paymentService } = await import('@/services/payment.js')

  const { getPaymentsByInvoiceId } = await import('@/utils/payment.js')
  const payment = await getPaymentsByInvoiceId(invoiceId, 'cryptopay')

  if (!payment) {
    await ctx.reply('❌ Payment not found')
    return
  }

  if (payment.status === 'completed') {
    await ctx.reply('✅ Payment already confirmed')
    return
  }

  await ctx.reply('⏳ Checking payment status...')

  const result = await paymentService.confirmPayment('cryptopay', invoiceId, 'completed')

  if (result.success) {
    await ctx.reply('✅ Payment confirmed! Your subscription will be activated shortly.')
  } else {
    await ctx.reply(`❌ ${result.message}`)
  }
}

// ============================================================================
// Cancel Payment
// ============================================================================

async function handleCancelPayment(ctx: BotContext, invoiceId: string) {
  ctx.session.pendingPayment = undefined

  const keyboard = new InlineKeyboard()
    .text('📦 Browse Plans', 'plans:page:1')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    '❌ Payment cancelled\n\n' +
    'You can browse our plans and try again whenever you\'re ready.',
    { reply_markup: keyboard }
  )
}

// ============================================================================
// Payment Status
// ============================================================================

async function handlePaymentStatus(ctx: BotContext, paymentId: number) {
  const { paymentQueries } = await import('@/db/queries.js')
  const payment = await paymentQueries.findById(paymentId)

  if (!payment) {
    await ctx.reply('❌ Payment not found')
    return
  }

  let statusEmoji = '⏳'
  let statusText = ''

  switch (payment.status) {
    case 'pending':
      statusEmoji = '⏳'
      statusText = 'Waiting for payment...'
      break
    case 'processing':
      statusEmoji = '🔄'
      statusText = 'Payment is being processed...'
      break
    case 'completed':
      statusEmoji = '✅'
      statusText = 'Payment completed!'
      break
    case 'failed':
      statusEmoji = '❌'
      statusText = 'Payment failed'
      break
    case 'expired':
      statusEmoji = '⏰'
      statusText = 'Payment expired'
      break
    case 'refunded':
      statusEmoji = '💰'
      statusText = 'Payment refunded'
      break
    default:
      statusEmoji = '❓'
      statusText = payment.status
  }

  const message = `
${statusEmoji} *Payment Status*

Status: ${statusText}
Amount: $${((payment.amountCents || 0) / 100).toFixed(2)}
Created: ${new Date(payment.createdAt).toLocaleString()}
${payment.completedAt ? `Confirmed: ${new Date(payment.completedAt).toLocaleString()}` : ''}
  `

  const keyboard = new InlineKeyboard()

  if (payment.status === 'pending') {
    keyboard.text('💳 Pay Now', payment.cryptoAddress || payment.providerInvoiceId || '')
      .row()
  }

  keyboard
    .text('🔄 Refresh', `payment:status:${paymentId}`)
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}
