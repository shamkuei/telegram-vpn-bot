import { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { config } from '@/config/index'
import { manualPaymentService, PAYMENT_CONFIG } from '@/services/manual-payment'

// ============================================================================
// Types
// ============================================================================

type BotContext = Context

// ============================================================================
// Payment Handler - Manual Payment System
// ============================================================================

export async function paymentHandler(ctx: BotContext) {
  const action = ctx.match?.[2] || ''
  const param = ctx.match?.[3] || ''

  switch (action) {
    case 'create':
      await handleCreateManualPayment(ctx, parseInt(param))
      break
    case 'reference':
      await handleAddReference(ctx, parseInt(param))
      break
    case 'cancel':
      await handleCancelPayment(ctx, parseInt(param))
      break
    case 'status':
      await handlePaymentStatus(ctx, parseInt(param))
      break
    default:
      await ctx.reply('❌ Invalid payment action')
  }
}

// ============================================================================
// Create Manual Payment
// ============================================================================

async function handleCreateManualPayment(ctx: BotContext, planId: number) {
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

  // Create manual payment request
  const result = await manualPaymentService.createManualPayment({
    userId: user.id,
    planId: plan.id,
    amountCents: plan.priceUsdCents,
    currency: 'USD',
    ipAddress: ctx.from?.id ? String(ctx.from.id) : undefined
  })

  if (!result.success || !result.payment || !result.paymentInstructions) {
    await ctx.reply(`❌ ${result.message}`)
    return
  }

  // Store payment ID in session
  ctx.session.selectedPlan = plan.id
  ;(ctx.session as any).pendingPaymentId = result.payment.id

  // Show payment instructions with card details
  const keyboard = new InlineKeyboard()
    .text('📸 Send Screenshot', `payment:reference:${result.payment.id}`)
    .row()
    .text('🔄 Check Status', `payment:status:${result.payment.id}`)
    .row()
    .text('❌ Cancel', `payment:cancel:${result.payment.id}`)
    .row()
    .text('🏠 Main Menu', 'menu:main')

  const message = `
💳 *Payment Instructions*

*Plan:* ${result.plan?.name || 'VPN Plan'}
*Duration:* ${result.plan?.durationDays || 30} days
*Amount:* $${result.paymentInstructions.amount}

💳 *Card Details:*
━━━━━━━━━━━━━━━━━
*Card Number:* \`${result.paymentInstructions.cardNumber}\`
*Card Holder:* ${result.paymentInstructions.cardHolder}
━━━━━━━━━━━━━━━━━

📝 *Reference:* \`${result.paymentInstructions.reference}\`

⏰ *Expires in:* ${PAYMENT_CONFIG.paymentExpiryHours} hours

━━━━━━━━━━━━━━━━━
*Instructions:*
1️⃣ Send the exact amount to the card above
2️⃣ Click "Send Screenshot" below
3️⃣ Upload your payment screenshot
4️⃣ Wait for admin verification

⚠️ *Important:*
- Include the reference in your payment note
- Make sure the screenshot clearly shows the transaction
- Keep your payment receipt for verification
  `

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })

  // Notify admins of new payment request
  await notifyAdminsOfNewPayment(ctx, result.payment, plan, user)
}

// ============================================================================
// Handle Screenshot Upload (via photo message)
// ============================================================================

