import { Hono } from 'hono'

export const webhookRoutes = new Hono()

// ============================================================================
// Webhook Routes
// ============================================================================

// ============================================================================
// Telegram Bot Webhook
// ============================================================================

webhookRoutes.post('/telegram/:token', async (c) => {
  const { token } = c.req.param()
  const { TELEGRAM_BOT_TOKEN } = process.env

  // Validate bot token
  if (token !== TELEGRAM_BOT_TOKEN?.split(':')[1]) {
    return c.json({ error: 'Invalid bot token' }, 401)
  }

  // Process update
  const update = await c.req.json()

  // Forward to bot handler
  const { handleTelegramUpdate } = await import('@/bot/index.js')
  await handleTelegramUpdate(update)

  return c.json({ ok: true })
})

// ============================================================================
// Marzban Webhooks (if enabled)
// ============================================================================

webhookRoutes.post('/marzban/user-expired', async (c) => {
  // Handle user expiration notifications from Marzban
  const { username } = await c.req.json()

  if (!username) {
    return c.json({ error: 'Username required' }, 400)
  }

  // Process expiration
  const { handleMarzbanUserExpiration } = await import('@/services/marzban-webhook.js')
  await handleMarzbanUserExpiration(username)

  return c.json({ success: true })
})
