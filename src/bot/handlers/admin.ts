import { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { config } from '@/config/index'
import { manualPaymentService } from '@/services/manual-payment'
import { walletRechargeService } from '@/services/wallet-recharge'
import type { BotContext } from '../index'

// ============================================================================
// Types
// ============================================================================

type BotContext = Context

// ============================================================================
// Admin Handler - Manual Payment & Wallet Recharge Verification
// ============================================================================

export async function adminHandler(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  // Check if user is admin
  if (!config.TELEGRAM_ADMIN_IDS.includes(from.id)) {
    await ctx.reply('❌ You are not authorized to use admin commands.')
    return
  }

  const command = ctx.match?.[0] || ''
  const params = ctx.match?.[1] || ''

  // Handle /verify_payment <payment_id> command
  if (command === '/verify_payment') {
    await handleVerifyPaymentCommand(ctx, params)
    return
  }

  // Handle /recharge <recharge_id> command
  if (command === '/recharge') {
    await handleVerifyRechargeCommand(ctx, params)
    return
  }

  // Handle /payments command
  if (command === '/payments' || command === '/admin') {
    await handleAdminPaymentsPanel(ctx)
    return
  }

  // Handle callback queries
  const action = ctx.match?.[2] || ''
  const subAction = ctx.match?.[3] || ''
  const paymentId = parseInt(subAction || params) || undefined

  switch (action) {
    case 'payments':
      if (subAction === 'pending') {
        await handlePendingPayments(ctx)
      } else if (subAction === 'list') {
        await handleAdminPaymentsList(ctx)
      } else if (!isNaN(parseInt(subAction || ''))) {
        await handleViewPaymentDetails(ctx, parseInt(subAction || ''))
      }
      break

    case 'payment':
      if (subAction === 'approve') {
        await handleApprovePayment(ctx, paymentId!)
      } else if (subAction === 'reject') {
        await handleRejectPayment(ctx, paymentId!)
      }
      break

    case 'recharges':
      if (subAction === 'pending') {
        await handlePendingRecharges(ctx)
      } else if (subAction === 'list') {
        await handleAdminRechargesList(ctx)
      } else if (!isNaN(parseInt(subAction || ''))) {
        await handleViewRechargeDetails(ctx, parseInt(subAction || ''))
      }
      break

    case 'recharge':
      if (subAction === 'approve') {
        await handleApproveRecharge(ctx, paymentId!)
      } else if (subAction === 'reject') {
        await handleRejectRecharge(ctx, paymentId!)
      }
      break

    default:
      await handleAdminPaymentsPanel(ctx)
  }
}

// ============================================================================
// Verify Payment Command
// ============================================================================

async function handleVerifyPaymentCommand(ctx: BotContext, paymentIdStr: string) {
  const from = ctx.from
  if (!from) return

  const paymentId = parseInt(paymentIdStr)

  if (isNaN(paymentId)) {
    await ctx.reply('❌ Invalid payment ID. Usage: /verify_payment <payment_id>')
    return
  }

  const { manualPaymentQueries } = await import('@/db/queries.js')
  const paymentData = await manualPaymentQueries.getPending(1, 0)

  // Find the specific payment
  const payment = paymentData.find(p => p.payment.id === paymentId)

  if (!payment) {
    await ctx.reply(`❌ Payment #${paymentId} not found or not in pending state.`)
    return
  }

  await displayPaymentDetailsForVerification(ctx, payment)
}

// ============================================================================
// Display Payment Details for Admin Verification
// ============================================================================

async function displayPaymentDetailsForVerification(
  ctx: BotContext,
  paymentData: { payment: any; user: any; plan: any }
): Promise<void> {
  const { payment, user, plan } = paymentData

  const keyboard = new InlineKeyboard()
    .text('✅ Approve', `admin:payment:approve:${payment.id}`)
    .text('❌ Reject', `admin:payment:reject:${payment.id}`)
    .row()
    .text('📋 View All Pending', 'admin:payments:pending')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  // Get screenshot if available
  if (payment.screenshotFileId) {
    try {
      const message = `
🔍 *Payment Verification*

━━━━━━━━━━━━━━━━━
*Payment ID:* ${payment.id}
*Status:* ${payment.status}
*Created:* ${new Date(payment.createdAt).toLocaleString()}
*Expires:* ${payment.expiresAt ? new Date(payment.expiresAt).toLocaleString() : 'N/A'}
━━━━━━━━━━━━━━━━━

👤 *User Information:*
*Name:* ${user.telegramFirstName} ${user.telegramLastName || ''}
*Username:* @${user.telegramUsername || 'N/A'}
*Telegram ID:* \`${user.telegramId}\`
*User ID:* ${user.id}

📦 *Plan Information:*
*Plan:* ${plan.name}
*Duration:* ${plan.durationDays} days
*Amount:* $${(payment.amountCents / 100).toFixed(2)}

📝 *Payment Details:*
*Reference:* ${payment.paymentReference || 'Not provided'}
*Note:* ${payment.userNote || 'None'}

━━━━━━━━━━━━━━━━━
Please verify the screenshot and choose an action below.
      `

      // Send photo with caption
      await ctx.replyWithPhoto(payment.screenshotFileId, {
        caption: message,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      })
      return
    } catch (error) {
      console.error('Failed to send photo:', error)
    }
  }

  // Fallback: send text-only message
  const message = `
🔍 *Payment Verification*

━━━━━━━━━━━━━━━━━
*Payment ID:* ${payment.id}
*Status:* ${payment.status}
*Created:* ${new Date(payment.createdAt).toLocaleString()}
*Expires:* ${payment.expiresAt ? new Date(payment.expiresAt).toLocaleString() : 'N/A'}
━━━━━━━━━━━━━━━━━

👤 *User Information:*
*Name:* ${user.telegramFirstName} ${user.telegramLastName || ''}
*Username:* @${user.telegramUsername || 'N/A'}
*Telegram ID:* \`${user.telegramId}\`
*User ID:* ${user.id}

📦 *Plan Information:*
*Plan:* ${plan.name}
*Duration:* ${plan.durationDays} days
*Amount:* $${(payment.amountCents / 100).toFixed(2)}

📝 *Payment Details:*
*Reference:* ${payment.paymentReference || 'Not provided'}
*Note:* ${payment.userNote || 'None'}

📸 *Screenshot:* ${payment.screenshotFileId ? 'Available' : '⚠️ Not uploaded'}

━━━━━━━━━━━━━━━━━
Please verify the payment and choose an action below.
  `

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// Admin Payments Panel
// ============================================================================

async function handleAdminPaymentsPanel(ctx: BotContext): Promise<void> {
  const { manualPaymentQueries } = await import('@/db/queries.js')
  const pendingCount = await manualPaymentQueries.getPendingCount()

  const keyboard = new InlineKeyboard()
    .text('📋 Pending Payments', 'admin:payments:pending')
    .row()
    .text('📊 All Payments', 'admin:payments:list')
    .row()
    .text('🔢 Payment Status', `admin:payments:status`)
    .row()
    .text('🏠 Main Menu', 'menu:main')

  const message = `
🔧 *Admin Panel - Manual Payments*

━━━━━━━━━━━━━━━━━
*Pending Verifications:* ${pendingCount}
━━━━━━━━━━━━━━━━━

Use the buttons below or:
/verify_payment <id> - Verify a specific payment
/payments - View all payments

Choose an action:
  `

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// View Pending Payments
// ============================================================================

async function handlePendingPayments(ctx: BotContext): Promise<void> {
  const { manualPaymentQueries } = await import('@/db/queries.js')
  const pendingPayments = await manualPaymentQueries.getPending(10, 0)

  if (pendingPayments.length === 0) {
    const keyboard = new InlineKeyboard()
      .text('🏠 Main Menu', 'menu:main')

    await ctx.reply(
      '✅ *No Pending Payments*\n\n' +
      'All payments have been processed!',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    )
    return
  }

  const message = `
📋 *Pending Payments* (${pendingPayments.length} total)

━━━━━━━━━━━━━━━━━
${pendingPayments.map((p, i) => {
  const date = new Date(p.payment.createdAt).toLocaleDateString()
  return `${i + 1}. ID: \`${p.payment.id}\`
     User: ${p.user.telegramFirstName}
     Plan: ${p.plan.name}
     Amount: $${(p.payment.amountCents / 100).toFixed(2)}
     Date: ${date}
     📸: ${p.payment.screenshotFileId ? '✅' : '❌'}`
}).join('\n\n')}
━━━━━━━━━━━━━━━━━

Use /verify_payment <id> to review a payment.
  `

  const keyboard = new InlineKeyboard()

  // Add buttons for first 5 payments
  pendingPayments.slice(0, 5).forEach((p) => {
    keyboard.text(`#${p.payment.id}`, `admin:payments:view:${p.payment.id}`)
  })

  keyboard
    .row()
    .text('🔄 Refresh', 'admin:payments:pending')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// View Payment Details
