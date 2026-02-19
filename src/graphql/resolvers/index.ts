import { Resolvers } from './types.js'
import * as queries from './queries/index.js'
import * as mutations from './mutations/index.js'
import * as userResolvers from './user.js'
import * as serverResolvers from './server.js'
import * as planResolvers from './plan.js'
import * as subscriptionResolvers from './subscription.js'
import * as walletResolvers from './wallet.js'
import * as paymentResolvers from './payment.js'

// ============================================================================
// Main Resolvers
// ============================================================================

export const resolvers: Resolvers = {
  // ============================================================================
  // Query Resolvers
  // ============================================================================
  Query: {
    // Health & System
    health: () => true,

    // User queries
    me: queries.getMe,
    user: queries.getUser,
    userByReferralCode: queries.getUserByReferralCode,

    // Plan queries
    plans: queries.getPlans,
    plan: queries.getPlan,

    // Server queries
    servers: queries.getServers,
    server: queries.getServer,
    regions: queries.getRegions,

    // Subscription queries
    mySubscriptions: queries.getMySubscriptions,
    subscription: queries.getSubscription,

    // VPN Account queries
    myVpnAccounts: queries.getMyVpnAccounts,

    // Wallet queries
    myWallet: queries.getMyWallet,
    myTransactions: queries.getMyTransactions,

    // Payment queries
    payment: queries.getPayment,

    // Referral queries
    myReferrals: queries.getMyReferrals,
    referralByCode: queries.getReferralByCode,

    // Promo code queries
    validatePromoCode: queries.validatePromoCode,

    // Device queries
    myDevices: queries.getMyDevices,

    // Test account queries
    myTestAccounts: queries.getMyTestAccounts,

    // Usage alert queries
    myUsageAlerts: queries.getMyUsageAlerts,

    // Reseller queries
    myReseller: queries.getMyReseller,
    resellerTransactions: queries.getResellerTransactions,

    // Audit log queries
    auditLogs: queries.getAuditLogs
  },

  // ============================================================================
  // Mutation Resolvers
  // ============================================================================
  Mutation: {
    // User mutations
    upsertUser: mutations.upsertUser,
    updateUser: mutations.updateUser,

    // Subscription mutations
    createSubscription: mutations.createSubscription,
    renewSubscription: mutations.renewSubscription,
    cancelSubscription: mutations.cancelSubscription,
    updateAutoRenew: mutations.updateAutoRenew,

    // Payment mutations
    createPayment: mutations.createPayment,
    confirmPayment: mutations.confirmPayment,

    // Wallet mutations
    addFunds: mutations.addFunds,

    // Gift code mutations
    createGiftCode: mutations.createGiftCode,
    claimGiftCode: mutations.claimGiftCode,

    // Test account mutations
    createTestAccount: mutations.createTestAccount,
    convertTestAccount: mutations.convertTestAccount,

    // VPN Account mutations
    revokeVpnAccount: mutations.revokeVpnAccount,
    resetVpnAccountUsage: mutations.resetVpnAccountUsage,

    // Device mutations
    disconnectDevice: mutations.disconnectDevice,
    blockDevice: mutations.blockDevice,

    // Usage alert mutations
    markAlertAsRead: mutations.markAlertAsRead,
    handleAlert: mutations.handleAlert,

    // Session mutations
    updateSession: mutations.updateSession,
    clearSession: mutations.clearSession
  },

  // ============================================================================
  // Type Field Resolvers
  // ============================================================================

  // User field resolvers
  User: {
    wallet: userResolvers.getWallet,
    subscriptions: userResolvers.getSubscriptions,
    vpnAccounts: userResolvers.getVpnAccounts,
    devices: userResolvers.getDevices,
    activeTestAccounts: userResolvers.getActiveTestAccounts,
    referralsAsReferrer: userResolvers.getReferralsAsReferrer,
    referralAsReferred: userResolvers.getReferralAsReferred,
    reseller: userResolvers.getReseller
  },

  // Server field resolvers
  Server: {
    region: serverResolvers.getRegion
  },

  // ServerRegion field resolvers
  ServerRegion: {
    servers: serverResolvers.getRegionServers
  },

  // Plan field resolvers
  Plan: {
    allowedRegions: planResolvers.getAllowedRegions,
    allowedServers: planResolvers.getAllowedServers,
    priceUsd: planResolvers.getPriceUsd,
    dataLimit: planResolvers.getDataLimit
  },

  // Subscription field resolvers
  Subscription: {
    plan: subscriptionResolvers.getPlan,
    server: subscriptionResolvers.getServer,
    region: subscriptionResolvers.getRegion,
    user: subscriptionResolvers.getUser,
    paymentLog: subscriptionResolvers.getPaymentLog,
    daysRemaining: subscriptionResolvers.getDaysRemaining,
    isExpiring: subscriptionResolvers.getIsExpiring,
    usagePercentage: subscriptionResolvers.getUsagePercentage,
    remainingDataGb: subscriptionResolvers.getRemainingDataGb,
    priceUsd: subscriptionResolvers.getPriceUsd
  },

  // VpnAccount field resolvers
  VpnAccount: {
    user: userResolvers.getByVpnAccount,
    server: serverResolvers.getByVpnAccount,
    subscription: subscriptionResolvers.getByVpnAccount,
    dataLimitGb: (parent) => (parent.dataLimitBytes ? Math.floor(parent.dataLimitBytes / 1_000_000_000) : null),
    usedDataGb: (parent) => Math.floor(parent.usedDataBytes / 1_000_000_000),
    remainingDataBytes: (parent) => {
      if (!parent.dataLimitBytes) return null
      return Math.max(0, parent.dataLimitBytes - parent.usedDataBytes)
    }
  },

  // Wallet field resolvers
  Wallet: {
    user: userResolvers.getByWallet,
    transactions: walletResolvers.getTransactions,
    balanceUsd: (parent) => parent.balanceCents / 100,
    availableBalanceCents: (parent) => Math.max(0, parent.balanceCents - parent.frozenBalanceCents),
    availableBalanceUsd: (parent) => Math.max(0, parent.balanceCents - parent.frozenBalanceCents) / 100
  },

  // WalletTransaction field resolvers
  WalletTransaction: {
    wallet: walletResolvers.getByTransaction,
    admin: userResolvers.getByTransaction,
    reversedBy: walletResolvers.getReversedBy,
    amountUsd: (parent) => parent.amountCents / 100
  },

  // PaymentLog field resolvers
  PaymentLog: {
    user: userResolvers.getByPayment,
    subscription: subscriptionResolvers.getByPayment,
    amountUsd: (parent) => parent.amountCents / 100
  },

  // Referral field resolvers
  Referral: {
    referrer: userResolvers.getByReferrer,
    referred: userResolvers.getByReferred,
    rewardUsd: (parent) => parent.rewardCents / 100
  },

  // GiftCode field resolvers
  GiftCode: {
    plan: planResolvers.getByGiftCode,
    creator: userResolvers.getByGiftCode
  },

  // GiftRedemption field resolvers
  GiftRedemption: {
    giftCode: () => null, // TODO: implement
    user: userResolvers.getByGiftRedemption,
    subscription: subscriptionResolvers.getByGiftRedemption
  },

  // Reseller field resolvers
  Reseller: {
    user: userResolvers.getByReseller,
    approver: userResolvers.getByResellerApproval,
    transactions: () => null, // TODO: implement
    commissionPercentage: (parent) => parent.commissionRate,
    totalCommissionCents: (parent) => parent.pendingCommissionCents + parent.paidCommissionCents,
    totalCommissionUsd: (parent) => (parent.pendingCommissionCents + parent.paidCommissionCents) / 100
  },

  // ResellerTransaction field resolvers
  ResellerTransaction: {
    reseller: () => null, // TODO: implement
    customer: userResolvers.getByResellerTransaction,
    subscription: subscriptionResolvers.getByResellerTransaction,
    paymentLog: paymentResolvers.getByResellerTransaction,
    saleAmountUsd: (parent) => parent.saleAmountCents / 100,
    commissionUsd: (parent) => parent.commissionCents / 100
  },

  // Device field resolvers
  Device: {
    user: userResolvers.getByDevice,
    vpnAccount: () => null // TODO: implement
  },

  // TestAccount field resolvers
  TestAccount: {
    user: userResolvers.getByTestAccount,
    vpnAccount: () => null, // TODO: implement
    convertedToSubscription: subscriptionResolvers.getByTestAccount,
    remainingMinutes: (parent) => {
      const now = new Date().getTime()
      const expiresAt = new Date(parent.expiresAt).getTime()
      return Math.max(0, Math.floor((expiresAt - now) / 60000))
    }
  },

  // UsageAlert field resolvers
  UsageAlert: {
    user: userResolvers.getByUsageAlert,
    subscription: subscriptionResolvers.getByUsageAlert
  },

  // PromoCode field resolvers
  PromoCode: {
    applicablePlans: planResolvers.getByPromoCode,
    creator: userResolvers.getByPromoCode
  },

  // AuditLog field resolvers
  AuditLog: {
    actor: userResolvers.getByAuditLog
  }
}
