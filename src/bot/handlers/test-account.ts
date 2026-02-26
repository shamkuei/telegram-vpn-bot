import { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { testAccountService } from '@/services/test-account'

// ============================================================================
// Types
// ============================================================================

type BotContext = Context

// ============================================================================
// Test Account Handler
// ============================================================================

export async function testAccountHandler(ctx: BotContext) {
  const action = ctx.match?.[2] || ''

  switch (action) {
    case 'create':
      await handleCreateTestAccount(ctx)
      break
    case 'convert':
      await handleConvertTestAccount(ctx)
      break
    case 'list':
      await handleListTestAccounts(ctx)
      break
    default:
      await handleTestAccountMenu(ctx)
  }
}

// ============================================================================
// Test Account Menu
// ============================================================================

async function handleTestAccountMenu(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const { userQueries, testAccountQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  // Check available test accounts
  const activeTestAccounts = await testAccountQueries.countActiveByUserId(user.id)
  const { planQueries } = await import('@/db/queries.js')
  const plan = await planQueries.findById(1) // Get default plan for max test count
  const maxTestAccounts = plan?.maxTestAccountsPerUser || 3

  const remainingTests = maxTestAccounts - activeTestAccounts

  const keyboard = new InlineKeyboard()
    .text('🧪 Get Test Account', 'test:create')
    .row()
    .text('📋 My Test Accounts', 'test:list')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  const message = `
🧪 *Test Account*

*Try before you buy!*

Get a free test VPN account to experience our service before purchasing.

${activeTestAccounts > 0 ? `You currently have ${activeTestAccounts} active test account(s).` : ''}

${remainingTests > 0 ? `You can create ${remainingTests} more test account(s).` : 'You have reached your test account limit.'}

*Test Account Features:*
• Duration: 60 minutes
• Full VPN access
• No payment required
• Limited to ${maxTestAccounts} per user
  `

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}

// ============================================================================
// Create Test Account
// ============================================================================

async function handleCreateTestAccount(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  // Get first available plan for test
  const { planQueries } = await import('@/db/queries.js')
  const plan = await planQueries.getActivePublic()

  if (!plan || plan.length === 0) {
    await ctx.reply('❌ No plans available for test account')
    return
  }

  // Get available servers
  const { serverQueries } = await import('@/db/queries.js')
  const servers = await serverQueries.getPublicActive()

  if (!servers || servers.length === 0) {
    await ctx.reply('❌ No servers available')
    return
  }

  // Create test account
  const result = await testAccountService.createTestAccount(user, {
    planId: plan[0].id,
    serverId: servers[0].id
  })

  if (!result.success) {
    await ctx.reply(`❌ ${result.message}`)
    return
  }

  const keyboard = new InlineKeyboard()
    .text('🔄 Convert to Subscription', `test:convert:${result.testAccount?.id}`)
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    `🧪 *Test Account Created!*\n\n` +
    `You have ${result.testAccount?.durationMinutes || 60} minutes to test our service.\n\n` +
    `Server: ${result.testAccount?.server?.countryCode || 'Unknown'}\n` +
    `Expires at: ${new Date(result.testAccount?.expiresAt || 0).toLocaleString()}\n\n` +
    `Your VPN configuration will be sent in a separate message.`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )

  // Send subscription URL in separate message
  if (result.vpnAccount?.marzbanSubscriptionUrl) {
    await ctx.reply(
      `🔑 *Your Test VPN Configuration*\n\n` +
      `Subscription URL:\n\`${result.vpnAccount.marzbanSubscriptionUrl}\``,
      { parse_mode: 'Markdown' }
    )
  }
}

// ============================================================================
// Convert Test Account
// ============================================================================

async function handleConvertTestAccount(ctx: BotContext) {
  const testAccountId = parseInt(ctx.match?.[3] || '0')

  if (!testAccountId) {
    await handleListTestAccounts(ctx)
    return
  }

  const from = ctx.from
  if (!from) return

  const { userQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  // Convert test account to subscription
  const { planQueries } = await import('@/db/queries.js')
  const plans = await planQueries.getActivePublic()

  if (!plans || plans.length === 0) {
    await ctx.reply('❌ No plans available')
    return
  }

  // Show plan selection
  const keyboard = new InlineKeyboard()

  for (const plan of plans.slice(0, 5)) {
    keyboard.text(`🛒 ${plan.name}`, `test:convert:${testAccountId}:${plan.id}`).row()
  }

  keyboard.text('⬅️ Back', 'test:list').row()
  keyboard.text('🏠 Main Menu', 'menu:main')

  await ctx.reply(
    '💳 *Choose a Plan*\n\n' +
    'Select a plan to convert your test account to a full subscription:',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  )
}

// ============================================================================
// List Test Accounts
// ============================================================================

async function handleListTestAccounts(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  const { userQueries, testAccountQueries } = await import('@/db/queries.js')
  const user = await userQueries.findByTelegramId(from.id)

  if (!user) {
    await ctx.reply('❌ You need to start the bot first. Use /start')
    return
  }

  const testAccounts = await testAccountQueries.getActiveByUserId(user.id)

  if (testAccounts.length === 0) {
    const keyboard = new InlineKeyboard()
      .text('🧪 Get Test Account', 'test:create')
      .row()
      .text('🏠 Main Menu', 'menu:main')

    await ctx.reply(
      '🧪 *My Test Accounts*\n\n' +
      'You have no active test accounts.\n' +
      'Get a free test account to try our service!',
      { parse_mode: 'Markdown', reply_markup: keyboard }
    )
    return
  }

  let message = `🧪 *My Test Accounts* (${testAccounts.length})\n\n`

  for (const testAccount of testAccounts) {
    const remainingMinutes = Math.max(
      0,
      Math.floor((new Date(testAccount.expiresAt).getTime() - Date.now()) / 60000)
    )

    message += `
🔸 Account #${testAccount.id}
   Status: ${testAccount.status}
   Remaining: ${remainingMinutes} minutes
   Created: ${new Date(testAccount.createdAt).toLocaleString()}
`
  }

  const keyboard = new InlineKeyboard()
    .text('🧪 Get New Test', 'test:create')
    .row()
    .text('🏠 Main Menu', 'menu:main')

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
}
