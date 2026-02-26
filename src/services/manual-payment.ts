import { db, withTransaction } from '@/db/index'
import { manualPayments, subscriptions, vpnAccounts, users, plans } from '@/db/schema/index'
import { eq, and, sql } from 'drizzle-orm'
import { marzban } from '@/marzban/index'
import { manualPaymentQueries } from '@/db/queries'
import type { NewManualPayment, ManualPayment, Plan, User } from '@/db/schema/index'
import { CacheInvalidation } from '@/cache/index'

// ============================================================================
// Manual Payment Service
// ============================================================================

export interface CreateManualPaymentInput {
  userId: number
  planId: number
  amountCents: number
  currency?: string
  ipAddress?: string
  userNote?: string
}

export interface ManualPaymentResponse {
  success: boolean
  payment?: ManualPayment
  plan?: Plan
  message: string
  paymentInstructions?: PaymentInstructions
}

export interface PaymentInstructions {
  cardNumber: string
  cardHolder: string
  amount: string
  currency: string
  reference?: string
  note?: string
}

export interface VerifyPaymentInput {
  paymentId: number
  adminId: number
  approved: boolean
  adminNote?: string
  rejectionReason?: string
}

export interface VerifyPaymentResponse {
  success: boolean
  payment?: ManualPayment
  subscription?: any
  message: string
  userNotified: boolean
}

// ============================================================================
// Payment Configuration (from environment or config)
// ============================================================================

export const PAYMENT_CONFIG = {
  cardNumber: process.env.ADMIN_CARD_NUMBER || '',
  cardHolder: process.env.ADMIN_CARD_HOLDER || 'Admin',
  paymentExpiryHours: parseInt(process.env.MANUAL_PAYMENT_EXPIRY_HOURS || '24'),
  maxScreenshotSizeMB: parseInt(process.env.MAX_SCREENSHOT_SIZE_MB || '10'),
  allowedScreenshotTypes: ['image/jpeg', 'image/png', 'image/webp']
}

// ============================================================================
// Create Manual Payment
// ============================================================================

export async function createManualPayment(
  input: CreateManualPaymentInput
): Promise<ManualPaymentResponse> {
  try {
    // Get plan details
    const plan = await getPlanById(input.planId)
    if (!plan) {
      return {
        success: false,
        message: 'Plan not found'
      }
    }

    // Check if plan is active
    if (!plan.isActive) {
      return {
        success: false,
        message: 'This plan is currently not available'
      }
    }

    // Calculate expiry
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + PAYMENT_CONFIG.paymentExpiryHours)

    // Create manual payment record
    const paymentData: NewManualPayment = {
      userId: input.userId,
      planId: input.planId,
      amountCents: input.amountCents,
      currency: input.currency || 'USD',
      status: 'awaiting_screenshot',
      screenshotFileUniqueId: crypto.randomUUID(),
      ipAddress: input.ipAddress,
      userNote: input.userNote,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const [payment] = await db.insert(manualPayments).values(paymentData).returning()

    // Generate payment instructions
    const paymentInstructions: PaymentInstructions = {
      cardNumber: PAYMENT_CONFIG.cardNumber,
      cardHolder: PAYMENT_CONFIG.cardHolder,
      amount: (input.amountCents / 100).toFixed(2),
      currency: input.currency || 'USD',
      reference: `MP-${payment.id}`
    }

    return {
      success: true,
      payment,
      plan,
      message: 'Payment request created. Please send the payment screenshot.',
      paymentInstructions
    }
  } catch (error) {
    console.error('Create manual payment error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create payment request'
    }
  }
}

// ============================================================================
// Attach Screenshot to Payment
// ============================================================================

export async function attachPaymentScreenshot(
  paymentId: number,
  fileId: string,
  fileUniqueId: string,
  filePath: string,
  mimeType: string,
  fileSize: number
): Promise<{ success: boolean; payment?: ManualPayment; message: string }> {
  try {
    // Validate file type
    if (!PAYMENT_CONFIG.allowedScreenshotTypes.includes(mimeType)) {
      return {
        success: false,
        message: `Invalid file type. Allowed types: ${PAYMENT_CONFIG.allowedScreenshotTypes.join(', ')}`
      }
    }

    // Validate file size
    const maxSizeBytes = PAYMENT_CONFIG.maxScreenshotSizeMB * 1024 * 1024
    if (fileSize > maxSizeBytes) {
      return {
        success: false,
        message: `File too large. Maximum size: ${PAYMENT_CONFIG.maxScreenshotSizeMB}MB`
      }
    }

    // Get payment
    const payment = await manualPaymentQueries.findById(paymentId)
    if (!payment) {
      return {
        success: false,
        message: 'Payment not found'
      }
    }

    // Check if payment is in correct state
    if (payment.status !== 'awaiting_screenshot' && payment.status !== 'pending') {
      return {
        success: false,
        message: `Cannot attach screenshot to payment with status: ${payment.status}`
      }
    }

    // Check if payment has expired
    if (payment.expiresAt && new Date() > payment.expiresAt) {
      await manualPaymentQueries.markAsExpired(paymentId)
      return {
        success: false,
        message: 'Payment has expired. Please create a new payment request.'
      }
    }

    // Attach screenshot
    const updated = await manualPaymentQueries.attachScreenshot(
      paymentId,
      fileId,
      fileUniqueId,
      filePath,
      mimeType,
      fileSize
    )

    if (!updated) {
      return {
        success: false,
        message: 'Failed to attach screenshot'
      }
    }

    return {
      success: true,
      payment: updated,
      message: 'Screenshot received. Your payment is pending verification.'
    }
  } catch (error) {
    console.error('Attach screenshot error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to attach screenshot'
    }
  }
}

