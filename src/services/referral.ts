import { db, withTransaction } from '@/db/index'
import { referrals, users, wallets } from '@/db/schema/index'
import { eq, and, sql } from 'drizzle-orm'

// ============================================================================
// Types
// ============================================================================

export interface CreateReferralInput {
  referrerId: number
  referredId: number
  rewardPercentage?: number
}

export interface CompleteReferralInput {
  referralId: number
  amountCents: number
}

export interface ReferralStats {
  totalReferrals: number
  completedReferrals: number
  pendingReferrals: number
  totalEarnedCents: number
}

// ============================================================================
// Referral Service
// ============================================================================

export const referralService = {
  /**
   * Create a new referral when a user signs up with a referral code
   */
  async createReferral(input: CreateReferralInput) {
    try {
      // Check if referral already exists
      const existing = await this.findByReferrerAndReferred(input.referrerId, input.referredId)
      if (existing) {
        return existing
      }

      // Calculate reward (default 10%)
      const rewardPercentage = input.rewardPercentage || 10

      // Set expiry (30 days from now)
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)

      // Create referral record
      const [referral] = await db.insert(referrals).values({
        referrerId: input.referrerId,
        referredId: input.referredId,
        status: 'pending',
        rewardPercentage,
        rewardCents: 0,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning()

      return referral
    } catch (error) {
      console.error('Create referral error:', error)
      throw error
    }
  },

  /**
   * Complete a referral (when referred user makes a purchase)
   */
  async completeReferral(input: CompleteReferralInput) {
    try {
      const referral = await this.findById(input.referralId)

      if (!referral) {
        throw new Error('Referral not found')
      }

      if (referral.status === 'completed') {
        return referral
      }

      if (referral.status !== 'pending') {
        throw new Error(`Referral is ${referral.status}`)
      }

      // Check if expired
      if (referral.expiresAt && new Date(referral.expiresAt) < new Date()) {
        await this.updateStatus(input.referralId, 'expired')
        throw new Error('Referral has expired')
      }

      // Calculate reward
      const rewardCents = Math.floor((input.amountCents * referral.rewardPercentage) / 100)

      // Update referral and credit referrer's wallet within transaction
      const result = await withTransaction(async (tx) => {
        // Update referral status
        const [updated] = await tx.update(referrals)
          .set({
            status: 'completed',
            rewardCents,
            completedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(referrals.id, input.referralId))
          .returning()

        // Get or create referrer's wallet
        const [wallet] = await tx.select()
          .from(wallets)
          .where(eq(wallets.userId, referral.referrerId))
          .limit(1)

        if (!wallet) {
          throw new Error('Referrer wallet not found')
        }

        // Credit wallet
        const balanceBefore = wallet.balanceCents
        const balanceAfter = balanceBefore + rewardCents

        await tx.update(wallets)
          .set({
            balanceCents: balanceAfter,
            updatedAt: new Date()
          })
          .where(eq(wallets.id, wallet.id))

        return updated
      })

      return result
    } catch (error) {
      console.error('Complete referral error:', error)
      throw error
    }
  },

  /**
   * Get referral statistics for a user
   */
  async getReferralStats(referrerId: number): Promise<ReferralStats> {
    try {
      const userReferrals = await this.getByReferrerId(referrerId)

      const completedReferrals = userReferrals.filter(r => r.status === 'completed')
      const pendingReferrals = userReferrals.filter(r => r.status === 'pending')
      const totalEarnedCents = completedReferrals.reduce((sum, r) => sum + (r.rewardCents || 0), 0)

      return {
        totalReferrals: userReferrals.length,
        completedReferrals: completedReferrals.length,
        pendingReferrals: pendingReferrals.length,
        totalEarnedCents
      }
    } catch (error) {
      console.error('Get referral stats error:', error)
      return {
        totalReferrals: 0,
        completedReferrals: 0,
        pendingReferrals: 0,
        totalEarnedCents: 0
      }
    }
  },

  /**
   * Process referral reward (called when referred user makes a purchase)
   */
  async processReferralReward(referredUserId: number, purchaseAmountCents: number) {
    try {
      // Find pending referral for this user
      const referral = await this.findPendingByReferredId(referredUserId)

      if (!referral) {
        return null
      }

      // Complete the referral
      return await this.completeReferral({
        referralId: referral.id,
        amountCents: purchaseAmountCents
      })
    } catch (error) {
      console.error('Process referral reward error:', error)
      return null
    }
  },

  /**
   * Find referral by ID
   */
  async findById(id: number) {
    const [referral] = await db.select().from(referrals).where(eq(referrals.id, id)).limit(1)
    return referral || null
  },

  /**
   * Find referral by referrer and referred users
   */
  async findByReferrerAndReferred(referrerId: number, referredId: number) {
    const [referral] = await db
      .select()
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerId, referrerId),
          eq(referrals.referredId, referredId)
        )
      )
      .limit(1)

    return referral || null
  },

  /**
   * Find pending referral by referred user ID
   */
  async findPendingByReferredId(referredId: number) {
    const [referral] = await db
      .select()
      .from(referrals)
      .where(
        and(
          eq(referrals.referredId, referredId),
          eq(referrals.status, 'pending')
        )
      )
      .limit(1)

    return referral || null
  },

  /**
   * Get all referrals by referrer
   */
  async getByReferrerId(referrerId: number) {
    return await db
      .select()
      .from(referrals)
      .where(eq(referrals.referrerId, referrerId))
      .orderBy((referrals) => referrals.createdAt)
  },

  /**
   * Update referral status
   */
  async updateStatus(id: number, status: 'pending' | 'completed' | 'expired') {
    const [updated] = await db
      .update(referrals)
      .set({ status, updatedAt: new Date() })
      .where(eq(referrals.id, id))
      .returning()

    return updated || null
  }
}