// ============================================================================

async function handleViewPaymentDetails(ctx: BotContext, paymentId: number): Promise<void> {
  const { manualPaymentQueries } = await import('@/db/queries.js')
  const paymentData = await manualPaymentQueries.getPending(1, 0)

  const payment = paymentData.find(p => p.payment.id === paymentId)

  if (!payment) {
    await ctx.reply(`❌ Payment #${paymentId} not found or not in pending state.`)
    return
  }

  await displayPaymentDetailsForVerification(ctx, payment)
}

// ============================================================================
// List All Payments (Admin)
// ============================================================================

async function handleAdminPaymentsList(ctx: BotContext): Promise<void> {
  const { manualPaymentQueries } = await import('@/db/queries.js')
  const fromId = ctx.from?.id

  if (!fromId) return

  // Get user's payments (for testing/debugging) or all if admin
  const allPayments = await manualPaymentQueries.getPending(20, 0)

  if (allPayments.length === 0) {
    await ctx.reply('📋 No payments found.')
    return
  }

  const message = `
📊 *Payment List*

━━━━━━━━━━━━━━━━━
${allPayments.map((p, i) => {
  const date = new Date(p.payment.createdAt).toLocaleDateString()
  const statusEmoji = {
    'awaiting_screenshot': '📸',
    'pending': '⏳',
    'approved': '✅',
    'rejected': '❌',
    'expired': '⏰'
  }[p.payment.status] || '❓'

  return `${i + 1}. ${statusEmoji} \`${p.payment.id}\`
     User: ${p.user.telegramFirstName}
     Plan: ${p.plan.name}
     Amount: $${(p.payment.amountCents / 100).toFixed(2)}
     Status: ${p.payment.status}
     Date: ${date}`
}).join('\n\n')}
━━━━━━━━━━━━━━━━━
  `

  const keyboard = new InlineKeyboard()
    .text('🔄 Refresh', 'admin:payments:list')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// Approve Payment
// ============================================================================

async function handleApprovePayment(ctx: BotContext, paymentId: number): Promise<void> {
  const from = ctx.from
  if (!from) return

  // Send typing action
  await ctx.api.sendChatAction(ctx.chat!.id, 'typing')

  const { manualPaymentQueries } = await import('@/db/queries.js')
  const payment = await manualPaymentQueries.findById(paymentId)

  if (!payment) {
    await ctx.reply(`❌ Payment #${paymentId} not found.`)
    return
  }

  if (payment.status !== 'pending') {
    await ctx.reply(`❌ Payment is not in pending state. Current status: ${payment.status}`)
    return
  }

  // Verify payment (approve)
  const result = await manualPaymentService.verifyPayment({
    paymentId,
    adminId: from.id,
    approved: true,
    adminNote: `Approved by ${from.firstName || 'Admin'}`
  })

  if (!result.success) {
    await ctx.reply(`❌ ${result.message}`)
    return
  }

  // Notify user
  if (result.payment && result.payment.userId) {
    const { planQueries } = await import('@/db/queries.js')
    const plan = await planQueries.findById(result.payment.planId)

    const { notifyPaymentApproval } = await import('./payment.js')
    await notifyPaymentApproval(ctx, result.payment.userId, paymentId, plan?.name || 'Plan')
  }

  const keyboard = new InlineKeyboard()
    .text('📋 Next Pending', 'admin:payments:pending')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    '✅ *Payment Approved!*\n\n' +
    `Payment #${paymentId} has been approved and subscription has been created for the user.`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )
}

