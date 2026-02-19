import { db } from '@/db/index.js'
import { paymentLogs, subscriptions, plans, users } from '@/db/schema/index.js'
import { eq, and, sql } from 'drizzle-orm'
import type { NewPaymentLog } from '@/db/schema/index.js'

// ============================================================================
// Payment Service
// ============================================================================

export interface CreatePaymentInput {
  amountCents: number
  currency?: string
  provider: 'cryptopay' | 'nowpayments' | 'stripe' | 'wallet'
  subscriptionId?: number
  planId?: number
}

export interface PaymentResponse {
  success: boolean
  payment?: any
  paymentUrl?: string
  cryptoAddress?: string
  cryptoAmount?: string
  message: string
}

// ============================================================================
// Create Payment
// ============================================================================

export async function createPayment(user: any, input: CreatePaymentInput): Promise<PaymentResponse> {
  try {
    let finalAmountCents = input.amountCents

    // If paying for subscription, get plan price
    if (input.planId) {
      const plan = await getPlanById(input.planId)
      if (!plan) {
        return {
          success: false,
          message: 'Plan not found'
        }
      }
      finalAmountCents = plan.priceUsdCents
    }

    // If wallet payment, check balance
    if (input.provider === 'wallet') {
      const { walletService } = await import('@/services/wallet.js')
      const wallet = await walletService.getWalletByUserId(user.id)

      if (!wallet || wallet.balanceCents < finalAmountCents) {
        return {
          success: false,
          message: 'Insufficient wallet balance'
        }
      }

      // Process wallet payment
      const transaction = await walletService.debit(
        wallet.id,
        finalAmountCents,
        'subscription_payment',
        input.subscriptionId?.toString()
      )

      // Create subscription
      if (input.planId) {
        const { subscriptionService } = await import('@/services/subscription.js')
        await subscriptionService.createSubscription(user, {
          planId: input.planId,
          autoRenew: true
        })
      }

      return {
        success: true,
        message: 'Payment completed successfully'
      }
    }

    // Create payment log
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 30) // 30 minutes expiry

    const [payment] = await db
      .insert(paymentLogs)
      .values({
        userId: user.id,
        provider: input.provider,
        amountCents: finalAmountCents,
        currency: input.currency || 'USD',
        status: 'pending',
        subscriptionId: input.subscriptionId,
        expiredAt,
        metadata: JSON.stringify({
          planId: input.planId,
          createdBy: 'telegram_bot'
        }),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()

    // Process based on provider
    switch (input.provider) {
      case 'cryptopay':
        return await createCryptoPayPayment(payment)

      case 'nowpayments':
        return await createNOWPaymentsPayment(payment)

      case 'stripe':
        return await createStripePayment(payment)

      default:
        return {
          success: false,
          message: 'Unsupported payment provider'
        }
    }
  } catch (error) {
    console.error('Create payment error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create payment'
    }
  }
}

// ============================================================================
// Provider-Specific Payment Creation
// ============================================================================

async function createCryptoPayPayment(payment: any): Promise<PaymentResponse> {
  const { CRYPTOPAY_API_KEY } = process.env

  if (!CRYPTOPAY_API_KEY) {
    return {
      success: false,
      message: 'CryptoPay not configured'
    }
  }

  // Create CryptoPay invoice
  const response = await fetch('https://pay.crypt.bot/api/createInvoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Crypto-Pay-API-Key': CRYPTOPAY_API_KEY
    },
    body: JSON.stringify({
      asset: 'USDT',
      amount: (payment.amountCents / 100).toFixed(2),
      description: `VPN Subscription - Payment #${payment.id}`,
      paid_btn_name: 'Return to bot',
      paid_btn_url: `https://t.me/${process.env.TELEGRAM_BOT_TOKEN?.split(':')[0]}?start=payment_confirm_${payment.id}`,
      payload: `payment_${payment.id}`,
      allow_comments: false,
      allow_anonymous: false
    })
  })

  const data = await response.json()

  if (data.ok) {
    // Update payment log with invoice details
    await db
      .update(paymentLogs)
      .set({
        providerInvoiceId: data.result.invoice_id.toString(),
        cryptoAddress: data.result.pay_address,
        cryptoAmount: data.result.amount,
        cryptoCurrency: 'USDT',
        status: 'pending',
        metadata: JSON.stringify({
          ...JSON.parse(payment.metadata || '{}'),
          invoice_id: data.result.invoice_id,
          pay_address: data.result.pay_address
        })
      })
      .where(eq(paymentLogs.id, payment.id))

    return {
      success: true,
      payment,
      paymentUrl: data.result.bot_invoice_url,
      cryptoAddress: data.result.pay_address,
      cryptoAmount: data.result.amount,
      message: 'Payment created successfully'
    }
  }

  return {
    success: false,
    message: 'Failed to create CryptoPay invoice'
  }
}