export async function handleScreenshotUpload(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  // Get pending payment from session
  const pendingPaymentId = (ctx.session as any).pendingPaymentId

  if (!pendingPaymentId) {
    await ctx.reply('❌ No pending payment found. Please select a plan first.')
    return
  }

  // Check if user sent a photo
  const photo = ctx.message?.photo
  if (!photo || photo.length === 0) {
    await ctx.reply('❌ Please send a screenshot image.')
    return
  }

  // Get the largest photo (highest resolution)
  const largestPhoto = photo[photo.length - 1]

  try {
    // Get file info
    const file = await ctx.api.getFile(largestPhoto.file_id)

    // Create file path for storage
    const filePath = file.file_path || `screenshots/${pendingPaymentId}_${Date.now()}.jpg`

    // Attach screenshot to payment
    const result = await manualPaymentService.attachPaymentScreenshot(
      pendingPaymentId,
      largestPhoto.file_id,
      largestPhoto.file_unique_id,
      filePath,
      'image/jpeg',
      largestPhoto.file_size || 0
    )

    if (!result.success) {
      await ctx.reply(`❌ ${result.message}`)
      return
    }

    // Clear pending payment from session
    ;(ctx.session as any).pendingPaymentId = undefined

    const keyboard = new InlineKeyboard()
      .text('📋 Add Transaction ID', `payment:reference:${pendingPaymentId}`)
      .row()
      .text('🏠 Main Menu', 'menu:main')

    await ctx.reply(
      '✅ *Screenshot Received!*\n\n' +
      'Your payment screenshot has been received and is pending verification by our admin.\n\n' +
      '⏳ *Expected verification time:* 1-24 hours\n\n' +
      'You can optionally add your transaction ID/reference number for faster verification.',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    )

    // Notify admins of new screenshot
    await notifyAdminsOfScreenshot(ctx, pendingPaymentId, user)
  } catch (error) {
    console.error('Screenshot upload error:', error)
    await ctx.reply('❌ Failed to process screenshot. Please try again.')
  }
}

// ============================================================================
// Add Payment Reference (Transaction ID)
// ============================================================================

async function handleAddReference(ctx: BotContext, paymentId: number) {
  const from = ctx.from
  if (!from) return

  const { userQueries, manualPaymentQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)
  const payment = await manualPaymentQueries.findById(paymentId)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  if (!payment) {
    await ctx.reply('❌ Payment not found')
    return
  }

  if (payment.userId !== user.id) {
    await ctx.reply('❌ This payment does not belong to you')
    return
  }

  // Set the payment ID in session for text input
  ;(ctx.session as any).pendingPaymentId = paymentId
  ;(ctx.session as any).awaitingReference = true

  const keyboard = new InlineKeyboard()
    .text('✅ Done', `payment:status:${paymentId}`)
    .row()
    .text('❌ Cancel', 'menu:main')

  await ctx.reply(
    '📝 *Add Transaction ID*\n\n' +
    'Please send your transaction ID or reference number from the payment.\n\n' +
    'This helps us verify your payment faster.',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )
}

// ============================================================================
// Handle Text Input for Transaction Reference
// ============================================================================

export async function handlePaymentReferenceInput(ctx: BotContext, text: string) {
  const from = ctx.from
  if (!from) return

  const pendingPaymentId = (ctx.session as any).pendingPaymentId
  const awaitingReference = (ctx.session as any).awaitingReference

  if (!awaitingReference || !pendingPaymentId) {
    return false // Not handled
  }

  // Clear the awaiting state
  ;(ctx.session as any).awaitingReference = false
  ;(ctx.session as any).pendingPaymentId = undefined

  const { manualPaymentQueries } = await import('@/db/queries.js')
  const payment = await manualPaymentQueries.findById(pendingPaymentId)

  if (!payment) {
    await ctx.reply('❌ Payment not found')
    return true
  }

  // Set payment reference
  const result = await manualPaymentService.setPaymentReference(pendingPaymentId, text)

  if (result.success) {
    const keyboard = new InlineKeyboard()
      .text('📸 Upload Screenshot', `payment:screenshot:${pendingPaymentId}`)
      .row()
      .text('🏠 Main Menu', 'menu:main')

    await ctx.reply(
      '✅ *Transaction ID Saved!*\n\n' +
      `Your reference: \`${text}\`\n\n` +
      (payment.screenshotFileId
        ? 'Your payment is now complete and awaiting verification.'
        : 'Please upload your payment screenshot to complete the process.'),
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    )
  } else {
    await ctx.reply(`❌ ${result.message}`)
  }

  return true
}

// ============================================================================
// Cancel Payment
// ============================================================================

async function handleCancelPayment(ctx: BotContext, paymentId: number) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  const result = await manualPaymentService.cancelManualPayment(paymentId)

  // Clear session
  ctx.session.selectedPlan = undefined
  ;(ctx.session as any).pendingPaymentId = undefined
  ;(ctx.session as any).awaitingReference = false

  const keyboard = new InlineKeyboard()
    .text('📦 Browse Plans', 'plans:page:1')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    '❌ Payment Cancelled\n\n' +
    'You can browse our plans and try again whenever you\'re ready.',
    { reply_markup: keyboard }
  )
}

