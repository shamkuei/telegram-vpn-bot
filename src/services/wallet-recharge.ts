import { db, withTransaction } from '@/db/index'
import { walletRechargeRequests, users, walletTransactions, wallets } from '@/db/schema/index'
import { eq, and, sql, desc } from 'drizzle-orm'
import { credit } from '@/services/wallet'
import { CacheInvalidation } from '@/cache/index'
import type { NewWalletRechargeRequest, WalletRechargeRequest, User } from '@/db/schema/index'

// ============================================================================
// Wallet Recharge Service
// ============================================================================

export interface CreateWalletRechargeInput {
  userId: number
  amountCents: number
  currency?: string
  ipAddress?: string
  userNote?: string
}

export interface WalletRechargeResponse {
  success: boolean
  request?: WalletRechargeRequest
  message: string
  rechargeInstructions?: RechargeInstructions
}

export interface RechargeInstructions {
  cardNumber: string
  cardHolder: string
  amount: string
  currency: string
  reference?: string
  note?: string
}

export interface VerifyRechargeInput {
  requestId: number
  adminId: number
  approved: boolean
  adminNote?: string
  rejectionReason?: string
}

export interface VerifyRechargeResponse {
  success: boolean
  request?: WalletRechargeRequest
  transaction?: any
  message: string
  userNotified: boolean
}

// ============================================================================
// Recharge Configuration (from environment or config)
// ============================================================================

export const RECHARGE_CONFIG = {
  cardNumber: process.env.ADMIN_CARD_NUMBER || '',
  cardHolder: process.env.ADMIN_CARD_HOLDER || 'Admin',
  rechargeExpiryHours: parseInt(process.env.WALLET_RECHARGE_EXPIRY_HOURS || '24'),
  maxScreenshotSizeMB: parseInt(process.env.MAX_SCREENSHOT_SIZE_MB || '10'),
  allowedScreenshotTypes: ['image/jpeg', 'image/png', 'image/webp']
}

// ============================================================================
// Create Wallet Recharge Request
// ============================================================================

export async function createWalletRecharge(
  input: CreateWalletRechargeInput
): Promise<WalletRechargeResponse> {
  try {
    // Validate minimum recharge amount
    const minRechargeCents = parseInt(process.env.MIN_WALLET_RECHARGE_CENTS || '100') // Default $1.00
    if (input.amountCents < minRechargeCents) {
      return {
        success: false,
        message: `Minimum recharge amount is $${(minRechargeCents / 100).toFixed(2)}`
      }
    }

    // Validate maximum recharge amount
    const maxRechargeCents = parseInt(process.env.MAX_WALLET_RECHARGE_CENTS || '100000') // Default $1000.00
    if (input.amountCents > maxRechargeCents) {
      return {
        success: false,
        message: `Maximum recharge amount is $${(maxRechargeCents / 100).toFixed(2)}`
      }
    }

    // Get user to ensure they exist
    const user = await getUserById(input.userId)
    if (!user) {
      return {
        success: false,
        message: 'User not found'
      }
    }

    // Calculate expiry
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + RECHARGE_CONFIG.rechargeExpiryHours)

    // Create recharge request
    const requestData: NewWalletRechargeRequest = {
      userId: input.userId,
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

    const [request] = await db.insert(walletRechargeRequests).values(requestData).returning()

    // Generate recharge instructions
    const rechargeInstructions: RechargeInstructions = {
      cardNumber: RECHARGE_CONFIG.cardNumber,
      cardHolder: RECHARGE_CONFIG.cardHolder,
      amount: (input.amountCents / 100).toFixed(2),
      currency: input.currency || 'USD',
      reference: `WR-${request.id}`
    }

    return {
      success: true,
      request,
      message: 'Recharge request created. Please send the payment screenshot.',
      rechargeInstructions
    }
  } catch (error) {
    console.error('Create wallet recharge error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create recharge request'
    }
  }
}

// ============================================================================
// Attach Screenshot to Recharge Request
// ============================================================================

