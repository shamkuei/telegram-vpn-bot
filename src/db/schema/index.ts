// Export all enums
export * from './enums'

// Export all tables
export * from './users'
export * from './regions'
export * from './servers'
export * from './vpn-accounts'
export * from './plans'
export * from './subscriptions'
export * from './wallets'
export * from './wallet-transactions'
export * from './payments'
export * from './manual-payments'
export * from './wallet-recharge-requests'
export * from './referrals'
export * from './gift-codes'
export * from './resellers'
export * from './devices'
export * from './test-accounts'
export * from './usage-alerts'
export * from './promo-codes'
export * from './feature-usage'
export * from './sessions'
export * from './rate-limits'
export * from './audit-logs'
export * from './feature-flags'

// Export types
export type { User } from './users'
export type { Plan } from './plans'
export type { Subscription } from './subscriptions'
export type { VpnAccount } from './vpn-accounts'
export type { Wallet } from './wallets'
export type { PaymentLog } from './payments'
export type { ManualPayment } from './manual-payments'
export type { WalletRechargeRequest } from './wallet-recharge-requests'
export type { Referral } from './referrals'
export type { GiftCode } from './gift-codes'
export type { Reseller } from './resellers'
export type { Device } from './devices'
export type { TestAccount } from './test-accounts'
export type { UsageAlert } from './usage-alerts'
export type { Server } from './servers'
export type { ServerRegion } from './regions'

import { users } from './users'
import { serverRegions } from './regions'
import { servers } from './servers'
import { vpnAccounts } from './vpn-accounts'
import { plans } from './plans'
import { subscriptions } from './subscriptions'
import { wallets } from './wallets'
import { walletTransactions } from './wallet-transactions'
import { paymentLogs } from './payments'
import { manualPayments } from './manual-payments'
import { walletRechargeRequests } from './wallet-recharge-requests'
import { referrals } from './referrals'
import { giftCodes, giftRedemptions } from './gift-codes'
import { resellers, resellerTransactions } from './resellers'
import { devices } from './devices'
import { testAccounts } from './test-accounts'
import { usageAlerts } from './usage-alerts'
import { promoCodes } from './promo-codes'
import { featureUsage } from './feature-usage'
import { userSessions } from './sessions'
import { rateLimits } from './rate-limits'
import { auditLogs } from './audit-logs'
import { featureFlags, userFeatureFlags } from './feature-flags'

export const schema = {
  users,
  serverRegions,
  servers,
  vpnAccounts,
  plans,
  subscriptions,
  wallets,
  walletTransactions,
  paymentLogs,
  manualPayments,
  walletRechargeRequests,
  referrals,
  giftCodes,
  giftRedemptions,
  resellers,
  resellerTransactions,
  devices,
  testAccounts,
  usageAlerts,
  promoCodes,
  featureUsage,
  userSessions,
  rateLimits,
  auditLogs,
  featureFlags,
  userFeatureFlags
}