// ============================================================================
// Verify/Approve/Reject Payment (Admin)
// ============================================================================

export async function verifyPayment(
  input: VerifyPaymentInput
): Promise<VerifyPaymentResponse> {
  return await withTransaction(async (tx) => {
    try {
      // Get payment with user and plan details
      const paymentData = await tx
        .select({
          payment: manualPayments,
          user: users,
          plan: plans
        })
        .from(manualPayments)
        .innerJoin(users, eq(manualPayments.userId, users.id))
        .innerJoin(plans, eq(manualPayments.planId, plans.id))
        .where(eq(manualPayments.id, input.paymentId))
        .limit(1)

      if (!paymentData || paymentData.length === 0) {
        return {
          success: false,
          message: 'Payment not found'
        }
      }

      const { payment, user, plan } = paymentData[0]

      // Check if payment is in pending state
      if (payment.status !== 'pending') {
        return {
          success: false,
          message: `Payment is not in pending state. Current status: ${payment.status}`
        }
      }

      // Check if payment already has a subscription (was already approved)
      if (payment.subscriptionId) {
        return {
          success: false,
          message: 'Payment has already been processed'
        }
      }

      if (input.approved) {
        // APPROVE PAYMENT - Create subscription
        const subscriptionResult = await createSubscriptionForPayment(tx, user, plan, payment, input.adminId)

        if (!subscriptionResult.success) {
          throw new Error(subscriptionResult.message)
        }

        // Update payment status
        const [updatedPayment] = await tx
          .update(manualPayments)
          .set({
            status: 'approved',
            verifiedBy: input.adminId,
            verifiedAt: new Date(),
            adminNote: input.adminNote,
            subscriptionId: subscriptionResult.subscriptionId,
            updatedAt: new Date()
          })
          .where(eq(manualPayments.id, input.paymentId))
          .returning()

        // Invalidate cache
        await CacheInvalidation.invalidateUser(user.id, user.telegramId)

        return {
          success: true,
          payment: updatedPayment,
          subscription: subscriptionResult.subscription,
          message: 'Payment approved and subscription created successfully',
          userNotified: true
        }
      } else {
        // REJECT PAYMENT
        const [updatedPayment] = await tx
          .update(manualPayments)
          .set({
            status: 'rejected',
            verifiedBy: input.adminId,
            verifiedAt: new Date(),
            adminNote: input.adminNote,
            rejectionReason: input.rejectionReason,
            updatedAt: new Date()
          })
          .where(eq(manualPayments.id, input.paymentId))
          .returning()

        return {
          success: true,
          payment: updatedPayment,
          message: 'Payment rejected',
          userNotified: true
        }
      }
    } catch (error) {
      console.error('Verify payment error:', error)
      throw error
    }
  })
}

// ============================================================================
// Helper: Create Subscription for Approved Payment
// ============================================================================