export async function attachRechargeScreenshot(
  requestId: number,
  fileId: string,
  fileUniqueId: string,
  filePath: string,
  mimeType: string,
  fileSize: number
): Promise<{ success: boolean; request?: WalletRechargeRequest; message: string }> {
  try {
    // Validate file type
    if (!RECHARGE_CONFIG.allowedScreenshotTypes.includes(mimeType)) {
      return {
        success: false,
        message: `Invalid file type. Allowed types: ${RECHARGE_CONFIG.allowedScreenshotTypes.join(', ')}`
      }
    }

    // Validate file size
    const maxSizeBytes = RECHARGE_CONFIG.maxScreenshotSizeMB * 1024 * 1024
    if (fileSize > maxSizeBytes) {
      return {
        success: false,
        message: `File too large. Maximum size: ${RECHARGE_CONFIG.maxScreenshotSizeMB}MB`
      }
    }

    // Get request
    const request = await getRechargeRequestById(requestId)
    if (!request) {
      return {
        success: false,
        message: 'Recharge request not found'
      }
    }

    // Check if request is in correct state
    if (request.status !== 'awaiting_screenshot' && request.status !== 'pending') {
      return {
        success: false,
        message: `Cannot attach screenshot to request with status: ${request.status}`
      }
    }

    // Check if request has expired
    if (request.expiresAt && new Date() > request.expiresAt) {
      await markRechargeAsExpired(requestId)
      return {
        success: false,
        message: 'Recharge request has expired. Please create a new request.'
      }
    }

    // Attach screenshot
    const [updated] = await db
      .update(walletRechargeRequests)
      .set({
        screenshotFileId: fileId,
        screenshotFileUniqueId: fileUniqueId,
        screenshotFilePath: filePath,
        screenshotMimeType: mimeType,
        screenshotFileSizeBytes: fileSize,
        screenshotReceivedAt: new Date(),
        status: 'pending',
        updatedAt: new Date()
      })
      .where(eq(walletRechargeRequests.id, requestId))
      .returning()

    if (!updated) {
      return {
        success: false,
        message: 'Failed to attach screenshot'
      }
    }

    return {
      success: true,
      request: updated,
      message: 'Screenshot received. Your recharge request is pending verification.'
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
// Verify/Approve/Reject Recharge Request (Admin)
// ============================================================================

export async function verifyRecharge(
  input: VerifyRechargeInput
): Promise<VerifyRechargeResponse> {
  return await withTransaction(async (tx) => {
    try {
      // Get request with user details
      const requestData = await tx
        .select({
          request: walletRechargeRequests,
          user: users
        })
        .from(walletRechargeRequests)
        .innerJoin(users, eq(walletRechargeRequests.userId, users.id))
        .where(eq(walletRechargeRequests.id, input.requestId))
        .limit(1)

      if (!requestData || requestData.length === 0) {
        return {
          success: false,
          message: 'Recharge request not found'
        }
      }

      const { request, user } = requestData[0]

      // Check if request is in pending state
      if (request.status !== 'pending') {
        return {
          success: false,
          message: `Request is not in pending state. Current status: ${request.status}`
        }
      }

      // Check if request already has a wallet transaction (was already approved)
      if (request.walletTransactionId) {
        return {
          success: false,
          message: 'Request has already been processed'
        }
      }

      if (input.approved) {
        // APPROVE RECHARGE - Credit wallet
        const transaction = await credit(
          user.id,
          request.amountCents,
          'wallet_recharge',
          request.id.toString(),
          `Wallet recharge - WR-${request.id}`,
          true, // isManual
          input.adminId
        )

        // Update request status
        const [updatedRequest] = await tx
          .update(walletRechargeRequests)
          .set({
            status: 'approved',
            verifiedBy: input.adminId,
            verifiedAt: new Date(),
            adminNote: input.adminNote,
            walletTransactionId: transaction.id,
            updatedAt: new Date()
          })
          .where(eq(walletRechargeRequests.id, input.requestId))
          .returning()

        // Invalidate cache
        await CacheInvalidation.invalidateUser(user.id, user.telegramId)

        return {
          success: true,
          request: updatedRequest,
          transaction,
          message: 'Recharge approved and wallet credited successfully',
          userNotified: true
        }
      } else {
        // REJECT RECHARGE
        const [updatedRequest] = await tx
          .update(walletRechargeRequests)
          .set({
            status: 'rejected',
            verifiedBy: input.adminId,
            verifiedAt: new Date(),
            adminNote: input.adminNote,
            rejectionReason: input.rejectionReason,
            updatedAt: new Date()
          })
          .where(eq(walletRechargeRequests.id, input.requestId))
          .returning()

        return {
          success: true,
          request: updatedRequest,
          message: 'Recharge request rejected',
          userNotified: true
        }
      }
    } catch (error) {
      console.error('Verify recharge error:', error)
      throw error
    }
  })
}

// ============================================================================
// Get User Recharge Requests
// ============================================================================

export async function getUserRechargeRequests(userId: number): Promise<WalletRechargeRequest[]> {
  return await db
    .select()
    .from(walletRechargeRequests)
    .where(eq(walletRechargeRequests.userId, userId))
    .orderBy(desc(walletRechargeRequests.createdAt))
}

// ============================================================================
// Get Recharge Request by ID
// ============================================================================

export async function getRechargeRequestById(requestId: number): Promise<WalletRechargeRequest | null> {
  const [request] = await db
    .select()
    .from(walletRechargeRequests)
    .where(eq(walletRechargeRequests.id, requestId))
    .limit(1)
  return request || null
}

// ============================================================================
// Get Pending Recharge Requests (for Admin)
// ============================================================================

export async function getPendingRechargeRequests(
  limit: number = 50,
  offset: number = 0
): Promise<Array<{ request: WalletRechargeRequest; user: User }>> {
  return await db
    .select({
      request: walletRechargeRequests,
      user: users
    })
    .from(walletRechargeRequests)
    .innerJoin(users, eq(walletRechargeRequests.userId, users.id))
    .where(
      and(
        eq(walletRechargeRequests.status, 'pending'),
        sql`${walletRechargeRequests.screenshotFileId} IS NOT NULL`
      )
    )
    .orderBy(desc(walletRechargeRequests.createdAt))
    .limit(limit)
    .offset(offset)
}

// ============================================================================
// Get Pending Recharge Request Count
// ============================================================================

export async function getPendingRechargeCount(): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(walletRechargeRequests)
    .where(
      and(
        eq(walletRechargeRequests.status, 'pending'),
        sql`${walletRechargeRequests.screenshotFileId} IS NOT NULL`
      )
    )
  return result?.count || 0
}

// ============================================================================
// Set Recharge Reference (User adds transaction ID)
// ============================================================================

export async function setRechargeReference(
  requestId: number,
  reference: string
): Promise<{ success: boolean; message: string }> {
  try {
    const request = await getRechargeRequestById(requestId)
    if (!request) {
      return {
        success: false,
        message: 'Recharge request not found'
      }
    }

    if (request.status !== 'awaiting_screenshot' && request.status !== 'pending') {
      return {
        success: false,
        message: `Cannot update request with status: ${request.status}`
      }
    }

    await db
      .update(walletRechargeRequests)
      .set({
        paymentReference: reference,
        updatedAt: new Date()
      })
      .where(eq(walletRechargeRequests.id, requestId))

    return {
      success: true,
      message: 'Payment reference updated'
    }
  } catch (error) {
    console.error('Set recharge reference error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update reference'
    }
  }
}

// ============================================================================
// Cancel/Expire Recharge Request
// ============================================================================

export async function cancelRechargeRequest(
  requestId: number
): Promise<{ success: boolean; message: string }> {
  try {
    const updated = await markRechargeAsExpired(requestId)
    if (!updated) {
      return {
        success: false,
        message: 'Recharge request not found'
      }
    }

    return {
      success: true,
      message: 'Recharge request cancelled'
    }
  } catch (error) {
    console.error('Cancel recharge error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to cancel request'
    }
  }
}

// ============================================================================
// Check and Expire Pending Recharge Requests
// ============================================================================

export async function checkExpiredRecharges(): Promise<WalletRechargeRequest[]> {
  try {
    const expiredRequests = await db
      .select()
      .from(walletRechargeRequests)
      .where(
        and(
          eq(walletRechargeRequests.status, 'pending'),
          isNotNull(walletRechargeRequests.expiresAt),
          sql`${walletRechargeRequests.expiresAt} < NOW()`
        )
      )

    const expired: WalletRechargeRequest[] = []

    for (const request of expiredRequests) {
      const updated = await markRechargeAsExpired(request.id)
      if (updated) {
        expired.push(updated)
      }
    }

    return expired
  } catch (error) {
    console.error('Check expired recharges error:', error)
    return []
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getUserById(userId: number): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  return user || null
}

async function markRechargeAsExpired(requestId: number): Promise<WalletRechargeRequest | null> {
  const [updated] = await db
    .update(walletRechargeRequests)
    .set({
      status: 'expired',
      updatedAt: new Date()
    })
    .where(eq(walletRechargeRequests.id, requestId))
    .returning()

  return updated || null
}

function isNotNull(value: any) {
  return sql`${value} IS NOT NULL`
}

// ============================================================================
// Export Service Object
// ============================================================================

export const walletRechargeService = {
  createWalletRecharge,
  attachRechargeScreenshot,
  verifyRecharge,
  getUserRechargeRequests,
  getRechargeRequestById,
  getPendingRechargeRequests,
  getPendingRechargeCount,
  setRechargeReference,
  cancelRechargeRequest,
  checkExpiredRecharges
}
