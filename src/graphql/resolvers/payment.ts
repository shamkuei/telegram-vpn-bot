import { ResellerTransaction } from '@/db/schema/index.js'

export async function getByResellerTransaction(transaction: ResellerTransaction, _args: any, _ctx: any) {
  if (!transaction.paymentLogId) return null

  const { db } = await import('@/db/index.js')
  const { paymentLogs } = await import('@/db/schema/index.js')
  const { eq } = await import('drizzle-orm')

  const [payment] = await db.select().from(paymentLogs).where(eq(paymentLogs.id, transaction.paymentLogId))
  return payment || null
}