async function createNOWPaymentsPayment(payment: any): Promise<PaymentResponse> {
  const { NOWPAYMENTS_API_KEY } = process.env

  if (!NOWPAYMENTS_API_KEY) {
    return {
      success: false,
      message: 'NOWPayments not configured'
    }
  }

  // Create NOWPayments invoice
  const response = await fetch('https://api.nowpayments.com/v1/invoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': NOWPAYMENTS_API_KEY
    },
    body: JSON.stringify({
      price_amount: (payment.amountCents / 100).toFixed(2),
      price_currency: 'usd',
      order_id: `payment_${payment.id}`,
      order_description: `VPN Subscription - Payment #${payment.id}`,
      ipn_callback_url: `${process.env.APP_URL}/webhooks/payment/nowpayments`,
      success_url: `https://t.me/${process.env.TELEGRAM_BOT_TOKEN?.split(':')[0]}?start=payment_confirm_${payment.id}`
    })
  })

  const data = await response.json()

  if (data.id) {
    // Update payment log
    await db
      .update(paymentLogs)
      .set({
        providerInvoiceId: data.id.toString(),
        status: 'pending',
        metadata: JSON.stringify({
          ...JSON.parse(payment.metadata || '{}'),
          invoice_id: data.id
        })
      })
      .where(eq(paymentLogs.id, payment.id))

    return {
      success: true,
      payment,
      paymentUrl: data.invoice_url,
      message: 'Payment created successfully'
    }
  }

  return {
    success: false,
    message: 'Failed to create NOWPayments invoice'
  }
}

async function createStripePayment(payment: any): Promise<PaymentResponse> {
  const { STRIPE_SECRET_KEY } = process.env

  if (!STRIPE_SECRET_KEY) {
    return {
      success: false,
      message: 'Stripe not configured'
    }
  }

  // Create Stripe Payment Intent
  const stripe = await import('stripe')
  const stripeInstance = stripe.default(STRIPE_SECRET_KEY)

  const paymentIntent = await stripeInstance.paymentIntents.create({
    amount: payment.amountCents,
    currency: payment.currency || 'usd',
    metadata: {
      payment_id: payment.id.toString(),
      user_id: payment.userId.toString()
    }
  })

  // Update payment log
  await db
    .update(paymentLogs)
    .set({
      providerInvoiceId: paymentIntent.id,
      status: 'pending',
      metadata: JSON.stringify({
        ...JSON.parse(payment.metadata || '{}'),
        payment_intent_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret
      })
    })
    .where(eq(paymentLogs.id, payment.id))

  return {
    success: true,
    payment,
    message: 'Payment created successfully'
  }
}

// ============================================================================
// Confirm Payment (Webhook Handler)
// ============================================================================

export async function confirmPayment(
  provider: string,
  providerInvoiceId: string,
  status: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { db } = await import('@/db/index.js')
    const { paymentLogs } = await import('@/db/schema/index.js')
    const { eq } = await import('drizzle-orm')

    // Find payment by provider invoice ID
    const [payment] = await db
      .select()
      .from(paymentLogs)
      .where(
        and(
          eq(paymentLogs.providerInvoiceId, providerInvoiceId),
          eq(paymentLogs.provider, provider as any)
        )
      )
      .limit(1)

    if (!payment) {
      return {
        success: false,
        message: 'Payment not found'
      }
    }

    // Update payment status
    const [updated] = await db
      .update(paymentLogs)
      .set({
        status: status as any,
        confirmedAt: status === 'completed' ? new Date() : null,
        updatedAt: new Date()
      })
      .where(eq(paymentLogs.id, payment.id))
      .returning()

    // If payment completed, activate subscription
    if (status === 'completed' && payment.subscriptionId) {
      const { subscriptionService } = await import('@/services/subscription.js')
      // Subscription should be created/activated
      // This is handled separately
    }

    return {
      success: true,
      message: 'Payment confirmed successfully'
    }
  } catch (error) {
    console.error('Confirm payment error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to confirm payment'
    }
  }
}

// ============================================================================
// Check Pending Payments
// ============================================================================

export async function checkPendingPayments() {
  const { paymentQueries } = await import('@/db/queries.js')
  const pendingPayments = await paymentQueries.getPending()

  const results = []

  for (const payment of pendingPayments) {
    try {
      let status = 'pending'

      // Check with provider
      if (payment.provider === 'cryptopay') {
        status = await checkCryptoPayPayment(payment)
      } else if (payment.provider === 'nowpayments') {
        status = await checkNOWPaymentsPayment(payment)
      } else if (payment.provider === 'stripe') {
        status = await checkStripePayment(payment)
      }

      if (status !== payment.status) {
        await confirmPayment(payment.provider, payment.providerInvoiceId || '', status)
        results.push({ payment, oldStatus: payment.status, newStatus: status })
      }
    } catch (error) {
      console.error(`Error checking payment ${payment.id}:`, error)
    }
  }

  return results
}

