# Telegram VPN Bot - Technical Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Database Structure](#3-database-structure)
4. [Core Modules](#4-core-modules)
5. [API Endpoints](#5-api-endpoints)
6. [Telegram Bot Integration](#6-telegram-bot-integration)
7. [Background Workers](#7-background-workers)
8. [GraphQL API](#8-graphql-api)
9. [Security & Authentication](#9-security--authentication)
10. [Deployment](#10-deployment)

---

## 1. Project Overview

### 1.1 Purpose

The **Telegram VPN Bot** is a comprehensive VPN subscription management system that provides automated VPN services through Telegram. It integrates with Marzban (a VPN panel) to manage user subscriptions, process payments, and deliver VPN credentials directly through a Telegram bot interface.

### 1.2 Main Features

| Feature | Description |
|---------|-------------|
| **User Management** | Telegram-based user registration with referral system |
| **Subscription Management** | Create, renew, cancel VPN subscriptions |
| **Manual Payment System** | Admin-verified card payments with screenshot upload |
| **Wallet System** | Internal wallet with credit/debit/transfer functionality |
| **Test Accounts** | Free trial accounts before purchase |
| **Gift Codes** | Promotional code system for rewards |
| **Referral Program** | Invite friends and earn rewards |
| **Reseller System** | Multi-tier reseller support with commissions |
| **Server Management** | Multi-region VPN server support with load balancing |
| **Usage Tracking** | Data usage monitoring with alerts |
| **Rate Limiting** | Per-user and per-IP rate limiting |
| **Audit Logging** | Complete action tracking for security |

### 1.3 Target Users

- **End Users**: Telegram users seeking VPN services
- **Resellers**: Multi-tier resellers managing customer subscriptions
- **Administrators**: System administrators managing the VPN service and verifying payments

---

## 2. Architecture Overview

### 2.1 System Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        TG[Telegram Bot]
        WEB[Web/Mobile Client]
    end

    subgraph "API Gateway"
        HONO[Hono Server]
        GQL[GraphQL Yoga]
    end

    subgraph "Application Layer"
        BOT[Bot Handlers]
        SVC[Services]
        MW[Middleware]
        WORK[Background Workers]
    end

    subgraph "External Services"
        MARZ[Marzban API]
        ADMIN[Admin Verification]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL)]
        REDIS[(Redis)]
    end

    TG -->|Webhook| HONO
    WEB -->|REST/GraphQL| HONO
    HONO --> MW
    HONO --> GQL
    MW --> BOT
    MW --> SVC
    BOT --> SVC
    WORK --> SVC

    SVC --> MARZ
    BOT --> ADMIN

    SVC --> PG
    SVC --> REDIS
    BOT --> REDIS
    WORK --> REDIS
```

### 2.2 Manual Payment Flow

```mermaid
sequenceDiagram
    participant User
    participant Bot as Telegram Bot
    participant Admin as Admin
    participant App as Hono App
    participant Marzban as Marzban API
    participant DB as PostgreSQL

    User->>Bot: /plans command
    Bot->>App: Get available plans
    App->>DB: Query plans
    DB-->>Bot: Return plans
    Bot-->>User: Display plans

    User->>Bot: Select plan (payment:create)
    Bot->>App: Create manual payment
    App->>DB: Insert manual_payment (awaiting_screenshot)
    DB-->>App: Payment created
    Bot-->>User: Show card number + amount

    Note over User: User sends money to card
    User->>Bot: Upload payment screenshot
    Bot->>App: Attach screenshot to payment
    App->>DB: Update payment (pending)
    Bot->>Admin: Forward screenshot for verification

    Admin->>Bot: /verify_payment <id>
    Bot->>Admin: Show payment + screenshot
    Admin->>Bot: Approve payment
    Bot->>App: Verify payment (approved=true)
    App->>Marzban: Create VPN user
    Marzban-->>App: User credentials
    App->>DB: Create subscription + VPN account
    App->>DB: Update payment (approved)
    Bot->>User: Notify subscription active
```

### 2.3 Backend Structure

```
src/
├── index.ts                    # Hono app entry point
├── config/                     # Environment configuration
│   └── index.ts
├── db/                         # Database layer
│   ├── index.ts                # Drizzle connection
│   ├── schema/                 # Database schemas
│   │   ├── enums.ts            # PostgreSQL enums
│   │   ├── users.ts
│   │   ├── servers.ts
│   │   ├── plans.ts
│   │   ├── subscriptions.ts
│   │   ├── manual-payments.ts  # Manual payments table
│   │   ├── vpn-accounts.ts
│   │   ├── wallets.ts
│   │   ├── payments.ts
│   │   └── ...
│   └── queries.ts              # Pre-built queries
├── cache/                      # Redis caching layer
│   └── index.ts
├── marzban/                    # Marzban API client
│   └── index.ts
├── bot/                        # Telegram bot
│   ├── index.ts                # Bot setup
│   └── handlers/               # Command handlers
│       ├── payment.ts          # Manual payment handler
│       └── admin.ts            # Admin verification handler
├── services/                   # Business logic
│   ├── user.ts
│   ├── subscription.ts
│   ├── manual-payment.ts       # Manual payment service
│   └── wallet.ts
├── routes/                     # HTTP routes
│   ├── api/
│   │   └── payments.ts         # Manual payment routes
│   ├── health.ts
│   └── webhooks.ts
├── middleware/                 # Hono middleware
│   ├── auth.ts
│   └── rate-limit.ts
├── graphql/                    # GraphQL setup
│   ├── index.ts
│   ├── context.ts
│   └── resolvers/
└── workers/                    # Background jobs
    ├── index.ts
    └── payment-worker.ts
```

### 2.4 Database Structure (PostgreSQL)

The database uses Drizzle ORM with the following main entities:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | User accounts | telegramId, referralCode, trustScore |
| `servers` | VPN servers | marzbanNodeId, loadPercentage |
| `plans` | Subscription plans | durationDays, priceUsdCents |
| `subscriptions` | User subscriptions | userId, planId, expiresAt |
| `manual_payments` | Manual payment requests | userId, planId, status, screenshotFileId |
| `vpn_accounts` | VPN credentials | marzbanUsername, marzbanToken |
| `wallets` | User wallets | balanceCents, frozenBalanceCents |
| `payments` | Payment logs (removed) | provider, status, amountCents - REMOVED |
| `referrals` | Referral tracking | referrerId, rewardCents |
| `gift_codes` | Gift codes | code, maxUses, usedCount |
| `test_accounts` | Free trials | durationMinutes, status |

### 2.5 External Services

| Service | Purpose | Integration Method |
|---------|---------|-------------------|
| **Marzban** | VPN panel management | REST API with JWT auth |
| **Telegram Bot API** | Bot interface | Grammy framework |
| **PostgreSQL** | Primary database | Drizzle ORM |
| **Redis** | Cache & queues | ioredis + BullMQ |

---

## 3. Database Structure

### 3.1 Schema Overview

#### Users Table (`users`)

```typescript
{
  id: bigint (PK)ر این کار هیچ راهی برای ساخت بمب باقی نگذارد، یک مقام ارشد آمریکایی به Axios گفت.»
  telegramId: bigint (unique)
  telegramUsername: varchar(32)
  telegramFirstName: varchar(64)
  telegramLastName: varchar(64)
  status: user_status_enum
  marzbanUsername: varchar(64) (unique)
  marzbanUserId: integer
  referredBy: bigint (FK → users.telegramId)
  referralCode: varchar(20) (unique)
  isReseller: boolean
  resellerTier: reseller_tier_enum
  isFlagged: boolean
  flagReason: text
  flagCount: integer
  trustScore: decimal(3,2)
  botBlockedAt: timestamp
  joinedAt: timestamp
  lastActivityAt: timestamp
  failedPaymentAttempts: integer
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### Servers Table (`servers`)

```typescript
{
  id: serial (PK)
  name: varchar(64)
  description: text
  countryCode: varchar(2)
  city: varchar(64)
  marzbanNodeId: integer
  marzbanNodeName: varchar(128)
  serverType: server_type_enum
  protocol: varchar(50)
  maxUsers: integer
  currentUsers: integer
  loadPercentage: decimal(5,2)
  totalBandwidthGb: bigint
  usedBandwidthGb: bigint
  status: server_status_enum
  isPublic: boolean
  priority: integer
  regionId: integer (FK → serverRegions)
  avgLatencyMs: integer
  lastHealthCheckAt: timestamp
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### Plans Table (`plans`)

```typescript
{
  id: serial (PK)
  name: varchar(64)
  nameFa: varchar(64)
  description: text
  descriptionFa: text
  planType: plan_type_enum
  durationDays: integer
  priceUsdCents: integer
  priceRial: bigint
  dataLimitGb: bigint
  deviceLimit: integer
  serverAccessType: server_access_type_enum
  allowedRegionIds: integer[]
  allowedServerIds: integer[]
  isActive: boolean
  isPublic: boolean
  isFeatured: boolean
  priority: integer
  maxTestAccountsPerUser: integer
  testDurationMinutes: integer
  usageAlertThreshold1: integer
  usageAlertThreshold2: integer
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### Subscriptions Table (`subscriptions`)

```typescript
{
  id: bigserial (PK)
  userId: bigint (FK → users)
  planId: integer (FK → plans)
  serverId: integer (FK → servers)
  regionId: integer (FK → serverRegions)
  status: subscription_status_enum
  startedAt: timestamp
  expiresAt: timestamp
  autoRenew: boolean
  lastRenewalAttemptAt: timestamp
  dataLimitGb: bigint
  usedDataGb: bigint
  resetDayOfMonth: integer
  deviceLimit: integer
  isGift: boolean
  giftCode: varchar(50) (FK → giftCodes)
  isReferralReward: boolean
  pricePaidCents: integer
  currency: varchar(3)
  paymentLogId: bigint (FK → paymentLogs)
  manualPaymentId: bigint (FK → manualPayments)
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### Manual Payments Table (`manual_payments`)

```typescript
{
  id: bigserial (PK)
  userId: bigint (FK → users)
  planId: integer (FK → plans)
  verifiedBy: bigint (FK → users)
  amountCents: integer
  currency: varchar(3)
  status: manual_payment_status_enum
  screenshotFileId: varchar(256)
  screenshotFileUniqueId: varchar(256)
  screenshotFilePath: varchar(512)
  screenshotMimeType: varchar(100)
  screenshotFileSizeBytes: integer
  paymentReference: varchar(256)
  userNote: text
  adminNote: text
  rejectionReason: text
  subscriptionId: bigint (FK → subscriptions)
  riskScore: decimal(3,2)
  ipAddress: varchar(45)
  screenshotReceivedAt: timestamp
  verifiedAt: timestamp
  expiresAt: timestamp
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### VPN Accounts Table (`vpn_accounts`)

```typescript
{
  id: bigserial (PK)
  userId: bigint (FK → users)
  serverId: integer (FK → servers)
  accountName: varchar(128)
  accountKey: varchar(256)
  marzbanUsername: varchar(64)
  marzbanToken: varchar(256)
  marzbanSubscriptionUrl: text
  status: vpn_account_status_enum
  dataLimitBytes: bigint
  usedDataBytes: bigint
  expiresAt: timestamp
  subscriptionId: bigint (FK → subscriptions)
  isTestAccount: boolean
  testAccountDurationMinutes: integer
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### Wallets Table (`wallets`)

```typescript
{
  id: bigserial (PK)
  userId: bigint (FK → users, unique)
  balanceCents: integer
  currency: varchar(3)
  creditLimitCents: integer
  frozenBalanceCents: integer
  isActive: boolean
  isFrozen: boolean
  freezeReason: text
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### Payment Logs Table (`payment_logs`) - REMOVED

> **NOTE:** This table was used for online payment providers (CryptoPay, NOWPayments, Stripe) which have been removed. The bot now uses only the manual payment system (`manual_payments` table).

```typescript
// REMOVED - No longer used
```

### 3.2 Enums

```typescript
// User enums
user_status_enum: 'active' | 'suspended' | 'banned' | 'deleted'
reseller_tier_enum: 'bronze' | 'silver' | 'gold' | 'platinum'

// Server enums
server_status_enum: 'active' | 'maintenance' | 'full' | 'offline'
server_type_enum: 'xray' | 'v2ray' | 'shadowsocks'

// VPN Account enums
vpn_account_status_enum: 'active' | 'disabled' | 'expired' | 'limited' | 'on_hold'

// Plan enums
plan_type_enum: 'monthly' | 'quarterly' | 'yearly' | 'lifetime' | 'test'
server_access_type_enum: 'all' | 'region' | 'specific'

// Subscription enums
subscription_status_enum: 'pending_payment' | 'active' | 'expired' | 'cancelled' | 'suspended' | 'renewing' | 'gift_claimed'

// Manual Payment enums
manual_payment_status_enum: 'awaiting_screenshot' | 'pending' | 'approved' | 'rejected' | 'expired'

// Payment enums (removed - using manual payment system only)
// payment_provider_enum: 'cryptopay' | 'nowpayments' | 'stripe' | 'wallet' (REMOVED)
// payment_status_enum: 'pending' | 'processing' | 'completed' | 'failed' | 'expired' | 'refunded' | 'chargeback' (REMOVED)

// Wallet enums
wallet_transaction_type_enum: 'credit' | 'debit' | 'refund' | 'chargeback' | 'referral_bonus' | 'reseller_commission' | 'gift_claim' | 'admin_adjustment' | 'test_deposit'

// Referral enums
referral_status_enum: 'pending' | 'completed' | 'expired' | 'fraud'

// Gift code enums
gift_code_status_enum: 'active' | 'expired' | 'depleted' | 'disabled'

// Test account enums
test_account_status_enum: 'active' | 'expired' | 'converted' | 'cancelled'
```

### 3.3 Database Indexes

The schema includes strategic indexes for performance:

```typescript
// Users
- idx_users_telegram_id (telegramId)
- idx_users_referral_code (referralCode)
- idx_users_referred_by (referredBy)
- idx_users_marzban_username (marzbanUsername)
- idx_users_status (status)
- idx_users_active (partial: status='active' AND isFlagged=false)

// Subscriptions
- idx_subscriptions_user_id (userId)
- idx_subscriptions_expires_at (expiresAt)
- idx_subscriptions_user_active (userId, status, expiresAt)
- idx_subscriptions_need_renewal (partial: status='active' AND autoRenew=true)

// VPN Accounts
- idx_vpn_accounts_user_server (userId, serverId)
- idx_vpn_accounts_active_expiring (userId, expiresAt, status)

// Manual Payments
- idx_manual_payments_user_id (userId)
- idx_manual_payments_plan_id (planId)
- idx_manual_payments_status (status)
- idx_manual_payments_verified_by (verifiedBy)
- idx_manual_payments_created_at (createdAt)
- idx_manual_payments_expires_at (expiresAt)
- idx_manual_payments_pending (id, userId, createdAt) WHERE status='pending' AND screenshot_file_id IS NOT NULL
```

---

## 4. Core Modules

### 4.1 Configuration Module (`src/config/index.ts`)

Validates and provides environment configuration using Zod.

**Environment Variables:**

| Category | Variables |
|----------|-----------|
| Application | `NODE_ENV`, `APP_NAME`, `APP_URL`, `API_PORT`, `LOG_LEVEL` |
| Database | `DATABASE_URL`, `DB_POOL_MIN`, `DB_POOL_MAX` |
| Redis | `REDIS_URL`, `REDIS_PASSWORD`, `REDIS_DB`, `REDIS_PREFIX` |
| Marzban | `MARZBAN_API_URL`, `MARZBAN_ADMIN_USERNAME`, `MARZBAN_ADMIN_PASSWORD` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_ADMIN_IDS` |
| JWT | `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` |
| Manual Payments | `ADMIN_CARD_NUMBER`, `ADMIN_CARD_HOLDER`, `MANUAL_PAYMENT_EXPIRY_HOURS`, `MAX_SCREENSHOT_SIZE_MB` |
| Rate Limiting | `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` |
| Workers | `CONCURRENCY_PAYMENT_WORKER`, `CONCURRENCY_MARZBAN_WORKER` |
| Features | `ENABLE_TEST_ACCOUNTS`, `ENABLE_GIFT_CODES`, `ENABLE_RESELLER_SYSTEM` |

### 4.2 Database Layer (`src/db/`)

**Connection (`index.ts`):**
```typescript
export const db = drizzle(postgres(connectionString), { schema })
export const client = postgres(connectionString, { max: 50 })
export function checkDatabaseHealth(): Promise<boolean>
export async function withTransaction<T>(callback): Promise<T>
```

**Pre-built Queries (`queries.ts`):**
```typescript
// User queries
userQueries.findByTelegramId(telegramId: number)
userQueries.findByReferralCode(code: string)
userQueries.getActiveCount()
userQueries.getPaginated(offset, limit)

// Server queries
serverQueries.getActive()
serverQueries.getPublicActive()
serverQueries.updateLoad(serverId, load)

// VPN Account queries
vpnAccountQueries.getByUserId(userId)
vpnAccountQueries.getActiveByUserId(userId)
vpnAccountQueries.getExpiringSoon()

// Subscription queries
subscriptionQueries.getActiveByUserId(userId)
subscriptionQueries.getExpiringSoon()
subscriptionQueries.updateUsage(subscriptionId, usedData)

// Manual Payment queries
manualPaymentQueries.create(payment: NewManualPayment)
manualPaymentQueries.findById(id: number)
manualPaymentQueries.getPending(limit: number, offset: number)
manualPaymentQueries.getPendingCount()
manualPaymentQueries.getByUserId(userId: number)
manualPaymentQueries.updateStatus(id, status)
manualPaymentQueries.attachScreenshot(id, screenshotData)
manualPaymentQueries.setVerifiedBy(id, adminId)
manualPaymentQueries.setSubscriptionId(id, subscriptionId)
```

### 4.3 Cache Layer (`src/cache/index.ts`)

**Cache Keys:**
```typescript
CacheKeys.SESSION(telegramId)
CacheKeys.USER(telegramId)
CacheKeys.MARZBAN_USER(username)
CacheKeys.PLANS_ACTIVE
CacheKeys.SERVERS_PUBLIC
CacheKeys.USER_SUBSCRIPTIONS(userId)
CacheKeys.WALLET(userId)
CacheKeys.MANUAL_PAYMENT_PENDING
CacheKeys.RATE_LIMIT(target, endpoint)
```

**Cache Service:**
```typescript
class CacheService {
  static async get<T>(key: string): Promise<T | null>
  static async set<T>(key, value, ttl?): Promise<boolean>
  static async del(key: string): Promise<boolean>
  static async delPattern(pattern: string): Promise<number>
  static async exists(key: string): Promise<boolean>
  static async incr(key: string): Promise<number>
  static async ttl(key: string): Promise<number>
}
```

**Distributed Lock:**
```typescript
class DistributedLock {
  static async acquire(resource, identifier, ttl): Promise<boolean>
  static async release(resource, identifier): Promise<boolean>
  static async extend(resource, identifier, ttl): Promise<boolean>
}
```

**Rate Limiter:**
```typescript
class RateLimiter {
  static async check(target, endpoint, maxRequests, windowSeconds): Promise<{allowed, remaining, resetAt}>
  static async checkWithBlock(target, endpoint, maxRequests, windowSeconds, blockDuration): Promise<{allowed, blocked, remaining, resetAt}>
  static async isBlocked(target, endpoint): Promise<boolean>
  static async reset(target, endpoint): Promise<void>
}
```

**Session Store:**
```typescript
class SessionStore {
  static async get<T>(telegramId: number): Promise<T | null>
  static async set<T>(telegramId, data, ttl?): Promise<boolean>
  static async updateField(telegramId, field, value, ttl?): Promise<boolean>
  static async delete(telegramId): Promise<boolean>
}
```

### 4.4 Marzban Integration (`src/marzban/index.ts`)

**Client Class:**
```typescript
class MarzbanClient {
  // Authentication
  async authenticate(): Promise<void>

  // User Operations
  async createUser(user: MarzbanUserCreate): Promise<MarzbanUserResponse>
  async getUser(username: string): Promise<MarzbanUserResponse>
  async updateUser(username, modifications): Promise<MarzbanUserResponse>
  async deleteUser(username): Promise<{detail: string}>
  async resetUserUsage(username): Promise<MarzbanUserResponse>
  async revokeUserSubscription(username): Promise<MarzbanUserResponse>

  // Listing
  async getUsers(options?): Promise<MarzbanUsersResponse>
  async getUserUsage(username, start?, end?): Promise<{usages, username}>
  async getAllUsersUsage(start?, end?, owner?): Promise<{usages}>
  async getExpiredUsers(options?): Promise<string[]>
  async deleteExpiredUsers(options?): Promise<string[]>

  // Subscription
  async getSubscriptionInfo(token): Promise<MarzbanSubscriptionUserResponse>
  async getSubscription(token, format): Promise<string>
  getSubscriptionUrl(token): string

  // Nodes
  async getNodes(): Promise<any[]>
  async getNodesUsage(): Promise<any>

  // Health
  async healthCheck(): Promise<boolean>
  getCircuitBreakerState()
  resetCircuitBreaker()
}
```

**Circuit Breaker Pattern:**
- Opens after 5 consecutive failures
- Stays open for 60 seconds
- Half-open state allows 3 attempts before closing again

**Retry Logic:**
- Exponential backoff: delay * 2^(attempt-1)
- Configurable retry attempts (default: 3)
- Skips retry on 4xx client errors

### 4.5 Services Layer

**User Service (`src/services/user.ts`):**
```typescript
// Create or update user
async function upsertUser(input: CreateUserInput): Promise<User>

// Find users
async function findByTelegramId(telegramId: number): Promise<User | null>
async function findByReferralCode(code: string): Promise<User | null>
async function findById(id: number): Promise<User | null>

// User operations
async function updateMarzbanUser(userId, marzbanUsername): Promise<User>
async function setStatus(userId, status): Promise<User>
async function updateLastActivity(userId): Promise<void>

// Trust score management
async function adjustTrustScore(userId, adjustment): Promise<User>

// Flag management
async function flagUser(userId, reason): Promise<User>
async function unflagUser(userId): Promise<User>

// Statistics
async function getUserCount(): Promise<number>
async function getActiveUserCount(): Promise<number>
```

**Subscription Service (`src/services/subscription.ts`):**
```typescript
// Create subscription
async function createSubscription(user, input): Promise<SubscriptionResponse>

// Renew subscription
async function renewSubscription(user, subscriptionId): Promise<SubscriptionResponse>

// Cancel subscription
async function cancelSubscription(user, subscriptionId): Promise<void>

// Get subscriptions
async function getSubscriptionsNeedingRenewal(daysThreshold): Promise<Subscription[]>

// Promo codes
async function applyPromoCode(code, planId): Promise<{valid, message, discountCents}>
```

**Manual Payment Service (`src/services/manual-payment.ts`):**
```typescript
// Create manual payment request
async function createManualPayment(input: CreateManualPaymentInput): Promise<ManualPaymentResponse>
// Input: { userId, planId, amountCents, currency, ipAddress }
// Output: { success, message, payment, plan, paymentInstructions }

// Attach screenshot to payment
async function attachPaymentScreenshot(input: AttachScreenshotInput): Promise<PaymentResponse>
// Input: { paymentId, fileId, fileUniqueId, filePath, mimeType, fileSize }
// Output: { success, message, payment }

// Verify payment (approve/reject)
async function verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResponse>
// Input: { paymentId, adminId, approved, adminNote, rejectionReason }
// Output: { success, message, payment, subscription }

// Set payment reference (transaction ID)
async function setPaymentReference(paymentId: number, reference: string): Promise<PaymentResponse>

// Cancel manual payment
async function cancelManualPayment(paymentId: number): Promise<PaymentResponse>

// Get pending payments
async function getPendingManualPayments(limit: number, offset: number): Promise<PendingPaymentData[]>

// Get pending payment count
async function getPendingPaymentCount(): Promise<number>

// Get user manual payments
async function getUserManualPayments(userId: number): Promise<ManualPayment[]>

// Check expired payments
async function checkExpiredPayments(): Promise<number>

// Create subscription for approved payment
async function createSubscriptionForPayment(payment: ManualPayment): Promise<SubscriptionResponse>
```

**Wallet Service (`src/services/wallet.ts`):**
```typescript
// Get wallet
async function getWalletByUserId(userId): Promise<Wallet | null>

// Create wallet
async function createWallet(userId, currency): Promise<Wallet>

// Credit (add funds)
async function credit(userId, amountCents, referenceType?, referenceId?, description?, isManual?, adminId?): Promise<Transaction>

// Debit (spend funds)
async function debit(walletId, amountCents, referenceType?, referenceId?, description?): Promise<Transaction>

// Add funds (admin)
async function addFunds(userId, amountCents, description, isManual?, adminId?): Promise<Transaction>

// Transfer funds
async function transferFunds(fromUserId, toUserId, amountCents, description?): Promise<{fromTransaction, toTransaction}>

// Freeze/unfreeze wallet
async function freezeWallet(walletId, reason): Promise<Wallet>
async function unfreezeWallet(walletId): Promise<Wallet>

// Freeze/unfreeze funds
async function freezeFunds(walletId, amountCents, reason?): Promise<boolean>
async function unfreezeFunds(walletId, amountCents): Promise<boolean>

// Transaction history
async function getTransactions(walletId, limit?, offset?, type?, status?): Promise<Transaction[]>

// Statistics
async function getWalletStats(walletId): Promise<{totalCredits, totalDebits, netAmount, transactionCount}>
```

---

## 5. API Endpoints

### 5.1 Health Check (`src/routes/health.ts`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic health check |
| `/health/detailed` | GET | Detailed health with all services |
| `/ready` | GET | Readiness check |
| `/live` | GET | Liveness check |

**Response Example:**
```json
{
  "status": "healthy",
  "checks": {
    "server": "ok",
    "database": true,
    "redis": true,
    "marzban": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 5.2 Webhooks (`src/routes/webhooks.ts`)

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/webhooks/telegram/:token` | POST | Telegram bot updates | Token validation |
| `/webhooks/marzban/user-expired` | POST | Marzban expiration notification | - |

### 5.3 REST API (`src/routes/api/`)

**Users (`/api/users`):**
```typescript
GET    /api/users/me              // Get current user
GET    /api/users/:telegramId     // Get user by Telegram ID (admin)
PUT    /api/users/me              // Update profile
GET    /api/users/me/referrals    // Get user's referrals
GET    /api/users/me/devices      // Get user's devices
POST   /api/users/me/devices/:deviceId/disconnect  // Disconnect device
```

**Subscriptions (`/api/subscriptions`):**
```typescript
GET    /api/subscriptions         // Get user subscriptions
GET    /api/subscriptions/:id     // Get by ID
POST   /api/subscriptions         // Create subscription
POST   /api/subscriptions/:id/renew    // Renew subscription
POST   /api/subscriptions/:id/cancel   // Cancel subscription
PUT    /api/subscriptions/:id/auto-renew  // Update auto-renew
```

**Manual Payments (`/api/payments`):**
```typescript
// User endpoints
POST   /api/payments              // Create manual payment
GET    /api/payments/:id          // Get payment details
GET    /api/payments              // Get user's payment history
GET    /api/payments/:id/status   // Check payment status (for polling)
POST   /api/payments/:id/reference  // Set transaction ID
POST   /api/payments/:id/cancel   // Cancel payment

// Admin endpoints
GET    /api/payments/admin/pending       // Get pending payments
GET    /api/payments/admin/pending/count // Get pending count
POST   /api/payments/admin/:id/verify   // Approve/reject payment
GET    /api/payments/admin/:id          // Get payment details (admin)
```

**Wallet (`/api/wallet`):**
```typescript
GET    /api/wallet                // Get wallet
GET    /api/wallet/transactions   // Transaction history
POST   /api/wallet/funds          // Add funds (admin)
POST   /api/wallet/transfer       // Transfer funds
```

**Servers (`/api/servers`):**
```typescript
GET    /api/servers               // Get public servers
GET    /api/servers/:id           // Get by ID
GET    /api/servers/region/:regionId  // Get by region
GET    /api/servers/regions       // Get all regions
```

**Plans (`/api/plans`):**
```typescript
GET    /api/plans                 // Get plans
GET    /api/plans/:id             // Get by ID
POST   /api/plans/validate-promo  // Validate promo code
POST   /api/plans/calculate-price // Calculate price with promo
```

---

## 6. Telegram Bot Integration

### 6.1 Bot Setup (`src/bot/index.ts`)

**Initialization:**
```typescript
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN)

// Middleware
bot.use(autoRetry({ maxRetryAttempts: 3 }))
bot.use(hydrateReply)
bot.use(session({ initial, getSessionKey, storage }))
```

**Bot Commands:**
```typescript
// User commands
/start      - Start bot / handle referral link
/help       - Show help message
/plans      - Browse available plans
/mysub      - View my subscriptions
/profile    - View profile and settings
/referral   - Get referral link
/gift       - Claim gift code
/test       - Get test account

// Admin commands
/admin      - Admin panel
/verify_payment <id> - Verify payment
/payments   - View all payments
```

**Bot Session:**
```typescript
interface BotSession {
  state?: string                    // Current state in flow
  selectedPlan?: number             // Selected plan ID
  selectedServer?: number           // Selected server ID
  pendingPaymentId?: number         // Pending manual payment ID
  awaitingReference?: boolean       // Awaiting transaction ID input
  awaitingRejectionReason?: boolean // Awaiting rejection reason (admin)
  rejectingPaymentId?: number       // Payment being rejected
  language?: string                 // User language
  marzbanUsername?: string          // Marzban username
}
```

### 6.2 Bot Handlers (`src/bot/handlers/`)

**Start Handler (`start.ts`):**
- Creates or updates user record
- Handles referral code from `/start REFERRAL_CODE`
- Displays welcome message with main menu
- Notifies admins of new user registration

**Plans Handler (`plans.ts`):**
- Displays available plans with pagination
- Shows featured plans
- Creates manual payment on plan selection

**Subscriptions Handler (`subscriptions.ts`):**
- Lists user's active subscriptions
- Shows subscription details
- Handles renewal and cancellation

**Payment Handler (`payment.ts`):**
- Creates manual payment request
- Shows admin's card number and payment amount
- Handles screenshot uploads
- Sends payment reference (transaction ID)
- Notifies admins when screenshot is received
```typescript
async function handleCreateManualPayment(ctx: BotContext, planId: number)
async function handleScreenshotUpload(ctx: BotContext)
async function handlePaymentReferenceInput(ctx: BotContext, text: string): Promise<boolean>
```

**Admin Handler (`admin.ts`):**
- Admin panel for payment management
- View pending payments
- Verify/approve/reject payments
- Display payment details with screenshots
```typescript
async function adminHandler(ctx: BotContext)
async function handleVerifyPaymentCommand(ctx: BotContext, paymentIdStr: string)
async function handleApprovePayment(ctx: BotContext, paymentId: number)
async function handleRejectPayment(ctx: BotContext, paymentId: number)
async function handlePaymentRejectionReason(ctx: BotContext, reason: string): Promise<boolean>
```

**Profile Handler (`profile.ts`):**
- Shows user profile
- Displays VPN keys/credentials
- Shows wallet balance

**Gift Handler (`gift.ts`):**
- Claims gift code
- Views claimed gifts
- Validates gift code restrictions

**Test Account Handler (`test-account.ts`):**
- Creates test account
- Converts test to subscription
- Lists test accounts

**Referral Handler (`referral.ts`):**
- Displays referral link
- Shows referral statistics
- Tracks referrals

### 6.3 Bot Callback Queries

```
// Plans
plans:page:{number}        - Browse plans page
payment:create:{planId}    - Create payment for plan

// Subscriptions
mysub:list                 - List subscriptions
mysub:detail:{id}          - Subscription details

// Admin
admin:payments:pending     - View pending payments
admin:payments:view:{id}   - View payment details
admin:payment:approve:{id} - Approve payment
admin:payment:reject:{id}  - Reject payment

// Other
profile:view               - View profile
gift:claim                 - Claim gift code
test:create                - Create test account
referral:view              - View referral stats
menu:main                  - Return to main menu
```

### 6.4 Message Handlers

**Photo Messages:**
```typescript
bot.on('msg:photo', async (ctx) => {
  // Check if user has pending payment
  const pendingPaymentId = ctx.session.pendingPaymentId
  if (pendingPaymentId) {
    await handleScreenshotUpload(ctx)
  }
})
```

**Text Messages:**
```typescript
bot.on('msg:text', async (ctx) => {
  // Check if awaiting rejection reason (admin)
  const rejectionHandled = await handlePaymentRejectionReason(ctx, text)
  if (rejectionHandled) return

  // Check if awaiting payment reference (user)
  const handled = await handlePaymentReferenceInput(ctx, text)
  if (handled) return
})
```

---

## 7. Background Workers

### 7.1 BullMQ Setup (`src/workers/index.ts`)

**Queues:**
```typescript
export const paymentQueue = new Queue('payments', { concurrency: 5 })
export const marzbanQueue = new Queue('marzban-sync', { concurrency: 10 })
export const notificationQueue = new Queue('notifications', { concurrency: 20 })
export const scheduledQueue = new Queue('scheduled', { concurrency: 3 })
export const maintenanceQueue = new Queue('maintenance', { concurrency: 1 })
```

**Job Types:**

```typescript
// Manual Payment jobs
interface ManualPaymentJobData {
  type: 'check_expired' | 'notify_admin' | 'process_verification'
  paymentId: number
  userId: number
}

// Marzban sync jobs
interface MarzbanJobData {
  type: 'create_user' | 'update_user' | 'delete_user' | 'reset_usage' | 'sync_usage'
  userId?: number
  vpnAccountId?: number
  subscriptionId?: number
  username?: string
}

// Notification jobs
interface NotificationJobData {
  type: 'telegram' | 'email'
  userId: number
  title: string
  message: string
  parseMode?: string
}

// Scheduled jobs
interface ScheduledJobData {
  type: 'check_expired_subscriptions' | 'sync_all_usage' | 'check_expired_manual_payments' |
        'cleanup_expired_cache' | 'generate_daily_reports' | 'reset_user_usage'
}
```

### 7.2 Scheduled Jobs

| Schedule | Job | Description |
|----------|-----|-------------|
| `0 * * * *` | check_expired_subscriptions | Check expiring subscriptions (hourly) |
| `*/10 * * * *` | check_expired_manual_payments | Check expired manual payments (every 10 min) |
| `*/5 * * *` | sync_all_usage | Sync usage from Marzban (every 5 minutes) |
| `0 3 * * *` | cleanup_expired_cache | Clean cache (daily at 3 AM) |
| `0 0 * * *` | reset_user_usage | Reset usage counters (midnight) |
| `0 0 * * *` | generate_daily_reports | Daily reports (midnight) |

---

## 8. GraphQL API

### 8.1 Setup (`src/graphql/index.ts`)

```typescript
const schema = makeExecutableSchema({
  typeDefs,
  resolvers
})

export const { yoga, handleRequest } = createYoga({
  schema,
  context: async ({ request }) => await createContext(request),
  graphiql: process.env.GRAPHQL_PLAYGROUND === 'true',
  cors: { origin: ['http://localhost:3000'], credentials: true }
})
```

### 8.2 Context (`src/graphql/context.ts`)

```typescript
interface Context {
  user?: User
  isAdmin?: boolean
  requestId?: string
  ipAddress?: string
  userAgent?: string
}

async function createContext(request: Request): Promise<Context>
async function authenticateUser(context: Context, telegramId: number): Promise<User | null>
```

---

## 9. Security & Authentication

### 9.1 Authentication Middleware (`src/middleware/auth.ts`)

```typescript
// Extract user from JWT token
export const authMiddleware: MiddlewareHandler

// Require authenticated user (401 if not)
export const requireAuth: MiddlewareHandler

// Require admin access (403 if not)
export const requireAdmin: MiddlewareHandler
```

### 9.2 Rate Limiting (`src/middleware/rate-limit.ts`)

**Limits:**
- Default: 30 requests per 60 seconds
- Admin: 100 requests per 60 seconds
- Webhooks: 100 requests per 60 seconds

**Rate Limit Headers:**
```http
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 1704067200
```

### 9.3 Payment Security

**Manual Payment Security:**
- Screenshot file size validation (max 10MB)
- Screenshot MIME type validation (jpg, png, webp)
- Payment expiry (default 24 hours)
- Admin-only verification
- Audit trail for all verifications
- IP address logging
- Risk score tracking

---

## 10. Deployment

### 10.1 Environment Variables

**Required Variables:**
```bash
# Application
NODE_ENV=production
APP_URL=https://your-domain.com
API_PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Redis
REDIS_URL=redis://host:6379

# Marzban
MARZBAN_API_URL=https://marzban.example.com
MARZBAN_ADMIN_USERNAME=admin
MARZBAN_ADMIN_PASSWORD=password

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhooks/telegram/TOKEN
TELEGRAM_ADMIN_IDS=123456789,987654321

# JWT
JWT_SECRET=your-secret-key-min-32-chars

# Manual Payments
ADMIN_CARD_NUMBER=1234567890123456
ADMIN_CARD_HOLDER=Admin Name
MANUAL_PAYMENT_EXPIRY_HOURS=24
MAX_SCREENSHOT_SIZE_MB=10
```

### 10.2 Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer                        │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
┌───────▼────┐  ┌─────▼─────┐  ┌───▼──────┐
│  Instance 1 │  │ Instance 2│  │ Instance 3│
│             │  │           │  │          │
│  - Hono     │  │  - Hono   │  │  - Hono  │
│  - Bot      │  │  - Bot    │  │  - Bot   │
│  - Workers  │  │  - Workers│  │  - Workers│
└──────┬──────┘  └─────┬─────┘  └───┬───────┘
       │               │             │
       └───────────────┼─────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼────┐  ┌─────▼─────┐  ┌─────▼─────┐
│ PostgreSQL │  │  Redis    │  │  Marzban  │
│  (Primary) │  │  (Cluster)│  │  (Panel)  │
└────────────┘  └───────────┘  └───────────┘
```

### 10.3 Docker Deployment

```dockerfile
# Dockerfile example
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: vpn_bot
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass

  redis:
    image: redis:7-alpine
```

---

## Appendix A: File Structure

```
src/
├── index.ts                        # Hono app entry point
├── config/
│   └── index.ts                    # Environment config
├── db/
│   ├── index.ts                    # Drizzle connection
│   ├── schema/
│   │   ├── index.ts                # Schema export
│   │   ├── enums.ts                # PostgreSQL enums
│   │   ├── users.ts                # Users table
│   │   ├── regions.ts              # Server regions
│   │   ├── servers.ts              # VPN servers
│   │   ├── manual-payments.ts      # Manual payments table
│   │   ├── vpn-accounts.ts         # VPN credentials
│   │   ├── plans.ts                # Subscription plans
│   │   ├── subscriptions.ts        # User subscriptions
│   │   ├── wallets.ts              # User wallets
│   │   ├── wallet-transactions.ts  # Wallet transactions
│   │   ├── payments.ts             # Payment logs (removed - used for online payments)
│   │   ├── referrals.ts            # Referral tracking
│   │   ├── gift-codes.ts           # Gift codes
│   │   ├── resellers.ts            # Reseller accounts
│   │   ├── devices.ts              # Connected devices
│   │   ├── test-accounts.ts        # Test accounts
│   │   ├── usage-alerts.ts         # Usage alerts
│   │   ├── promo-codes.ts          # Promo codes
│   │   ├── feature-usage.ts        # Feature usage
│   │   ├── sessions.ts             # User sessions
│   │   ├── rate-limits.ts          # Rate limit tracking
│   │   ├── audit-logs.ts           # Audit logs
│   │   └── feature-flags.ts        # Feature flags
│   └── queries.ts                  # Pre-built queries
├── cache/
│   └── index.ts                    # Redis client & utilities
├── marzban/
│   └── index.ts                    # Marzban API client
├── bot/
│   ├── index.ts                    # Bot setup
│   ├── handlers/
│   │   ├── start.ts                # Start command
│   │   ├── help.ts                 # Help command
│   │   ├── plans.ts                # Plans browsing
│   │   ├── subscriptions.ts        # Subscriptions
│   │   ├── payment.ts              # Manual payment handling
│   │   ├── admin.ts                # Admin verification
│   │   ├── profile.ts              # Profile view
│   │   ├── gift.ts                 # Gift codes
│   │   ├── test-account.ts         # Test accounts
│   │   └── referral.ts             # Referral program
│   └── utils/
│       ├── subscription.ts         # Subscription helpers
│       └── profile.ts              # Profile helpers
├── services/
│   ├── user.ts                     # User service
│   ├── subscription.ts             # Subscription service
│   ├── manual-payment.ts           # Manual payment service
│   └── wallet.ts                   # Wallet service
├── routes/
│   ├── api/
│   │   ├── index.ts                # API router
│   │   ├── users.ts                # User routes
│   │   ├── subscriptions.ts        # Subscription routes
│   │   ├── payments.ts             # Manual payment routes
│   │   ├── wallets.ts              # Wallet routes
│   │   ├── servers.ts              # Server routes
│   │   └── plans.ts                # Plan routes
│   ├── health.ts                   # Health check
│   └── webhooks.ts                 # Webhook handlers
├── middleware/
│   ├── auth.ts                     # Authentication
│   └── rate-limit.ts               # Rate limiting
├── graphql/
│   ├── index.ts                    # GraphQL server
│   ├── context.ts                  # GraphQL context
│   ├── types.ts                    # GraphQL types
│   └── resolvers/
│       ├── index.ts
│       ├── user.ts
│       ├── server.ts
│       ├── plan.ts
│       ├── subscription.ts
│       ├── wallet.ts
│       └── payment.ts
└── workers/
    ├── index.ts                    # BullMQ setup
    └── payment-worker.ts           # Payment processor
```

---

## Appendix B: Database Migration Guide

### Creating Migrations

```bash
# Generate migration from schema changes
npm run db:generate

# Run migrations
npm run db:migrate

# Rollback migration
npm run db:rollback
```

### Manual Payment Migration

```sql
-- Create manual_payment_status enum
CREATE TYPE manual_payment_status AS ENUM (
  'pending',
  'awaiting_screenshot',
  'approved',
  'rejected',
  'expired'
);

-- Create manual_payments table
CREATE TABLE manual_payments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  verified_by BIGINT REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status manual_payment_status NOT NULL DEFAULT 'awaiting_screenshot',
  screenshot_file_id VARCHAR(256),
  screenshot_file_unique_id VARCHAR(256) NOT NULL,
  screenshot_file_path VARCHAR(512),
  screenshot_mime_type VARCHAR(100),
  screenshot_file_size_bytes INTEGER,
  payment_reference VARCHAR(256),
  user_note TEXT,
  admin_note TEXT,
  rejection_reason TEXT,
  subscription_id BIGINT REFERENCES subscriptions(id),
  risk_score DECIMAL(3,2) DEFAULT 0,
  ip_address VARCHAR(45),
  screenshot_received_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_manual_payments_user_id ON manual_payments(user_id);
CREATE INDEX idx_manual_payments_plan_id ON manual_payments(plan_id);
CREATE INDEX idx_manual_payments_status ON manual_payments(status);
CREATE INDEX idx_manual_payments_verified_by ON manual_payments(verified_by);
CREATE INDEX idx_manual_payments_created_at ON manual_payments(created_at);
CREATE INDEX idx_manual_payments_expires_at ON manual_payments(expires_at);
CREATE INDEX idx_manual_payments_pending ON manual_payments(id, user_id, created_at)
  WHERE status = 'pending' AND screenshot_file_id IS NOT NULL;
```

### Seed Data

```bash
# Seed initial data (plans, servers, etc.)
npm run db:seed
```

---

## Appendix C: Troubleshooting

### Common Issues

1. **Marzban Connection Failed**
   - Check `MARZBAN_API_URL` is correct
   - Verify admin credentials
   - Check circuit breaker state

2. **Manual Payment Screenshot Not Uploading**
   - Check file size (max 10MB by default)
   - Check file type (only jpg, png, webp)
   - Verify user has pending payment in session

3. **Admin Not Receiving Payment Notifications**
   - Check `TELEGRAM_ADMIN_IDS` in config
   - Verify admin hasn't blocked the bot
   - Check bot has permission to message admins

4. **Subscription Not Created After Approval**
   - Check Marzban API connection
   - Verify server availability
   - Review logs for errors

5. **Rate Limiting Too Aggressive**
   - Adjust `RATE_LIMIT_MAX_REQUESTS`
   - Increase `RATE_LIMIT_WINDOW_MS`
   - Check IP configuration behind proxy

6. **Redis Connection Issues**
   - Verify `REDIS_URL` format
   - Check Redis server status
   - Review connection pool settings

---

*Document Version: 2.0.0*
*Last Updated: 2025-01-15*
*Changes: Added Manual Payment System with Admin Verification*