// ============================================================================
// Reject Payment
// ============================================================================

async function handleRejectPayment(ctx: BotContext, paymentId: number): Promise<void> {
  const from = ctx.from
  if (!from) return

  // Set session state for rejection reason
  ;(ctx.session as any).rejectingPaymentId = paymentId
  ;(ctx.session as any).awaitingRejectionReason = true

  const keyboard = new InlineKeyboard()
    .text('❌ Cancel Rejection', 'admin:payments:pending')

  await ctx.reply(
    '❌ *Reject Payment*\n\n' +
    `Please provide a reason for rejecting payment #${paymentId}.\n\n` +
    'Type your reason below (or click Cancel to abort):',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )
}

// ============================================================================
// Handle Rejection Reason Input (Text Handler)
// ============================================================================

export async function handlePaymentRejectionReason(ctx: BotContext, reason: string): Promise<boolean> {
  const from = ctx.from
  if (!from) return false

  const rejectingPaymentId = (ctx.session as any).rejectingPaymentId
  const awaitingReason = (ctx.session as any).awaitingRejectionReason

  if (!awaitingReason || !rejectingPaymentId) {
    return false // Not for us
  }

  // Clear session state
  ;(ctx.session as any).rejectingPaymentId = undefined
  ;(ctx.session as any).awaitingRejectionReason = undefined

  const { manualPaymentQueries } = await import('@/db/queries.js')
  const payment = await manualPaymentQueries.findById(rejectingPaymentId)

  if (!payment) {
    await ctx.reply(`❌ Payment #${rejectingPaymentId} not found.`)
    return true
  }

  if (payment.status !== 'pending') {
    await ctx.reply(`❌ Payment is not in pending state. Current status: ${payment.status}`)
    return true
  }

  // Verify payment (reject)
  const result = await manualPaymentService.verifyPayment({
    paymentId: rejectingPaymentId,
    adminId: from.id,
    approved: false,
    rejectionReason: reason
  })

  if (!result.success) {
    await ctx.reply(`❌ ${result.message}`)
    return true
  }

  // Notify user
  if (result.payment && result.payment.userId) {
    const { notifyPaymentRejection } = await import('./payment.js')
    await notifyPaymentRejection(ctx, result.payment.userId, rejectingPaymentId, reason)
  }

  const keyboard = new InlineKeyboard()
    .text('📋 Next Pending', 'admin:payments:pending')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    '❌ *Payment Rejected*\n\n' +
    `Payment #${rejectingPaymentId} has been rejected.\n` +
    `Reason: ${reason}\n\n` +
    'The user has been notified.',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )

  return true
}