// ============================================================================
// Payment Status
// ============================================================================

async function handlePaymentStatus(ctx: BotContext, paymentId: number) {
  const from = ctx.from
  if (!from) return

  const { userQueries, manualPaymentQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)
  const payment = await manualPaymentQueries.findById(paymentId)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  if (!payment) {
    await ctx.reply('❌ Payment not found')
    return
  }

  if (payment.userId !== user.id) {
    await ctx.reply('❌ This payment does not belong to you')
    return
  }

  let statusEmoji = '⏳'
  let statusText = ''
  let statusMessage = ''

  switch (payment.status) {
    case 'awaiting_screenshot':
      statusEmoji = '📸'
      statusText = 'Awaiting Screenshot'
      statusMessage = 'Please upload your payment screenshot to continue.'
      break
    case 'pending':
      statusEmoji = '⏳'
      statusText = 'Pending Verification'
      statusMessage = 'Your payment is being reviewed by our admin.'
      break
    case 'approved':
      statusEmoji = '✅'
      statusText = 'Approved!'
      statusMessage = 'Your payment has been verified and subscription is activated.'
      break
    case 'rejected':
      statusEmoji = '❌'
      statusText = 'Rejected'
      statusMessage = payment.rejectionReason || 'Your payment was rejected. Please contact support.'
      break
    case 'expired':
      statusEmoji = '⏰'
      statusText = 'Expired'
      statusMessage = 'This payment has expired. Please create a new payment request.'
      break
    default:
      statusEmoji = '❓'
      statusText = payment.status
      statusMessage = 'Please contact support for more information.'
  }

  const { planQueries } = await import('@/db/queries.js')
  const plan = await planQueries.findById(payment.planId)

  const message = `
${statusEmoji} *Payment Status*

━━━━━━━━━━━━━━━━━
*Plan:* ${plan?.name || 'N/A'}
*Amount:* $${(payment.amountCents / 100).toFixed(2)}
*Reference:* ${payment.paymentReference || 'N/A'}
*Status:* ${statusText}
━━━━━━━━━━━━━━━━━

${statusMessage}

📅 Created: ${new Date(payment.createdAt).toLocaleString()}
${payment.verifiedAt ? `✓ Verified: ${new Date(payment.verifiedAt).toLocaleString()}` : ''}
  `

  const keyboard = new InlineKeyboard()

  // Show appropriate buttons based on status
  if (payment.status === 'awaiting_screenshot') {
    keyboard.text('📸 Upload Screenshot', `payment:screenshot:${payment.id}`)
      .row()
  }

  if (payment.status === 'awaiting_screenshot' || payment.status === 'pending') {
    if (!payment.paymentReference) {
      keyboard.text('📝 Add Transaction ID', `payment:reference:${payment.id}`)
        .row()
    }
  }

  if (payment.status === 'pending') {
    keyboard.text('🔄 Refresh', `payment:status:${payment.id}`)
      .row()
  }

  if (payment.status === 'rejected') {
    keyboard.text('📦 Browse Plans', 'plans:page:1')
      .row()
  }

  keyboard.text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// Notify Admins of New Payment Request
// ============================================================================

async function notifyAdminsOfNewPayment(
  ctx: BotContext,
  payment: any,
  plan: any,
  user: any
): Promise<void> {
  const adminIds = config.TELEGRAM_ADMIN_IDS

  if (!adminIds || adminIds.length === 0) return

  const keyboard = new InlineKeyboard()
    .text('🔍 Verify', `admin:payments:pending`)
    .row()
    .text('📋 All Payments', `admin:payments:list`)

  const message = `
💳 *New Manual Payment Request*

━━━━━━━━━━━━━━━━━
*Payment ID:* ${payment.id}
*User:* ${user.telegramFirstName} ${user.telegramLastName || ''} (@${user.telegramUsername || 'N/A'})
*User ID:* \`${user.telegramId}\`
━━━━━━━━━━━━━━━━━

*Plan:* ${plan.name}
*Amount:* $${(payment.amountCents / 100).toFixed(2)}
*Created:* ${new Date(payment.createdAt).toLocaleString()}

Use /verify_payment ${payment.id} to review this payment.
  `

  for (const adminId of adminIds) {
    try {
      await ctx.api.sendMessage(adminId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      })
    } catch (error) {
      console.error(`Failed to notify admin ${adminId}:`, error)
    }
  }
}