async function createSubscriptionForPayment(
  tx: any,
  user: User,
  plan: Plan,
  payment: ManualPayment,
  adminId: number
): Promise<{ success: boolean; subscription?: any; subscriptionId?: number; message: string }> {
  try {
    // Select best server
    const server = await selectBestServer()
    if (!server) {
      return {
        success: false,
        message: 'No available servers'
      }
    }

    // Calculate expiration
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + plan.durationDays)

    // Create subscription
    const [subscription] = await tx
      .insert(subscriptions)
      .values({
        userId: user.id,
        planId: plan.id,
        serverId: server.id,
        status: 'active',
        startedAt: new Date(),
        expiresAt,
        autoRenew: true,
        dataLimitGb: plan.dataLimitGb ? (plan.dataLimitGb * 1_000_000_000).toString() : null,
        usedDataGb: 0,
        deviceLimit: plan.deviceLimit,
        pricePaidCents: payment.amountCents,
        currency: payment.currency || 'USD',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning()

    // Generate Marzban username
    const marzbanUsername = `user_${user.telegramId}_${Date.now()}`

    // Create Marzban user
    const marzbanUser = await marzban.createUser({
      username: marzbanUsername,
      status: 'active',
      expire: Math.floor(expiresAt.getTime() / 1000),
      data_limit: plan.dataLimitGb ? plan.dataLimitGb * 1_000_000_000 : 0,
      data_limit_reset_strategy: 'no_reset',
      proxies: getProxiesForServer(server),
      inbounds: getInboundsForServer(server)
    })

    // Create VPN account
    await tx.insert(vpnAccounts).values({
      userId: user.id,
      serverId: server.id,
      accountName: `${plan.name} - ${server.city}`,
      accountKey: crypto.randomUUID(),
      marzbanUsername: marzbanUser.username,
      marzbanToken: crypto.randomUUID(),
      marzbanSubscriptionUrl: marzbanUser.subscription_url,
      status: 'active',
      dataLimitBytes: plan.dataLimitGb ? plan.dataLimitGb * 1_000_000_000 : null,
      usedDataBytes: 0,
      expiresAt,
      subscriptionId: subscription.id,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    // Update user with Marzban username
    await tx
      .update(users)
      .set({
        marzbanUsername,
        updatedAt: new Date()
      })
      .where(eq(users.id, user.id))

    return {
      success: true,
      subscription,
      subscriptionId: subscription.id,
      message: 'Subscription created successfully'
    }
  } catch (error) {
    console.error('Create subscription for payment error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create subscription'
    }
  }
}

// ============================================================================
// Get User Manual Payments
// ============================================================================

export async function getUserManualPayments(userId: number): Promise<ManualPayment[]> {
  return await manualPaymentQueries.getByUserId(userId)
}

// ============================================================================
// Get Payment by ID
// ============================================================================

export async function getManualPaymentById(paymentId: number): Promise<ManualPayment | null> {
  return await manualPaymentQueries.findById(paymentId)
}

// ============================================================================
// Get Pending Payments (for Admin)
// ============================================================================

export async function getPendingManualPayments(
  limit: number = 50,
  offset: number = 0
): Promise<Array<{ payment: ManualPayment; user: User; plan: Plan }>> {
  return await manualPaymentQueries.getPending(limit, offset)
}

// ============================================================================
// Get Pending Payment Count
// ============================================================================

export async function getPendingPaymentCount(): Promise<number> {
  return await manualPaymentQueries.getPendingCount()
}

// ============================================================================
// Set Payment Reference (User adds transaction ID)
// ============================================================================

export async function setPaymentReference(
  paymentId: number,
  reference: string
): Promise<{ success: boolean; message: string }> {
  try {
    const payment = await manualPaymentQueries.findById(paymentId)
    if (!payment) {
      return {
        success: false,
        message: 'Payment not found'
      }
    }

    if (payment.status !== 'awaiting_screenshot' && payment.status !== 'pending') {
      return {
        success: false,
        message: `Cannot update payment with status: ${payment.status}`
      }
    }

    await manualPaymentQueries.setPaymentReference(paymentId, reference)

    return {
      success: true,
      message: 'Payment reference updated'
    }
  } catch (error) {
    console.error('Set payment reference error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update payment reference'
    }
  }
}

// ============================================================================
// Cancel/Expire Payment
// ============================================================================

export async function cancelManualPayment(
  paymentId: number
): Promise<{ success: boolean; message: string }> {
  try {
    const updated = await manualPaymentQueries.markAsExpired(paymentId)
    if (!updated) {
      return {
        success: false,
        message: 'Payment not found'
      }
    }

    return {
      success: true,
      message: 'Payment cancelled'
    }
  } catch (error) {
    console.error('Cancel payment error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to cancel payment'
    }
  }
}

// ============================================================================
// Check and Expire Pending Payments
// ============================================================================

export async function checkExpiredPayments(): Promise<ManualPayment[]> {
  try {
    const expiredPayments = await manualPaymentQueries.getExpiredPending()
    const expired: ManualPayment[] = []

    for (const payment of expiredPayments) {
      const updated = await manualPaymentQueries.markAsExpired(payment.id)
      if (updated) {
        expired.push(updated)
      }
    }

    return expired
  } catch (error) {
    console.error('Check expired payments error:', error)
    return []
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getPlanById(planId: number): Promise<Plan | null> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
  return plan || null
}

async function selectBestServer() {
  const [server] = await db
    .select()
    .from(servers)
    .where(
      and(
        eq(servers.status, 'active'),
        eq(servers.isPublic, true),
        sql`${servers.currentUsers} < ${servers.maxUsers}`
      )
    )
    .orderBy((servers) => servers.loadPercentage)
    .limit(1)

  return server || null
}

function getProxiesForServer(server: any) {
  return {
    vmess: {},
    vless: {}
  }
}

function getInboundsForServer(server: any) {
  return {
    vmess: server.marzbanNodeName ? [server.marzbanNodeName] : [],
    vless: server.marzbanNodeName ? [server.marzbanNodeName] : []
  }
}

// ============================================================================
// Export Service Object
// ============================================================================

export const manualPaymentService = {
  createManualPayment,
  attachPaymentScreenshot,
  verifyPayment,
  getUserManualPayments,
  getManualPaymentById,
  getPendingManualPayments,
  getPendingPaymentCount,
  setPaymentReference,
  cancelManualPayment,
  checkExpiredPayments
}
