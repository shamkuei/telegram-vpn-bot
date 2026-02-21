// Export all enums
export * from './enums.js'

// Export all tables
export * from './users.js'
export * from './regions.js'
export * from './servers.js'
export * from './vpn-accounts.js'
export * from './plans.js'
export * from './subscriptions.js'
export * from './wallets.js'
export * from './wallet-transactions.js'
export * from './payments.js'
export * from './manual-payments.js'
export * from './referrals.js'
export * from './gift-codes.js'
export * from './resellers.js'
export * from './devices.js'
export * from './test-accounts.js'
export * from './usage-alerts.js'
export * from './promo-codes.js'
export * from './feature-usage.js'
export * from './sessions.js'
export * from './rate-limits.js'
export * from './audit-logs.js'
export * from './feature-flags.js'

import { users } from './users.js'
import { serverRegions } from './regions.js'
import { servers } from './servers.js'
import { vpnAccounts } from './vpn-accounts.js'
import { plans } from './plans.js'
import { subscriptions } from './subscriptions.js'
import { wallets } from './wallets.js'
import { walletTransactions } from './wallet-transactions.js'
import { paymentLogs } from './payments.js'
import { manualPayments } from './manual-payments.js'
import { referrals } from './referrals.js'
import { giftCodes, giftRedemptions } from './gift-codes.js'
import { resellers, resellerTransactions } from './resellers.js'
import { devices } from './devices.js'
import { testAccounts } from './test-accounts.js'
import { usageAlerts } from './usage-alerts.js'
import { promoCodes } from './promo-codes.js'
import { featureUsage } from './feature-usage.js'
import { userSessions } from './sessions.js'
import { rateLimits } from './rate-limits.js'
import { auditLogs } from './audit-logs.js'
import { featureFlags, userFeatureFlags } from './feature-flags.js'

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
