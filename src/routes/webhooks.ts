import { Hono } from 'hono'
import { webhookValidator } from '@/middleware/webhook-validator.js'
import { paymentWebhookHandlers } from '@/services/payment/index.js'

export const webhookRoutes = new Hono()

// ============================================================================
// Webhook Validation Middleware
// ============================================================================

// ============================================================================
// Payment Webhooks
// ============================================================================

// CryptoPay webhook
webhookRoutes.post('/payment/cryptopay', webhookValidator('cryptopay'), async (c) => {
  const handler = paymentWebhookHandlers.get('cryptopay')
  if (!handler) {
    return c.json({ error: 'Handler not found' }, 501)
  }

  try {
    const result = await handler(c.req.raw, await c.req.json())
    return c.json({ success: true, ...result })
  } catch (error) {
    console.error('CryptoPay webhook error:', error)
    return c.json({ success: false, error: 'Webhook processing failed' }, 500)
  }
})

// NOWPayments webhook
webhookRoutes.post('/payment/nowpayments', webhookValidator('nowpayments'), async (c) => {
  const handler = paymentWebhookHandlers.get('nowpayments')
  if (!handler) {
    return c.json({ error: 'Handler not found' }, 501)
  }

  try {
    const result = await handler(c.req.raw, await c.req.json())
    return c.json({ success: true, ...result })
  } catch (error) {
    console.error('NOWPayments webhook error:', error)
    return c.json({ success: false, error: 'Webhook processing failed' }, 500)
  }
})

// Stripe webhook
webhookRoutes.post('/payment/stripe', webhookValidator('stripe'), async (c) => {
  const handler = paymentWebhookHandlers.get('stripe')
  if (!handler) {
    return c.json({ error: 'Handler not found' }, 501)
  }

  try {
    const result = await handler(c.req.raw, await c.req.text())
    return c.json({ success: true, ...result })
  } catch (error) {
    console.error('Stripe webhook error:', error)
    return c.json({ success: false, error: 'Webhook processing failed' }, 500)
  }
})

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