// ============================================================================
// Middleware to check if user is admin
// ============================================================================

export async function isAdmin(ctx: BotContext): Promise<boolean> {
  const from = ctx.from
  if (!from) return false

  return config.TELEGRAM_ADMIN_IDS.includes(from.id)
}

// ============================================================================
// Verify Recharge Command
// ============================================================================

async function handleVerifyRechargeCommand(ctx: BotContext, rechargeIdStr: string) {
  const from = ctx.from
  if (!from) return

  const rechargeId = parseInt(rechargeIdStr)

  if (isNaN(rechargeId)) {
    await ctx.reply('❌ Invalid recharge ID. Usage: /recharge <recharge_id>')
    return
  }

  const recharge = await walletRechargeService.getRechargeRequestById(rechargeId)

  if (!recharge) {
    await ctx.reply(`❌ Recharge #${rechargeId} not found.`)
    return
  }

  await displayRechargeDetailsForVerification(ctx, recharge)
}

// ============================================================================
// Display Recharge Details for Admin Verification
// ============================================================================

async function displayRechargeDetailsForVerification(
  ctx: BotContext,
  recharge: any
): Promise<void> {
  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findById(recharge.userId)

  if (!user) {
    await ctx.reply(`❌ User not found for recharge #${recharge.id}.`)
    return
  }

  const keyboard = new InlineKeyboard()
    .text('✅ Approve', `admin:recharge:approve:${recharge.id}`)
    .text('❌ Reject', `admin:recharge:reject:${recharge.id}`)
    .row()
    .text('📋 View All Pending', 'admin:recharges:pending')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  // Get screenshot if available
  if (recharge.screenshotFileId) {
    try {
      const message = `
🔍 *Wallet Recharge Verification*

━━━━━━━━━━━━━━━━━
*Request ID:* WR-${recharge.id}
*Status:* ${recharge.status}
*Created:* ${new Date(recharge.createdAt).toLocaleString()}
*Expires:* ${recharge.expiresAt ? new Date(recharge.expiresAt).toLocaleString() : 'N/A'}
━━━━━━━━━━━━━━━━━

👤 *User Information:*
*Name:* ${user.telegramFirstName} ${user.telegramLastName || ''}
*Username:* @${user.telegramUsername || 'N/A'}
*Telegram ID:* \`${user.telegramId}\`
*User ID:* ${user.id}

💰 *Recharge Details:*
*Amount:* $${(recharge.amountCents / 100).toFixed(2)}
*Currency:* ${recharge.currency}

📝 *Payment Details:*
*Reference:* ${recharge.paymentReference || 'Not provided'}
*Note:* ${recharge.userNote || 'None'}

━━━━━━━━━━━━━━━━━
Please verify the screenshot and choose an action below.
      `

      // Send photo with caption
      await ctx.replyWithPhoto(recharge.screenshotFileId, {
        caption: message,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      })
      return
    } catch (error) {
      console.error('Failed to send photo:', error)
    }
  }

  // Fallback: send text-only message
  const message = `
🔍 *Wallet Recharge Verification*

━━━━━━━━━━━━━━━━━
*Request ID:* WR-${recharge.id}
*Status:* ${recharge.status}
*Created:* ${new Date(recharge.createdAt).toLocaleString()}
*Expires:* ${recharge.expiresAt ? new Date(recharge.expiresAt).toLocaleString() : 'N/A'}
━━━━━━━━━━━━━━━━━

👤 *User Information:*
*Name:* ${user.telegramFirstName} ${user.telegramLastName || ''}
*Username:* @${user.telegramUsername || 'N/A'}
*Telegram ID:* \`${user.telegramId}\`
*User ID:* ${user.id}

💰 *Recharge Details:*
*Amount:* $${(recharge.amountCents / 100).toFixed(2)}
*Currency:* ${recharge.currency}

📝 *Payment Details:*
*Reference:* ${recharge.paymentReference || 'Not provided'}
*Note:* ${recharge.userNote || 'None'}

📸 *Screenshot:* ${recharge.screenshotFileId ? 'Available' : '⚠️ Not uploaded'}

━━━━━━━━━━━━━━━━━
Please verify the payment and choose an action below.
  `

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// View Pending Recharges
// ============================================================================

async function handlePendingRecharges(ctx: BotContext): Promise<void> {
  const pendingRecharges = await walletRechargeService.getPendingRechargeRequests(10, 0)

  if (pendingRecharges.length === 0) {
    const keyboard = new InlineKeyboard()
      .text('🏠 Main Menu', 'menu:main')

    await ctx.reply(
      '✅ *No Pending Recharges*\n\n' +
      'All recharge requests have been processed!',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    )
    return
  }

  const message = `
📋 *Pending Wallet Recharges* (${pendingRecharges.length} total)

━━━━━━━━━━━━━━━━━
${pendingRecharges.map((r, i) => {
  const date = new Date(r.request.createdAt).toLocaleDateString()
  return `${i + 1}. ID: \`WR-${r.request.id}\`
     User: ${r.user.telegramFirstName}
     Amount: $${(r.request.amountCents / 100).toFixed(2)}
     Date: ${date}
     📸: ${r.request.screenshotFileId ? '✅' : '❌'}`
}).join('\n\n')}
━━━━━━━━━━━━━━━━━

