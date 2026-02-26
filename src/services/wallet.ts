import { db, withTransaction } from '@/db/index'
import { wallets, walletTransactions, users } from '@/db/schema/index'
import { eq, sql, and } from 'drizzle-orm'

// ============================================================================
// Wallet Service
// ============================================================================

export interface Wallet {
  id: number
  userId: number
  balanceCents: number
  currency: string
  creditLimitCents: number
  frozenBalanceCents: number
  isActive: boolean
  isFrozen: boolean
  freezeReason: string | null
  createdAt: Date
  updatedAt: Date
}

// ============================================================================
// Get Wallet by User ID
// ============================================================================

export async function getWalletByUserId(userId: number): Promise<Wallet | null> {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)
  return wallet || null
}

// ============================================================================
// Create Wallet
// ============================================================================

export async function createWallet(userId: number, currency: string = 'USD'): Promise<Wallet> {
  // Check if wallet exists
  const existing = await getWalletByUserId(userId)
  if (existing) {
    return existing
  }

  const [wallet] = await db
    .insert(wallets)
    .values({
      userId,
      currency,
      balanceCents: 0,
      creditLimitCents: 0,
      frozenBalanceCents: 0,
      isActive: true,
      isFrozen: false,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    .returning()

  return wallet
}

// ============================================================================
// Credit (Add Funds)
// ============================================================================

export async function credit(
  userId: number,
  amountCents: number,
  referenceType?: string,
  referenceId?: string,
  description?: string,
  isManual: boolean = false,
  adminId?: number
): Promise<any> {
  return await withTransaction(async (tx) => {
    // Get wallet
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)

    if (!wallet) {
      throw new Error('Wallet not found')
    }

    // Credit wallet
    const balanceBefore = wallet.balanceCents
    const balanceAfter = balanceBefore + amountCents

    await tx
      .update(wallets)
      .set({
        balanceCents: balanceAfter,
        updatedAt: new Date()
      })
      .where(eq(wallets.id, wallet.id))

    // Create transaction record
    const [transaction] = await tx
      .insert(walletTransactions)
      .values({
        walletId: wallet.id,
        type: 'credit',
        amountCents,
        balanceBeforeCents: balanceBefore,
        balanceAfterCents: balanceAfter,
        referenceType,
        referenceId,
        description,
        status: 'completed',
        isManual,
        adminId,
        createdAt: new Date()
      })
      .returning()

    return transaction
  })
}

// ============================================================================
// Debit (Spend Funds)
// ============================================================================

export async function debit(
  walletId: number,
  amountCents: number,
  referenceType?: string,
  referenceId?: string,
  description?: string
): Promise<any> {
  return await withTransaction(async (tx) => {
    // Get wallet with lock
    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .for('update')
      .limit(1)

    if (!wallet) {
      throw new Error('Wallet not found')
    }

    // Check balance
    const availableBalance = wallet.balanceCents - wallet.frozenBalanceCents
    if (availableBalance < amountCents) {
      throw new Error('Insufficient funds')
    }

    // Debit wallet
    const balanceBefore = wallet.balanceCents
    const balanceAfter = balanceBefore - amountCents

    await tx
      .update(wallets)
      .set({
        balanceCents: balanceAfter,
        updatedAt: new Date()
      })
      .where(eq(wallets.id, walletId))

    // Create transaction record
    const [transaction] = await tx
      .insert(walletTransactions)
      .values({
        walletId,
        type: 'debit',
        amountCents,
        balanceBeforeCents: balanceBefore,
        balanceAfterCents: balanceAfter,
        referenceType,
        referenceId,
        description,
        status: 'completed',
        createdAt: new Date()
      })
      .returning()

    return transaction
  })
}

// ============================================================================
// Add Funds (Admin)
// ============================================================================

export async function addFunds(
  userId: number,
  amountCents: number,
  description: string,
  isManual: boolean = false,
  adminId?: number
): Promise<any> {
  return await credit(userId, amountCents, 'admin_adjustment', undefined, description, isManual, adminId)
}

// ============================================================================
// Transfer Funds
// ============================================================================

export async function transferFunds(
  fromUserId: number,
  toUserId: number,
  amountCents: number,
  description?: string
): Promise<any> {
  return await withTransaction(async (tx) => {
    // Get from wallet
    const [fromWallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, fromUserId))
      .for('update')
      .limit(1)

    if (!fromWallet) {
      throw new Error('Source wallet not found')
    }

    // Get to wallet
    const [toWallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, toUserId))
      .for('update')
      .limit(1)

    if (!toWallet) {
      throw new Error('Destination wallet not found')
    }

    // Check from wallet balance
    const availableBalance = fromWallet.balanceCents - fromWallet.frozenBalanceCents
    if (availableBalance < amountCents) {
      throw new Error('Insufficient funds in source wallet')
    }

    // Debit from wallet
    const fromBalanceBefore = fromWallet.balanceCents
    const fromBalanceAfter = fromBalanceBefore - amountCents

    await tx
      .update(wallets)
      .set({
        balanceCents: fromBalanceAfter,
        updatedAt: new Date()
      })
      .where(eq(wallets.id, fromWallet.id))

    // Credit to wallet
    const toBalanceBefore = toWallet.balanceCents
    const toBalanceAfter = toBalanceBefore + amountCents

    await tx
      .update(wallets)
      .set({
        balanceCents: toBalanceAfter,
        updatedAt: new Date()
      })
      .where(eq(wallets.id, toWallet.id))

    // Create transaction records
    await tx.insert(walletTransactions).values({
      walletId: fromWallet.id,
      type: 'debit',
      amountCents,
      balanceBeforeCents: fromBalanceBefore,
      balanceAfterCents: fromBalanceAfter,
      referenceType: 'transfer',
      referenceId: toUserId.toString(),
      description: description || 'Transfer to user',
      status: 'completed',
      createdAt: new Date()
    })

    const [toTransaction] = await tx.insert(walletTransactions).values({
      walletId: toWallet.id,
      type: 'credit',
      amountCents,
      balanceBeforeCents: toBalanceBefore,
      balanceAfterCents: toBalanceAfter,
      referenceType: 'transfer',
      referenceId: fromUserId.toString(),
      description: description || 'Transfer from user',
      status: 'completed',
      createdAt: new Date()
    }).returning()

    return {
      fromTransaction: 'completed',
      toTransaction
    }
  })
}

