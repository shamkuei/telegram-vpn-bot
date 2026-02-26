import { Hono } from 'hono'
import type { AppType } from '@/index'

export const paymentRoutes = new Hono<AppType>()

// ============================================================================
// Manual Payment API Routes
// ============================================================================

// Create manual payment request
paymentRoutes.post('/', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const body = await c.req.json()
  const { planId } = body

  if (!planId) {
    return c.json({ error: 'planId is required' }, 400)
  }

  const { planQueries } = await import('@/db/queries.js')
  const plan = await planQueries.findById(planId)

  if (!plan) {
    return c.json({ error: 'Plan not found' }, 404)
  }

  // Create manual payment
  const { manualPaymentService } = await import('@/services/manual-payment.js')
  const result = await manualPaymentService.createManualPayment({
    userId: user.id,
    planId,
    amountCents: plan.priceUsdCents,
    currency: 'USD',
    ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || undefined
  })

  if (!result.success || !result.payment) {
    return c.json({ error: result.message }, 400)
  }

  return c.json({
    success: true,
    payment: result.payment,
    plan: result.plan,
    paymentInstructions: result.paymentInstructions
  })
})

// Get manual payment by ID
paymentRoutes.get('/:id', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const id = parseInt(c.req.param('id'))
  const { manualPaymentQueries } = await import('@/db/queries.js')
  const payment = await manualPaymentQueries.findById(id)

  if (!payment || payment.userId !== user.id) {
    return c.json({ error: 'Payment not found' }, 404)
  }

  // Get plan details
  const { planQueries } = await import('@/db/queries.js')
  const plan = await planQueries.findById(payment.planId)

  return c.json({
    payment,
    plan
  })
})

// Get user's manual payment history
paymentRoutes.get('/', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const { manualPaymentService } = await import('@/services/manual-payment.js')
  const payments = await manualPaymentService.getUserManualPayments(user.id)

  return c.json({ payments })
})

// Check payment status (for polling)
paymentRoutes.get('/:id/status', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const id = parseInt(c.req.param('id'))
  const { manualPaymentQueries } = await import('@/db/queries.js')
  const payment = await manualPaymentQueries.findById(id)

  if (!payment || payment.userId !== user.id) {
    return c.json({ error: 'Payment not found' }, 404)
  }

  return c.json({
    status: payment.status,
    screenshotReceived: !!payment.screenshotFileId,
    verifiedAt: payment.verifiedAt,
    expiresAt: payment.expiresAt,
    subscriptionId: payment.subscriptionId
  })
})

// Set payment reference (transaction ID)
paymentRoutes.post('/:id/reference', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { reference } = body

  if (!reference) {
    return c.json({ error: 'reference is required' }, 400)
  }

  const { manualPaymentQueries } = await import('@/db/queries.js')
  const payment = await manualPaymentQueries.findById(id)

  if (!payment || payment.userId !== user.id) {
    return c.json({ error: 'Payment not found' }, 404)
  }

  // Check if payment can be updated
  if (payment.status !== 'awaiting_screenshot' && payment.status !== 'pending') {
    return c.json({ error: `Cannot update payment with status: ${payment.status}` }, 400)
  }

  const { manualPaymentService } = await import('@/services/manual-payment.js')
  const result = await manualPaymentService.setPaymentReference(id, reference)

  if (!result.success) {
    return c.json({ error: result.message }, 400)
  }

  return c.json({ success: true })
})

// Cancel payment
paymentRoutes.post('/:id/cancel', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const id = parseInt(c.req.param('id'))
  const { manualPaymentQueries } = await import('@/db/queries.js')
  const payment = await manualPaymentQueries.findById(id)

  if (!payment || payment.userId !== user.id) {
    return c.json({ error: 'Payment not found' }, 404)
  }

  const { manualPaymentService } = await import('@/services/manual-payment.js')
  const result = await manualPaymentService.cancelManualPayment(id)

  if (!result.success) {
    return c.json({ error: result.message }, 400)
  }

  return c.json({ success: true })
})

// ============================================================================
// Admin Payment Verification Routes
// ============================================================================

// Get pending payments (admin only)
paymentRoutes.get('/admin/pending', async (c) => {
  const isAdmin = c.get('isAdmin')
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403)
  }

  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  const { manualPaymentService } = await import('@/services/manual-payment.js')
  const payments = await manualPaymentService.getPendingManualPayments(limit, offset)

  return c.json({ payments })
})

// Get pending payment count (admin only)
paymentRoutes.get('/admin/pending/count', async (c) => {
  const isAdmin = c.get('isAdmin')
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403)
  }

  const { manualPaymentService } = await import('@/services/manual-payment.js')
  const count = await manualPaymentService.getPendingPaymentCount()

  return c.json({ count })
})

// Verify payment (approve/reject) - admin only
paymentRoutes.post('/admin/:id/verify', async (c) => {
  const isAdmin = c.get('isAdmin')
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403)
  }

  const adminUser = c.get('user')
  if (!adminUser) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { approved, adminNote, rejectionReason } = body

  if (typeof approved !== 'boolean') {
    return c.json({ error: 'approved (boolean) is required' }, 400)
  }

  const { manualPaymentService } = await import('@/services/manual-payment.js')
  const result = await manualPaymentService.verifyPayment({
    paymentId: id,
    adminId: adminUser.id,
    approved,
    adminNote,
    rejectionReason
  })

  if (!result.success) {
    return c.json({ error: result.message }, 400)
  }

  return c.json({
    success: true,
    payment: result.payment,
    subscription: result.subscription
  })
})

// Get payment by ID (admin only - can view any payment)
paymentRoutes.get('/admin/:id', async (c) => {
  const isAdmin = c.get('isAdmin')
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403)
  }

  const id = parseInt(c.req.param('id'))
  const { manualPaymentQueries } = await import('@/db/queries.js')
  const payments = await manualPaymentQueries.getPending(1000, 0)

  const paymentData = payments.find(p => p.payment.id === id)

  if (!paymentData) {
    return c.json({ error: 'Payment not found' }, 404)
  }

  return c.json(paymentData)
})