Use /recharge <id> to review a request.
  `

  const keyboard = new InlineKeyboard()

  // Add buttons for first 5 requests
  pendingRecharges.slice(0, 5).forEach((r) => {
    keyboard.text(`#WR-${r.request.id}`, `admin:recharges:view:${r.request.id}`)
  })

  keyboard
    .row()
    .text('🔄 Refresh', 'admin:recharges:pending')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// View Recharge Details
// ============================================================================

async function handleViewRechargeDetails(ctx: BotContext, rechargeId: number): Promise<void> {
  const recharge = await walletRechargeService.getRechargeRequestById(rechargeId)

  if (!recharge) {
    await ctx.reply(`❌ Recharge #${rechargeId} not found.`)
    return
  }

  await displayRechargeDetailsForVerification(ctx, recharge)
}

// ============================================================================
// List All Recharges (Admin)
// ============================================================================

async function handleAdminRechargesList(ctx: BotContext): Promise<void> {
  const fromId = ctx.from?.id

  if (!fromId) return

  // Get pending recharge requests
  const allRecharges = await walletRechargeService.getPendingRechargeRequests(20, 0)

  if (allRecharges.length === 0) {
    await ctx.reply('📋 No recharge requests found.')
    return
  }

  const message = `
📊 *Wallet Recharge List*

━━━━━━━━━━━━━━━━━
${allRecharges.map((r, i) => {
  const date = new Date(r.request.createdAt).toLocaleDateString()
  const statusEmoji = {
    'awaiting_screenshot': '📸',
    'pending': '⏳',
    'approved': '✅',
    'rejected': '❌',
    'expired': '⏰'
  }[r.request.status] || '❓'

  return `${i + 1}. ${statusEmoji} \`WR-${r.request.id}\`
     User: ${r.user.telegramFirstName}
     Amount: $${(r.request.amountCents / 100).toFixed(2)}
     Status: ${r.request.status}
     Date: ${date}`
}).join('\n\n')}
━━━━━━━━━━━━━━━━━
  `

  const keyboard = new InlineKeyboard()
    .text('🔄 Refresh', 'admin:recharges:list')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// Approve Recharge
// ============================================================================

async function handleApproveRecharge(ctx: BotContext, rechargeId: number): Promise<void> {
  const from = ctx.from
  if (!from) return

  // Send typing action
  await ctx.api.sendChatAction(ctx.chat!.id, 'typing')

  const recharge = await walletRechargeService.getRechargeRequestById(rechargeId)

  if (!recharge) {
    await ctx.reply(`❌ Recharge #${rechargeId} not found.`)
    return
  }

  if (recharge.status !== 'pending') {
    await ctx.reply(`❌ Recharge is not in pending state. Current status: ${recharge.status}`)
    return
  }

  // Verify recharge (approve)
  const result = await walletRechargeService.verifyRecharge({
    requestId: rechargeId,
    adminId: from.id,
    approved: true,
    adminNote: `Approved by ${from.firstName || 'Admin'}`
  })

  if (!result.success) {
    await ctx.reply(`❌ ${result.message}`)
    return
  }

  // Notify user
  if (result.request && result.request.userId) {
    const { notifyRechargeApproval } = await import('./wallet.js')
    await notifyRechargeApproval(ctx, result.request.userId, rechargeId, result.request.amountCents)
  }

  const keyboard = new InlineKeyboard()
    .text('📋 Next Pending', 'admin:recharges:pending')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    '✅ *Recharge Approved!*\n\n' +
    `Recharge WR-${rechargeId} has been approved and $${(recharge.amountCents / 100).toFixed(2)} has been added to the user's wallet.`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )
}

