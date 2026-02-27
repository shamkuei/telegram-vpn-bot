import { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { config } from '@/config/index'
import { walletRechargeService, RECHARGE_CONFIG } from '@/services/wallet-recharge'
import { getWalletByUserId, createWallet } from '@/services/wallet'
import { userQueries } from '@/db/queries'

// ============================================================================
// Types
// ============================================================================

type BotContext = Context

// ============================================================================
// Wallet Handler
// ============================================================================

export async function walletHandler(ctx: BotContext) {
  const action = ctx.match?.[2] || ''
  const param = ctx.match?.[3] || ''

  switch (action) {
    case 'recharge':
      await handleCreateRecharge(ctx)
      break
    case 'reference':
      await handleAddRechargeReference(ctx, parseInt(param))
      break
    case 'cancel':
      await handleCancelRecharge(ctx, parseInt(param))
      break
    case 'status':
      await handleRechargeStatus(ctx, parseInt(param))
      break
    case 'history':
      await handleRechargeHistory(ctx)
      break
    case 'balance':
      await handleShowBalance(ctx)
      break
    default:
      await ctx.reply('❌ Invalid wallet action')
  }
}

// ============================================================================
// Show Wallet Balance
// ============================================================================

export async function handleShowBalance(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const user = await userQueries.findByTelegramId(from.id)
  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  let wallet = await getWalletByUserId(user.id)
  if (!wallet) {
    wallet = await createWallet(user.id)
  }

  if (!wallet) {
    await ctx.reply('❌ Failed to load wallet information')
    return
  }

  const availableBalance = wallet.balanceCents - wallet.frozenBalanceCents

  const keyboard = new InlineKeyboard()
    .text('💰 Top Up Wallet', 'wallet:recharge')
    .row()
    .text('📜 Recharge History', 'wallet:history')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    `💰 *Wallet Balance*\n\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `*Balance:* $${(wallet.balanceCents / 100).toFixed(2)}\n` +
    `*Frozen:* $${(wallet.frozenBalanceCents / 100).toFixed(2)}\n` +
    `*Available:* $${(availableBalance / 100).toFixed(2)}\n` +
    `━━━━━━━━━━━━━━━━━\n\n` +
    `${wallet.isFrozen ? `⚠️ Wallet is frozen: ${wallet.freezeReason || 'Contact support'}\n\n` : ''}` +
    `Use "Top Up Wallet" to add funds to your wallet.`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )
}

// ============================================================================
// Create Wallet Recharge Request
// ============================================================================

async function handleCreateRecharge(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const user = await userQueries.findByTelegramId(from.id)
  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  // Prompt user for amount
  ;(ctx.session as any).awaitingRechargeAmount = true

  const keyboard = new InlineKeyboard()
    .text('❌ Cancel', 'menu:main')

  await ctx.reply(
    `💰 *Top Up Wallet*\n\n` +
    `Please enter the amount you want to add to your wallet (in USD).\n\n` +
    `Minimum amount: $1.00\n` +
    `Maximum amount: $1000.00\n\n` +
    `Example: Enter "50" for $50.00`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )
}

// ============================================================================
// Handle Recharge Amount Input
// ============================================================================

export async function handleRechargeAmountInput(ctx: BotContext, text: string) {
  const from = ctx.from
  if (!from) return false

  const awaitingRechargeAmount = (ctx.session as any).awaitingRechargeAmount
  if (!awaitingRechargeAmount) return false

  // Clear the awaiting state
  ;(ctx.session as any).awaitingRechargeAmount = false

  // Parse amount
  const amount = parseFloat(text)
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Invalid amount. Please enter a valid number.')
    return true
  }

  const amountCents = Math.round(amount * 100)

  // Validate min/max
  const minRechargeCents = parseInt(process.env.MIN_WALLET_RECHARGE_CENTS || '100')
  const maxRechargeCents = parseInt(process.env.MAX_WALLET_RECHARGE_CENTS || '100000')

  if (amountCents < minRechargeCents) {
    await ctx.reply(`❌ Minimum recharge amount is $${(minRechargeCents / 100).toFixed(2)}`)
    return true
  }

  if (amountCents > maxRechargeCents) {
    await ctx.reply(`❌ Maximum recharge amount is $${(maxRechargeCents / 100).toFixed(2)}`)
    return true
  }

  const user = await userQueries.findByTelegramId(from.id)
  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return true
  }

  // Create recharge request
  const result = await walletRechargeService.createWalletRecharge({
    userId: user.id,
    amountCents: amountCents,
    currency: 'USD',
    ipAddress: ctx.from?.id ? String(ctx.from.id) : undefined
  })

  if (!result.success || !result.request || !result.rechargeInstructions) {
    await ctx.reply(`❌ ${result.message}`)
    return true
  }

  // Store recharge ID in session
  ;(ctx.session as any).pendingRechargeId = result.request.id

  // Show payment instructions with card details
  const keyboard = new InlineKeyboard()
    .text('📸 Send Screenshot', `wallet:reference:${result.request.id}`)
    .row()
    .text('🔄 Check Status', `wallet:status:${result.request.id}`)
    .row()
    .text('❌ Cancel', `wallet:cancel:${result.request.id}`)
    .row()
    .text('🏠 Main Menu', 'menu:main')

  const message = `
💳 *Wallet Recharge Instructions*

━━━━━━━━━━━━━━━━━
*Amount:* $${result.rechargeInstructions.amount}

💳 *Card Details:*
━━━━━━━━━━━━━━━━━
*Card Number:* \`${result.rechargeInstructions.cardNumber}\`
*Card Holder:* ${result.rechargeInstructions.cardHolder}
━━━━━━━━━━━━━━━━━

📝 *Reference:* \`${result.rechargeInstructions.reference}\`

⏰ *Expires in:* ${RECHARGE_CONFIG.rechargeExpiryHours} hours

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

  // Notify admins of new recharge request
  await notifyAdminsOfNewRecharge(ctx, result.request, user)

  return true
}

// ============================================================================
// Handle Screenshot Upload (via photo message)
// ============================================================================

export async function handleWalletScreenshotUpload(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  // Get pending recharge from session
  const pendingRechargeId = (ctx.session as any).pendingRechargeId

  if (!pendingRechargeId) {
    await ctx.reply('❌ No pending recharge request found. Please start a new recharge.')
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
    const filePath = file.file_path || `recharge_screenshots/${pendingRechargeId}_${Date.now()}.jpg`

    // Attach screenshot to recharge request
    const result = await walletRechargeService.attachRechargeScreenshot(
      pendingRechargeId,
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

    // Clear pending recharge from session
    ;(ctx.session as any).pendingRechargeId = undefined

    const keyboard = new InlineKeyboard()
      .text('📋 Add Transaction ID', `wallet:reference:${pendingRechargeId}`)
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
    await notifyAdminsOfRechargeScreenshot(ctx, pendingRechargeId, user)
  } catch (error) {
    console.error('Recharge screenshot upload error:', error)
    await ctx.reply('❌ Failed to process screenshot. Please try again.')
  }
}

// ============================================================================
// Add Recharge Reference (Transaction ID)
// ============================================================================

async function handleAddRechargeReference(ctx: BotContext, rechargeId: number) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const { getRechargeRequestById } = await import('@/services/wallet-recharge.js')

  const user = await userQueries.findByTelegramId(from.id)
  const recharge = await getRechargeRequestById(rechargeId)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  if (!recharge) {
    await ctx.reply('❌ Recharge request not found')
    return
  }

  if (recharge.userId !== user.id) {
    await ctx.reply('❌ This recharge request does not belong to you')
    return
  }

  // Set the recharge ID in session for text input
  ;(ctx.session as any).pendingRechargeId = rechargeId
  ;(ctx.session as any).awaitingRechargeReference = true

  const keyboard = new InlineKeyboard()
    .text('✅ Done', `wallet:status:${rechargeId}`)
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
// Handle Text Input for Recharge Reference
// ============================================================================

export async function handleWalletRechargeReferenceInput(ctx: BotContext, text: string) {
  const from = ctx.from
  if (!from) return false

  const pendingRechargeId = (ctx.session as any).pendingRechargeId
  const awaitingRechargeReference = (ctx.session as any).awaitingRechargeReference

  if (!awaitingRechargeReference || !pendingRechargeId) {
    return false // Not handled
  }

  // Clear the awaiting state
  ;(ctx.session as any).awaitingRechargeReference = false
  ;(ctx.session as any).pendingRechargeId = undefined

  const { getRechargeRequestById } = await import('@/services/wallet-recharge.js')
  const recharge = await getRechargeRequestById(pendingRechargeId)

  if (!recharge) {
    await ctx.reply('❌ Recharge request not found')
    return true
  }

  // Set recharge reference
  const result = await walletRechargeService.setRechargeReference(pendingRechargeId, text)

  if (result.success) {
    const keyboard = new InlineKeyboard()
      .text('📸 Upload Screenshot', `wallet:reference:${pendingRechargeId}`)
      .row()
      .text('🏠 Main Menu', 'menu:main')

    await ctx.reply(
      '✅ *Transaction ID Saved!*\n\n' +
      `Your reference: \`${text}\`\n\n` +
      (recharge.screenshotFileId
        ? 'Your recharge request is now complete and awaiting verification.'
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
// Cancel Recharge Request
// ============================================================================

async function handleCancelRecharge(ctx: BotContext, rechargeId: number) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  const result = await walletRechargeService.cancelRechargeRequest(rechargeId)

  // Clear session
  ;(ctx.session as any).pendingRechargeId = undefined
  ;(ctx.session as any).awaitingRechargeReference = false

  const keyboard = new InlineKeyboard()
    .text('💰 Top Up Wallet', 'wallet:recharge')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    '❌ Recharge Request Cancelled\n\n' +
    'You can start a new recharge whenever you\'re ready.',
    { reply_markup: keyboard }
  )
}

// ============================================================================
// Recharge Request Status
// ============================================================================

async function handleRechargeStatus(ctx: BotContext, rechargeId: number) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const { getRechargeRequestById } = await import('@/services/wallet-recharge.js')

  const user = await userQueries.findByTelegramId(from.id)
  const recharge = await getRechargeRequestById(rechargeId)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  if (!recharge) {
    await ctx.reply('❌ Recharge request not found')
    return
  }

  if (recharge.userId !== user.id) {
    await ctx.reply('❌ This recharge request does not belong to you')
    return
  }

  let statusEmoji = '⏳'
  let statusText = ''
  let statusMessage = ''

  switch (recharge.status) {
    case 'awaiting_screenshot':
      statusEmoji = '📸'
      statusText = 'Awaiting Screenshot'
      statusMessage = 'Please upload your payment screenshot to continue.'
      break
    case 'pending':
      statusEmoji = '⏳'
      statusText = 'Pending Verification'
      statusMessage = 'Your recharge is being reviewed by our admin.'
      break
    case 'approved':
      statusEmoji = '✅'
      statusText = 'Approved!'
      statusMessage = 'Your payment has been verified and wallet has been credited.'
      break
    case 'rejected':
      statusEmoji = '❌'
      statusText = 'Rejected'
      statusMessage = recharge.rejectionReason || 'Your recharge was rejected. Please contact support.'
      break
    case 'expired':
      statusEmoji = '⏰'
      statusText = 'Expired'
      statusMessage = 'This recharge request has expired. Please create a new request.'
      break
    default:
      statusEmoji = '❓'
      statusText = recharge.status
      statusMessage = 'Please contact support for more information.'
  }

  const message = `
${statusEmoji} *Recharge Request Status*

━━━━━━━━━━━━━━━━━
*Amount:* $${(recharge.amountCents / 100).toFixed(2)}
*Reference:* ${recharge.paymentReference || 'N/A'}
*Status:* ${statusText}
━━━━━━━━━━━━━━━━━

${statusMessage}

📅 Created: ${new Date(recharge.createdAt).toLocaleString()}
${recharge.verifiedAt ? `✓ Verified: ${new Date(recharge.verifiedAt).toLocaleString()}` : ''}
  `

  const keyboard = new InlineKeyboard()

  // Show appropriate buttons based on status
  if (recharge.status === 'awaiting_screenshot') {
    keyboard.text('📸 Upload Screenshot', `wallet:reference:${recharge.id}`)
      .row()
  }

  if (recharge.status === 'awaiting_screenshot' || recharge.status === 'pending') {
    if (!recharge.paymentReference) {
      keyboard.text('📝 Add Transaction ID', `wallet:reference:${recharge.id}`)
        .row()
    }
  }

  if (recharge.status === 'pending') {
    keyboard.text('🔄 Refresh', `wallet:status:${recharge.id}`)
      .row()
  }

  if (recharge.status === 'rejected') {
    keyboard.text('💰 Top Up Wallet', 'wallet:recharge')
      .row()
  }

  keyboard.text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// Recharge History
// ============================================================================

async function handleRechargeHistory(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  const { getUserRechargeRequests } = await import('@/services/wallet-recharge.js')
  const rechargeRequests = await getUserRechargeRequests(user.id)

  if (rechargeRequests.length === 0) {
    const keyboard = new InlineKeyboard()
      .text('💰 Top Up Wallet', 'wallet:recharge')
      .row()
      .text('🏠 Main Menu', 'menu:main')

    await ctx.reply(
      '📜 *Recharge History*\n\n' +
      'No recharge requests found.',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    )
    return
  }

  let message = '📜 *Recharge History*\n\n'

  for (const request of rechargeRequests.slice(0, 10)) {
    let statusEmoji = '⏳'
    switch (request.status) {
      case 'awaiting_screenshot': statusEmoji = '📸'; break
      case 'pending': statusEmoji = '⏳'; break
      case 'approved': statusEmoji = '✅'; break
      case 'rejected': statusEmoji = '❌'; break
      case 'expired': statusEmoji = '⏰'; break
    }

    message += `${statusEmoji} $${(request.amountCents / 100).toFixed(2)} - ${request.status}\n`
    message += `   ${new Date(request.createdAt).toLocaleDateString()}\n`
    message += `   ID: WR-${request.id}\n\n`
  }

  const keyboard = new InlineKeyboard()
    .text('💰 Top Up Wallet', 'wallet:recharge')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// Notify Admins of New Recharge Request
// ============================================================================

async function notifyAdminsOfNewRecharge(
  ctx: BotContext,
  request: any,
  user: any
): Promise<void> {
  const adminIds = config.TELEGRAM_ADMIN_IDS

  if (!adminIds || adminIds.length === 0) return

  const keyboard = new InlineKeyboard()
    .text('🔍 Verify', `admin:recharges:pending`)
    .row()
    .text('📋 All Recharges', `admin:recharges:list`)

  const message = `
💰 *New Wallet Recharge Request*

━━━━━━━━━━━━━━━━━
*Request ID:* WR-${request.id}
*User:* ${user.telegramFirstName} ${user.telegramLastName || ''} (@${user.telegramUsername || 'N/A'})
*User ID:* \`${user.telegramId}\`
━━━━━━━━━━━━━━━━━

*Amount:* $${(request.amountCents / 100).toFixed(2)}
*Created:* ${new Date(request.createdAt).toLocaleString()}

Use /recharge ${request.id} to review this request.
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
// Notify Admins of Recharge Screenshot Upload
// ============================================================================

async function notifyAdminsOfRechargeScreenshot(
  ctx: BotContext,
  rechargeId: number,
  user: any
): Promise<void> {
  const adminIds = config.TELEGRAM_ADMIN_IDS

  if (!adminIds || adminIds.length === 0) return

  const { getRechargeRequestById } = await import('@/services/wallet-recharge.js')
  const recharge = await getRechargeRequestById(rechargeId)

  const keyboard = new InlineKeyboard()
    .url('🔍 View Recharge', `https://t.me/${ctx.me.username}?start=admin_recharge_${rechargeId}`)
    .row()
    .text('✅ Approve', `admin:recharge:approve:${rechargeId}`)
    .text('❌ Reject', `admin:recharge:reject:${rechargeId}`)

  const message = `
📸 *Recharge Screenshot Received!*

━━━━━━━━━━━━━━━━━
*Request ID:* WR-${rechargeId}
*User:* ${user.telegramFirstName} ${user.telegramLastName || ''} (@${user.telegramUsername || 'N/A'})
━━━━━━━━━━━━━━━━━

*Amount:* $${recharge ? (recharge.amountCents / 100).toFixed(2) : 'N/A'}

Ready for verification!
Use /recharge ${rechargeId} to review.
  `

  // Forward screenshot if available
  if (recharge?.screenshotFileId) {
    for (const adminId of adminIds) {
      try {
        // Send message first
        await ctx.api.sendPhoto(adminId, recharge.screenshotFileId, {
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
// Notify User of Recharge Approval
// ============================================================================

export async function notifyRechargeApproval(
  ctx: BotContext,
  userId: number,
  rechargeId: number,
  amount: number
): Promise<void> {
  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findById(userId)

  if (!user) return

  const keyboard = new InlineKeyboard()
    .text('💰 My Wallet', 'wallet:balance')
    .row()
    .text('📦 Browse Plans', 'plans:page:1')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  const message = `
✅ *Recharge Approved!*

━━━━━━━━━━━━━━━━━
*Request ID:* WR-${rechargeId}
*Amount:* $${(amount / 100).toFixed(2)}
━━━━━━━━━━━━━━━━━

🎉 Your wallet has been credited successfully!

Use "My Wallet" to view your updated balance.
Thank you for your payment! 🙏
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
// Notify User of Recharge Rejection
// ============================================================================

export async function notifyRechargeRejection(
  ctx: BotContext,
  userId: number,
  rechargeId: number,
  reason?: string
): Promise<void> {
  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findById(userId)

  if (!user) return

  const keyboard = new InlineKeyboard()
    .text('💰 Top Up Wallet', 'wallet:recharge')
    .row()
    .text('💬 Contact Support', 'menu:support')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  const message = `
❌ *Recharge Rejected*

━━━━━━━━━━━━━━━━━
*Request ID:* WR-${rechargeId}
━━━━━━━━━━━━━━━━━

${reason ? `*Reason:* ${reason}\n\n` : ''}Your recharge request could not be verified.

Please contact support if you believe this is an error, or try again with a new request.
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
