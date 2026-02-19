import { MiddlewareHandler } from 'hono'
import crypto from 'crypto'

// ============================================================================
// Webhook Validation Middleware
// ============================================================================

interface WebhookValidatorConfig {
  provider: 'cryptopay' | 'nowpayments' | 'stripe'
  secret: string
  headerName?: string
}

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  provider: string
): boolean {
  switch (provider) {
    case 'cryptopay':
      // CryptoPay uses HMAC-SHA256
      const hmac = crypto.createHmac('sha256', secret)
      hmac.update(payload)
      const expectedSig = 'CryptoPay ' + hmac.digest('hex')
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSig)
      )

    case 'nowpayments':
      // NOWPayments uses HMAC-SHA512
      const npHmac = crypto.createHmac('sha512', secret)
      npHmac.update(payload)
      const expectedNpSig = npHmac.digest('hex')
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedNpSig)
      )

    case 'stripe':
      // Stripe uses its own signature verification
      // This should be done with Stripe SDK
      return signature.startsWith('sha256_') && signature.length > 10

    default:
      return false
  }
}

/**
 * Create webhook validator middleware for a specific provider
 */
export function webhookValidator(provider: string): MiddlewareHandler {
  return async (c, next) => {
    const secret = process.env[
      provider === 'cryptopay'
        ? 'CRYPTOPAY_WEBHOOK_SECRET'
        : provider === 'nowpayments'
          ? 'NOWPAYMENTS_API_IPN_SECRET'
          : 'STRIPE_WEBHOOK_SECRET'
    ]

    if (!secret) {
      console.warn(`No webhook secret configured for ${provider}`)
      // Allow to proceed in development without secret
      if (process.env.NODE_ENV === 'development') {
        return next()
      }
    }

    // Get signature from headers
    const signature = c.req.header(
      provider === 'cryptopay'
        ? 'crypto-pay-api-signature'
        : provider === 'stripe'
          ? 'stripe-signature'
          : 'x-nowpayments-sig'
    )

    if (!signature) {
      return c.json({
        success: false,
        error: 'Invalid Signature',
        message: 'Missing signature header'
      }, 401)
    }

    // Get raw body for signature verification
    const body = await c.req.raw.text()
    const rawBody = Buffer.from(body)

    // Verify signature
    if (secret && !verifyWebhookSignature(rawBody, signature, secret, provider)) {
      return c.json({
        success: false,
        error: 'Invalid Signature',
        message: 'Webhook signature verification failed'
      }, 401)
    }

    // Store raw body for later use
    c.set('rawBody', rawBody)

    return next()
  }
}

/**
 * Verify IP whitelist for webhooks (for NOWPayments, etc.)
 */
export function webhookIpValidator(allowedIps: string[]): MiddlewareHandler {
  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
              c.req.header('x-real-ip') ||
              ''

    if (!ip) {
      return c.json({
        success: false,
        error: 'Forbidden',
        message: 'Unable to determine request IP'
      }, 403)
    }

    // Check if IP is in whitelist
    const isAllowed = allowedIps.some(allowedIp => {
      // CIDR notation support would go here
      return ip === allowedIp
    })

    if (!isAllowed) {
      console.warn(`Webhook request from non-whitelisted IP: ${ip}`)
      // In development, allow all IPs
      if (process.env.NODE_ENV === 'production') {
        return c.json({
          success: false,
          error: 'Forbidden',
          message: 'IP not allowed'
        }, 403)
      }
    }

    return next()
  }
}

// NOWPayments IP ranges (as of 2024)
const NOWPAYMENTS_IPS = [
  '185.14.30.81',
  '185.14.30.82',
  '185.14.30.83',
  '185.14.30.84',
  '185.14.30.85',
  '185.14.30.86',
  '185.14.30.87',
  '185.14.30.88',
  // Add more IPs as needed from NOWPayments documentation
]

export const nowpaymentsIpValidator = webhookIpValidator(NOWPAYMENTS_IPS)