// ============================================================================
// Reject Recharge
// ============================================================================

async function handleRejectRecharge(ctx: BotContext, rechargeId: number): Promise<void> {
  const from = ctx.from
  if (!from) return

  // Set session state for rejection reason
  ;(ctx.session as any).rejectingRechargeId = rechargeId
  ;(ctx.session as any).awaitingRechargeRejectionReason = true

  const keyboard = new InlineKeyboard()
    .text('❌ Cancel Rejection', 'admin:recharges:pending')

  await ctx.reply(
    '❌ *Reject Recharge*\n\n' +
    `Please provide a reason for rejecting recharge WR-${rechargeId}.\n\n` +
    'Type your reason below (or click Cancel to abort):',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )
}

// ============================================================================
// Handle Recharge Rejection Reason Input (Text Handler)
// ============================================================================

export async function handleRechargeRejectionReason(ctx: BotContext, reason: string): Promise<boolean> {
  const from = ctx.from
  if (!from) return false

  const rejectingRechargeId = (ctx.session as any).rejectingRechargeId
  const awaitingReason = (ctx.session as any).awaitingRechargeRejectionReason

  if (!awaitingReason || !rejectingRechargeId) {
    return false // Not for us
  }

  // Clear session state
  ;(ctx.session as any).rejectingRechargeId = undefined
  ;(ctx.session as any).awaitingRechargeRejectionReason = undefined

  const recharge = await walletRechargeService.getRechargeRequestById(rejectingRechargeId)

  if (!recharge) {
    await ctx.reply(`❌ Recharge #${rejectingRechargeId} not found.`)
    return true
  }

  if (recharge.status !== 'pending') {
    await ctx.reply(`❌ Recharge is not in pending state. Current status: ${recharge.status}`)
    return true
  }

  // Verify recharge (reject)
  const result = await walletRechargeService.verifyRecharge({
    requestId: rejectingRechargeId,
    adminId: from.id,
    approved: false,
    rejectionReason: reason
  })

  if (!result.success) {
    await ctx.reply(`❌ ${result.message}`)
    return true
  }

  // Notify user
  if (result.request && result.request.userId) {
    const { notifyRechargeRejection } = await import('./wallet.js')
    await notifyRechargeRejection(ctx, result.request.userId, rejectingRechargeId, reason)
  }

  const keyboard = new InlineKeyboard()
    .text('📋 Next Pending', 'admin:recharges:pending')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    '❌ *Recharge Rejected*\n\n' +
    `Recharge WR-${rejectingRechargeId} has been rejected.\n` +
    `Reason: ${reason}\n\n` +
    'The user has been notified.',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )

  return true
}