// ============================================================================
// Freeze/Unfreeze Wallet
// ============================================================================

export async function freezeWallet(walletId: number, reason: string): Promise<Wallet> {
  const [updated] = await db
    .update(wallets)
    .set({
      isFrozen: true,
      freezeReason: reason,
      updatedAt: new Date()
    })
    .where(eq(wallets.id, walletId))
    .returning()

  if (!updated) {
    throw new Error('Wallet not found')
  }

  return updated
}

export async function unfreezeWallet(walletId: number): Promise<Wallet> {
  const [updated] = await db
    .update(wallets)
    .set({
      isFrozen: false,
      freezeReason: null,
      updatedAt: new Date()
    })
    .where(eq(wallets.id, walletId))
    .returning()

  if (!updated) {
    throw new Error('Wallet not found')
  }

  return updated
}

// ============================================================================
// Freeze Funds
// ============================================================================

export async function freezeFunds(
  walletId: number,
  amountCents: number,
  reason?: string
): Promise<boolean> {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, walletId)).limit(1)

  if (!wallet) {
    throw new Error('Wallet not found')
  }

  const availableBalance = wallet.balanceCents - wallet.frozenBalanceCents
  if (availableBalance < amountCents) {
    throw new Error('Insufficient funds to freeze')
  }

  await db
    .update(wallets)
    .set({
      frozenBalanceCents: wallet.frozenBalanceCents + amountCents,
      updatedAt: new Date()
    })
    .where(eq(wallets.id, walletId))

  return true
}

export async function unfreezeFunds(walletId: number, amountCents: number): Promise<boolean> {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, walletId)).limit(1)

  if (!wallet) {
    throw new Error('Wallet not found')
  }

  if (wallet.frozenBalanceCents < amountCents) {
    throw new Error('Cannot unfreeze more than frozen amount')
  }

  await db
    .update(wallets)
    .set({
      frozenBalanceCents: wallet.frozenBalanceCents - amountCents,
      updatedAt: new Date()
    })
    .where(eq(wallets.id, walletId))

  return true
}

// ============================================================================
// Get Transaction History
// ============================================================================

export async function getTransactions(
  walletId: number,
  limit: number = 50,
  offset: number = 0,
  type?: string,
  status?: string
): Promise<any[]> {
  let whereClause = eq(walletTransactions.walletId, walletId)

  if (type) {
    whereClause = and(whereClause, eq(walletTransactions.type, type as any))
  }

  if (status) {
    whereClause = and(whereClause, eq(walletTransactions.status, status as any))
  }

  return await db
    .select()
    .from(walletTransactions)
    .where(whereClause)
    .orderBy(desc(walletTransactions.createdAt))
    .limit(limit)
    .offset(offset)
}

// ============================================================================
// Wallet Statistics
// ============================================================================

export async function getWalletStats(walletId: number) {
  const { wallet } = await import('@/db/schema/index.js')
  const { eq, sql } = await import('drizzle-orm')

  const [stats] = await db
    .select({
      totalCredits: sql<number>`COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents ELSE 0 END), 0)`,
      totalDebits: sql<number>`COALESCE(SUM(CASE WHEN type = 'debit' THEN amount_cents ELSE 0 END), 0)`,
      transactionCount: sql<number>`COUNT(*)::int`
    })
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, walletId))
    .limit(1)

  return {
    totalCredits: stats?.totalCredits || 0,
    totalDebits: stats?.totalDebits || 0,
    netAmount: (stats?.totalCredits || 0) - (stats?.totalDebits || 0),
    transactionCount: stats?.transactionCount || 0
  }
}
