import type { Wallet } from '@/db/schema/wallets'
import type { WalletTransaction } from '@/db/schema/wallet-transactions'

export async function getTransactions(wallet: Wallet, _args: any, _ctx: any) {
  const { db } = await import('@/db/index.js')
  const { walletTransactions } = await import('@/db/schema/index.js')
  const { eq, desc } = await import('drizzle-orm')

  return await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, wallet.id))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(50)
}

export async function getByTransaction(transaction: WalletTransaction, _args: any, _ctx: any) {
  const { db } = await import('@/db/index.js')
  const { wallets } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, transaction.walletId))
  return wallet || null
}

export async function getReversedBy(transaction: WalletTransaction, _args: any, _ctx: any) {
  if (!transaction.reversedByTransactionId) return null

  const { db } = await import('@/db/index.js')
  const { walletTransactions } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [reversal] = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.id, transaction.reversedByTransactionId))

  return reversal || null
}
