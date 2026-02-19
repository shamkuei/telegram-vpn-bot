import { db } from '@/db/index.js'
import { users } from '@/db/schema/index.js'
import { eq, and } from 'drizzle-orm'
import { generateReferralCode } from '@/utils/referral.js'
import { CacheInvalidation } from '@/cache/index.js'
import type { NewUser } from '@/db/schema/index.js'

// ============================================================================
// User Service
// ============================================================================

export interface CreateUserInput {
  telegramId: number
  telegramUsername?: string
  telegramFirstName: string
  telegramLastName?: string
  telegramLanguageCode?: string
  referralCode?: string
}

// ============================================================================
// Find or Create User
// ============================================================================

export async function upsertUser(input: CreateUserInput) {
  // Check if user exists
  const [existing] = await db.select().from(users).where(eq(users.telegramId, input.telegramId))

  if (existing) {
    // Update last activity
    const [updated] = await db
      .update(users)
      .set({
        telegramUsername: input.telegramUsername,
        telegramFirstName: input.telegramFirstName,
        telegramLastName: input.telegramLastName,
        telegramLanguageCode: input.telegramLanguageCode,
        lastActivityAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, existing.id))
      .returning()

    return updated
  }

  // Create new user
  const referralCode = input.referralCode || generateReferralCode()

  // Check if referred by someone
  let referredBy: number | null = null
  if (input.referralCode) {
    const referrer = await findByReferralCode(input.referralCode)
    if (referrer) {
      referredBy = referrer.telegramId
    }
  }

  const [created] = await db
    .insert(users)
    .values({
      telegramId: input.telegramId,
      telegramUsername: input.telegramUsername,
      telegramFirstName: input.telegramFirstName,
      telegramLastName: input.telegramLastName,
      telegramLanguageCode: input.telegramLanguageCode,
      referralCode,
      referredBy,
      status: 'active',
      trustScore: '1.00',
      joinedAt: new Date(),
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    })
    .returning()

  return created
}

// ============================================================================
// Find Users
// ============================================================================

export async function findByTelegramId(telegramId: number) {
  const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId))
  return user || null
}

export async function findByReferralCode(referralCode: string) {
  const [user] = await db.select().from(users).where(eq(users.referralCode, referralCode))
  return user || null
}

export async function findById(id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id))
  return user || null
}

export async function findByIds(ids: number[]) {
  if (ids.length === 0) return []
  return await db.select().from(users).where(eq(users.id, ids[0]))
}

// ============================================================================
// User Operations
// ============================================================================

export async function updateMarzbanUser(userId: number, marzbanUsername: string) {
  const [updated] = await db
    .update(users)
    .set({ marzbanUsername, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()

  if (updated) {
    await CacheInvalidation.invalidateUser(userId)
  }

  return updated
}

export async function setStatus(userId: number, status: 'active' | 'suspended' | 'banned') {
  const [updated] = await db
    .update(users)
    .set({ status, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()

  if (updated) {
    await CacheInvalidation.invalidateUser(userId)
  }

  return updated
}

export async function updateLastActivity(userId: number) {
  await db
    .update(users)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId))
}

// ============================================================================
// Trust Score Management
// ============================================================================

export async function adjustTrustScore(userId: number, adjustment: number) {
  const user = await findById(userId)
  if (!user) return null

  const currentScore = parseFloat(user.trustScore || '0')
  const newScore = Math.max(0, Math.min(1, currentScore + adjustment))

  const [updated] = await db
    .update(users)
    .set({ trustScore: newScore.toString(), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()

  return updated
}

// ============================================================================
// Flag Management
// ============================================================================

export async function flagUser(userId: number, reason: string) {
  const [updated] = await db
    .update(users)
    .set({
      isFlagged: true,
      flagReason: reason,
      flagCount: sql`flag_count + 1`,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId))
    .returning()

  if (updated) {
    await CacheInvalidation.invalidateUser(userId)
  }

  return updated
}

export async function unflagUser(userId: number) {
  const [updated] = await db
    .update(users)
    .set({
      isFlagged: false,
      flagReason: null,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId))
    .returning()

  if (updated) {
    await CacheInvalidation.invalidateUser(userId)
  }

  return updated
}

// ============================================================================
// Statistics
// ============================================================================

export async function getUserCount() {
  const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(users)
  return result?.count || 0
}

export async function getActiveUserCount() {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.status, 'active'))

  return result?.count || 0
}