// ============================================================================
// Payment Status Check (per provider)
// ============================================================================

async function checkCryptoPayPayment(payment: any): Promise<string> {
  const { CRYPTOPAY_API_KEY } = process.env

  const response = await fetch(`https://pay.crypt.bot/api/getInvoices/${payment.providerInvoiceId}`, {
    headers: {
      'Crypto-Pay-API-Key': CRYPTOPAY_API_KEY
    }
  })

  const data = await response.json()

  if (data.ok && data.result && data.result.length > 0) {
    const invoice = data.result[0]

    if (invoice.status === 'paid') {
      return 'completed'
    } else if (invoice.status === 'expired') {
      return 'expired'
    }
  }

  return 'pending'
}

async function checkNOWPaymentsPayment(payment: any): Promise<string> {
  const { NOWPAYMENTS_API_KEY } = process.env

  const response = await fetch(`https://api.nowpayments.com/v1/payment/${payment.providerInvoiceId}`, {
    headers: {
      'x-api-key': NOWPAYMENTS_API_KEY
    }
  })

  const data = await response.json()

  if (data.payment_status === 'finished' || data.payment_status === 'confirmed') {
    return 'completed'
  } else if (data.payment_status === 'expired') {
    return 'expired'
  }

  return 'pending'
}

async function checkStripePayment(payment: any): Promise<string> {
  const { STRIPE_SECRET_KEY } = process.env
  const stripe = await import('stripe')
  const stripeInstance = stripe.default(STRIPE_SECRET_KEY)

  const paymentIntent = await stripeInstance.paymentIntents.retrieve(payment.providerInvoiceId)

  if (paymentIntent.status === 'succeeded') {
    return 'completed'
  }

  return 'pending'
}

// ============================================================================
// Helpers
// ============================================================================

async function getPlanById(planId: number) {
  const { planQueries } = await import('@/db/queries.js')
  return await planQueries.findById(planId)
}

export async function createTelegramPayment(user: any, input: CreatePaymentInput): Promise<PaymentResponse> {
  return await createPayment(user, input)
}

// Export webhook handlers
export const paymentWebhookHandlers = new Map<string, (request: Request, body: any) => Promise<any>>()

// CryptoPay webhook handler
paymentWebhookHandlers.set('cryptopay', async (request: Request, body: any) => {
  const invoice_id = body.invoice_id

  // Find payment
  const { db } = await import('@/db/index.js')
  const { paymentLogs } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [payment] = await db
    .select()
    .from(paymentLogs)
    .where(eq(paymentLogs.providerInvoiceId, invoice_id))
    .limit(1)

  if (!payment) {
    return { success: false, message: 'Payment not found' }
  }

  // Update payment status
  let status = 'pending'
  if (body.status === 'paid') {
    status = 'completed'
  } else if (body.status === 'expired') {
    status = 'expired'
  }

  await confirmPayment('cryptopay', invoice_id, status)

  return { success: true, status }
})

// NOWPayments webhook handler
paymentWebhookHandlers.set('nowpayments', async (request: Request, body: any) => {
  const payment_id = body.payment_id

  // Find payment
  const { db } = await import('@/db/index.js')
  const { paymentLogs } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [payment] = await db
    .select()
    .from(paymentLogs)
    .where(eq(paymentLogs.providerInvoiceId, payment_id))
    .limit(1)

  if (!payment) {
    return { success: false, message: 'Payment not found' }
  }

  // Update payment status
  let status = 'pending'
  if (body.payment_status === 'finished' || body.payment_status === 'confirmed') {
    status = 'completed'
  } else if (body.payment_status === 'expired') {
    status = 'expired'
  }

  await confirmPayment('nowpayments', payment_id, status)

  return { success: true, status }
})

// Stripe webhook handler
paymentWebhookHandlers.set('stripe', async (request: Request, body: any) => {
  const sig = request.headers.get('stripe-signature')
  if (!sig) {
    throw new Error('No signature')
  }

  const { STRIPE_WEBHOOK_SECRET } = process.env
  const stripe = await import('stripe')
  const stripeInstance = stripe.default(STRIPE_SECRET_KEY)

  const event = stripeInstance.webhooks.constructEvent(
    await request.text(),
    sig,
    STRIPE_WEBHOOK_SECRET
  )

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as any
    const payment_id = paymentIntent.id

    await confirmPayment('stripe', payment_id, 'completed')

    return { success: true, status: 'completed' }
  }

  return { success: true, status: 'pending' }
})
