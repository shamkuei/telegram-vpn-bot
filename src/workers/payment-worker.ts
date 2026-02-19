import { Worker, Job } from 'bullmq'
import { paymentQueue, type PaymentJobData } from './index.js'

// ============================================================================
// Payment Worker
// ============================================================================

export const paymentWorker = new Worker<PaymentJobData>(
  'payments',
  async (job: Job<PaymentJobData>) => {
    const { data } = job

    console.log(`[PaymentWorker] Processing job:`, job.id, data.type)

    switch (data.type) {
      case 'check':
        await handleCheckPayment(job)
        break

      case 'confirm':
        await handleConfirmPayment(job)
        break

      case 'expire':
        await handleExpirePayment(job)
        break

      case 'refund':
        await handleRefundPayment(job)
        break

      default:
        throw new Error(`Unknown payment job type: ${data.type}`)
    }

    return { success: true }
  },
  {
    connection: await getRedisConnection(),
    concurrency: process.env.CONCURRENCY_PAYMENT_WORKER
      ? parseInt(process.env.CONCURRENCY_PAYMENT_WORKER)
      : 5
  }
)

// ============================================================================
// Payment Job Handlers
// ============================================================================

async function handleCheckPayment(job: Job<PaymentJobData>) {
  const { paymentId, provider, providerInvoiceId } = job.data

  const { checkPendingPayments } = await import('@/services/payment/index.js')
  const results = await checkPendingPayments()

  const paymentResult = results.find(r => r.payment.id === paymentId)

  if (paymentResult) {
    await job.updateProgress({ status: paymentResult.newStatus })

    if (paymentResult.newStatus === 'completed') {
      // Trigger post-payment actions
      await handlePostPaymentActions(paymentResult.payment)
    }
  }
}

async function handleConfirmPayment(job: Job<PaymentJobData>) {
  const { paymentId, provider, providerInvoiceId, status } = job.data

  await job.updateProgress({ status: 'confirming' })

  const { confirmPayment } = await import('@/services/payment/index.js')
  const result = await confirmPayment(provider, providerInvoiceId, status)

  if (result.success) {
    await job.updateProgress({ status: 'confirmed' })

    // Get payment details and trigger post-payment
    const { paymentQueries } = await import('@/db/queries.js')
    const payment = await paymentQueries.findById(paymentId)

    if (payment && status === 'completed') {
      await handlePostPaymentActions(payment)
    }
  }

  return result
}

async function handleExpirePayment(job: Job<PaymentJobData>) {
  const { paymentId } = job.data

  const { paymentQueries } = await import('@/db/queries.js')
  const payment = await paymentQueries.findById(paymentId)

  if (!payment) {
    return
  }

  // Update payment status to expired
  const { db } = await import('@/db/index.js')
  const { paymentLogs } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  await db
    .update(paymentLogs)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(eq(paymentLogs.id, paymentId))

  // Notify user about expired payment
  if (payment.userId) {
    await addNotificationJob({
      type: 'telegram',
      userId: payment.userId,
      title: 'Payment Expired',
      message: `Your payment of $${(payment.amountCents / 100).toFixed(2)} has expired. Please try again.`,
      parseMode: 'HTML'
    })
  }

  await job.updateProgress({ status: 'expired' })
}

async function handleRefundPayment(job: Job<PaymentJobData>) {
  const { paymentId } = job.data

  const { paymentQueries } = await import('@/db/queries.js')
  const payment = await paymentQueries.findById(paymentId)

  if (!payment) {
    return
  }

  // Update payment status
  const { db } = await import('@/db/index.js')
  const { paymentLogs, subscriptions } = await import('@/db/schema/index.js')
  const { eq, and } = await import('drizzle-orm')

  await db
    .update(paymentLogs)
    .set({ status: 'refunded', updatedAt: new Date() })
    .where(eq(paymentLogs.id, paymentId))

  // If subscription exists, deactivate it
  if (payment.subscriptionId) {
    await db
      .update(subscriptions)
      .set({ status: 'cancelled' })
      .where(eq(subscriptions.id, payment.subscriptionId))
  }

  // Refund to wallet if paid from wallet
  if (payment.provider === 'wallet') {
    const { credit } = await import('@/services/wallet.js')
    await credit(payment.userId, payment.amountCents, 'refund', paymentId.toString(), 'Payment refunded')
  }

  await job.updateProgress({ status: 'refunded' })
}

// ============================================================================
// Post-Payment Actions
// ============================================================================

async function handlePostPaymentActions(payment: any) {
  if (payment.metadata) {
    const metadata = JSON.parse(payment.metadata)

    if (metadata.planId && payment.status === 'completed') {
      // Create subscription if plan-based payment
      const { subscriptionService } = await import('@/services/subscription.js')

      const { userQueries } = await import('@/db/queries.js')
      const user = await userQueries.findById(payment.userId)

      if (user) {
        await subscriptionService.createSubscription(user, {
          planId: metadata.planId,
          autoRenew: true
        })
      }
    }
  }

  // Send success notification
  await addNotificationJob({
    type: 'telegram',
    userId: payment.userId,
    title: 'Payment Successful',
    message: `Your payment of $${(payment.amountCents / 100).toFixed(2)} has been confirmed!\n\nYour subscription will be activated shortly.`,
    parseMode: 'HTML'
  })
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getRedisConnection() {
  const { redis } = await import('@/cache/index.js')
  return redis
}

async function addNotificationJob(data: any) {
  const { addNotificationJob } = await import('./index.js')
  await addNotificationJob(data)
}