// ============================================================================
// Notify Admins of Screenshot Upload
// ============================================================================

async function notifyAdminsOfScreenshot(
  ctx: BotContext,
  paymentId: number,
  user: any
): Promise<void> {
  const adminIds = config.TELEGRAM_ADMIN_IDS

  if (!adminIds || adminIds.length === 0) return

  const { manualPaymentQueries } = await import('@/db/queries.js')
  const payment = await manualPaymentQueries.findById(paymentId)
  const { planQueries } = await import('@/db/queries.js')
  const plan = payment ? await planQueries.findById(payment.planId) : null

  const keyboard = new InlineKeyboard()
    .url('🔍 View Payment', `https://t.me/${ctx.me.username}?start=admin_payment_${paymentId}`)
    .row()
    .text('✅ Approve', `admin:payment:approve:${paymentId}`)
    .text('❌ Reject', `admin:payment:reject:${paymentId}`)

  const message = `
📸 *Payment Screenshot Received!*

━━━━━━━━━━━━━━━━━
*Payment ID:* ${paymentId}
*User:* ${user.telegramFirstName} ${user.telegramLastName || ''} (@${user.telegramUsername || 'N/A'})
━━━━━━━━━━━━━━━━━

*Plan:* ${plan?.name || 'N/A'}
*Amount:* $${payment ? (payment.amountCents / 100).toFixed(2) : 'N/A'}

Ready for verification!
Use /verify_payment ${paymentId} to review.
  `

  // Forward screenshot if available
  if (payment?.screenshotFileId) {
    for (const adminId of adminIds) {
      try {
        // Send message first
        await ctx.api.sendPhoto(adminId, payment.screenshotFileId, {
          caption: message,
          parse_mode: 'Markdown'
        })

        // Then send keyboard
        await ctx.api.sendMessage(adminId, 'Choose an action:', {
          reply_markup: keyboard
        })
      } catch (error) {
        console.error(`Failed to notify admin ${adminId}:`, error)
      }
    }
  } else {
    for (const adminId of adminIds) {
      try {
        await ctx.api.sendMessage(adminId, message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        })
      } catch (error) {
        console.error(`Failed to notify admin ${adminId}:`, error)
      }
    }
  }
}

// ============================================================================
// Notify User of Payment Approval
// ============================================================================

export async function notifyPaymentApproval(
  ctx: BotContext,
  userId: number,
  paymentId: number,
  planName: string
): Promise<void> {
  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findById(userId)

  if (!user) return

  const keyboard = new InlineKeyboard()
    .text('👤 My Subscriptions', 'mysub:list')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  const message = `
✅ *Payment Approved!*

━━━━━━━━━━━━━━━━━
*Plan:* ${planName}
*Payment ID:* ${paymentId}
━━━━━━━━━━━━━━━━━

🎉 Congratulations! Your payment has been verified and your subscription is now active.

Use the "My Subscriptions" button to view your subscription details and get your VPN connection key.

Thank you for your purchase! 🙏
  `

  try {
    await ctx.api.sendMessage(user.telegramId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    })
  } catch (error) {
    console.error(`Failed to notify user ${user.telegramId}:`, error)
  }
}

// ============================================================================
// Notify User of Payment Rejection
// ============================================================================

export async function notifyPaymentRejection(
  ctx: BotContext,
  userId: number,
  paymentId: number,
  reason?: string
): Promise<void> {
  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findById(userId)

  if (!user) return

  const keyboard = new InlineKeyboard()
    .text('📦 Browse Plans', 'plans:page:1')
    .row()
    .text('💬 Contact Support', 'menu:support')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  const message = `
❌ *Payment Rejected*

━━━━━━━━━━━━━━━━━
*Payment ID:* ${paymentId}
━━━━━━━━━━━━━━━━━

${reason ? `*Reason:* ${reason}\n\n` : ''}Your payment could not be verified.

Please contact support if you believe this is an error, or try again with a new payment.
  `

  try {
    await ctx.api.sendMessage(user.telegramId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    })
  } catch (error) {
    console.error(`Failed to notify user ${user.telegramId}:`, error)
  }
}
