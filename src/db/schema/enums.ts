import { pgEnum } from 'drizzle-orm/pg-core'

// User enums
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'banned', 'deleted'])
export const resellerTierEnum = pgEnum('reseller_tier', ['bronze', 'silver', 'gold', 'platinum'])

// Server enums
export const serverStatusEnum = pgEnum('server_status', ['active', 'maintenance', 'full', 'offline'])
export const serverTypeEnum = pgEnum('server_type', ['xray', 'v2ray', 'shadowsocks'])

// VPN Account enums
export const vpnAccountStatusEnum = pgEnum('vpn_account_status', [
  'active',
  'disabled',
  'expired',
  'limited',
  'on_hold'
])

// Plan enums
export const planTypeEnum = pgEnum('plan_type', [
  'monthly',
  'quarterly',
  'yearly',
  'lifetime',
  'test'
])
export const serverAccessTypeEnum = pgEnum('server_access_type', ['all', 'region', 'specific'])

// Subscription enums
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'pending_payment',
  'active',
  'expired',
  'cancelled',
  'suspended',
  'renewing',
  'gift_claimed'
])

// Wallet enums
export const walletTransactionTypeEnum = pgEnum('wallet_transaction_type', [
  'credit',
  'debit',
  'refund',
  'chargeback',
  'referral_bonus',
  'reseller_commission',
  'gift_claim',
  'admin_adjustment',
  'test_deposit'
])
export const walletTransactionStatusEnum = pgEnum('wallet_transaction_status', [
  'pending',
  'completed',
  'failed',
  'reversed'
])

// Payment enums
export const paymentProviderEnum = pgEnum('payment_provider', [
  'cryptopay',
  'nowpayments',
  'stripe',
  'wallet'
])
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'expired',
  'refunded',
  'chargeback'
])

// Manual Payment enums
export const manualPaymentStatusEnum = pgEnum('manual_payment_status', [
  'pending',
  'awaiting_screenshot',
  'approved',
  'rejected',
  'expired'
])

// Wallet Recharge Request enums
export const walletRechargeStatusEnum = pgEnum('wallet_recharge_status', [
  'pending',
  'awaiting_screenshot',
  'approved',
  'rejected',
  'expired'
])

// Referral enums
export const referralStatusEnum = pgEnum('referral_status', [
  'pending',
  'completed',
  'expired',
  'fraud'
])

// Reseller enums
export const resellerStatusEnum = pgEnum('reseller_status', [
  'pending',
  'active',
  'suspended',
  'terminated'
])
export const resellerTransactionTypeEnum = pgEnum('reseller_transaction_type', [
  'sale',
  'commission_payment',
  'refund',
  'adjustment'
])
export const resellerTransactionStatusEnum = pgEnum('reseller_transaction_status', [
  'pending',
  'approved',
  'paid',
  'refunded'
])

// Gift code enums
export const giftCodeStatusEnum = pgEnum('gift_code_status', [
  'active',
  'expired',
  'depleted',
  'disabled'
])

// Test account enums
export const testAccountStatusEnum = pgEnum('test_account_status', [
  'active',
  'expired',
  'converted',
  'cancelled'
])

// Usage alert enums
export const usageAlertTypeEnum = pgEnum('usage_alert_type', [
  'data_threshold_1',
  'data_threshold_2',
  'data_depleted',
  'expiring_soon',
  'expired',
  'device_limit_reached'
])

// Promo code enums
export const promoDiscountTypeEnum = pgEnum('promo_discount_type', [
  'percentage',
  'fixed',
  'trial_days'
])

// Rate limit enums
export const rateLimitTargetTypeEnum = pgEnum('rate_limit_target_type', [
  'user',
  'ip',
  'global'
])

// Audit log enums
export const auditActorTypeEnum = pgEnum('audit_actor_type', [
  'user',
  'admin',
  'system',
  'worker'
])
export const auditStatusEnum = pgEnum('audit_status', ['success', 'failed', 'partial'])
