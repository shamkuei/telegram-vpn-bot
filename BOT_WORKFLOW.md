# Telegram VPN Bot - How It Works

This document explains the complete workflow, architecture, and data flow of the Telegram VPN Bot.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Bot Initialization](#bot-initialization)
3. [User Flows](#user-flows)
4. [Wallet System](#wallet-system)
5. [Payment Flow](#payment-flow)
6. [Purchase Flow](#purchase-flow)
7. [Admin Flow](#admin-flow)
8. [Marzban Integration](#marzban-integration)
9. [Database Schema](#database-schema)
10. [Key Services](#key-services)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Telegram User                                │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Telegram Bot API                               │
│                    (Grammy Framework)                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                       Bot Index                               │  │
│  │  - Command Handlers (/start, /plans, /wallet, etc.)          │  │
│  │  - Callback Query Handlers (button clicks)                   │  │
│  │  - Message Handlers (photos, text)                           │  │
│  │  - Session Management (in-memory)                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   Handlers    │    │   Services    │    │    Queries    │
│               │    │               │    │               │
│ - start.ts    │    │ - user.ts     │    │ - PostgreSQL │
│ - plans.ts    │◄───┤ - wallet.ts   │───►│   (Drizzle)  │
│ - wallet.ts   │    │ - wallet-     │    │               │
│ - payment.ts  │    │   recharge.ts │    └───────────────┘
│ - admin.ts    │    │ - wallet-     │              │
│ - profile.ts  │    │   purchase.ts │              ▼
└───────────────┘    └───────────────┘    ┌───────────────────────────────┐
                                              │          Database             │
                                              │  - users                      │
                                              │  - wallets                    │
                                              │  - wallet_transactions        │
                                              │  - wallet_recharge_requests   │
                                              │  - plans                      │
                                              │  - subscriptions              │
                                              │  - vpn_accounts               │
                                              └───────────────────────────────┘

        ┌───────────────────────────────────────────────┐
        │         Marzban Client (src/marzban/)         │
        │  - createUser()                               │
        │  - getUser()                                  │
        │  - updateUser()                               │
        │  - deleteUser()                               │
        └───────────────┬───────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │      Marzban Panel API        │
        │   (VPN Management System)    │
        └───────────────────────────────┘
```

---

## Bot Initialization

**File:** `src/bot/index.ts`

### 1. Bot Setup

```typescript
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN)
```

### 2. Middleware Configuration

| Middleware | Purpose |
|------------|---------|
| `autoRetry` | Automatically retry failed API requests (3 attempts, max 60s delay) |
| `session` | In-memory session storage for user state |

### 3. Session Structure

```typescript
interface BotSession {
  state?: string                          // Current state in flow
  selectedPlan?: number                   // Plan user wants to buy
  selectedServer?: number                 // Server user selected
  pendingPaymentId?: number               // Payment awaiting screenshot
  pendingRechargeId?: number              // Wallet recharge awaiting screenshot
  awaitingReference?: boolean             // Waiting for transaction ID
  awaitingRechargeReference?: boolean     // Waiting for recharge transaction ID
  awaitingRechargeAmount?: boolean        // Waiting for recharge amount input
  awaitingRejectionReason?: boolean       // Admin waiting to type reason
  awaitingRechargeRejectionReason?: boolean // Admin waiting for recharge rejection
  rejectingPaymentId?: number             // Payment ID admin is rejecting
  rejectingRechargeId?: number            // Recharge ID admin is rejecting
  language?: string                       // User's language preference
  marzbanUsername?: string                // User's Marzban username
}
```

### 4. Handler Registration

```typescript
// Commands
bot.command('start', startHandler)
bot.command('plans', plansHandler)
bot.command('wallet', walletHandler)
bot.command('mysub', mySubscriptionsHandler)
bot.command('profile', profileHandler)
bot.command('gift', giftHandler)
bot.command('test', testAccountHandler)
bot.command('referral', referralHandler)

// Admin Commands
bot.command('admin', adminHandler)
bot.command('verify_payment', adminHandler)
bot.command('payments', adminHandler)
bot.command('recharge', adminHandler)

// Callback Queries (button clicks)
bot.callbackQuery(/^plans:(?!confirm)/, plansHandler)
bot.callbackQuery(/^plans:confirm:/, handleConfirmPurchase)
bot.callbackQuery(/^wallet:/, walletHandler)
bot.callbackQuery(/^payment:/, paymentHandler)
bot.callbackQuery(/^admin:/, adminHandler)

// Message Handlers
bot.on('msg:photo', async (ctx) => {
  // Check for wallet recharge screenshot first
  if (ctx.session.pendingRechargeId) {
    await handleWalletScreenshotUpload(ctx)
  }
  // Then check for payment screenshot
  else if (ctx.session.pendingPaymentId) {
    await handleScreenshotUpload(ctx)
  }
})
bot.on('msg:text', handleTextInput)  // Amount, reference, reason input
```

---

## User Flows

### 1. Start Flow (`/start`)

**File:** `src/bot/handlers/start.ts`

```
User sends: /start
        │
        ▼
1. Check if user exists in database
        │
        ├─── NO ──► Create new user record
        │                 │
        │                 ▼
        │          Create wallet for user
        │                 │
        │                 ▼
        │          Set welcome message
        │
        └─── YES ──► Welcome back message
                        │
                        ▼
              Show main menu with buttons:
              - 📦 View Plans
              - 💰 Wallet
              - 📋 My Subscriptions
              - 👤 Profile
              - 🎁 Gift Code
              - 🧪 Test Account
```

### 2. View Plans Flow (`/plans`)

**File:** `src/bot/handlers/plans.ts`

```
User sends: /plans
        │
        ▼
1. Query: planQueries.getActivePublic()
        │
        ▼
2. Get user wallet balance
        │
        ▼
3. Display plans (5 per page) with:
   - Current wallet balance
   - Plan affordability indicator (✅/❌)
        │
        └──► Each plan has: "🛒 Buy {Plan Name}" button
                  │
                  ├─── Can afford ──► "🛒 Buy {Plan Name}"
                  │
                  └─── Cannot afford ──► "💰 Buy {Plan Name} (Top-up required)"
                              │
                              ▼
                        Callback: plans:buy:{planId}
```

### 3. Profile Flow (`/profile`)

**File:** `src/bot/handlers/profile.ts`

```
User sends: /profile
        │
        ▼
1. Get user from database
        │
        ▼
2. Display:
        - Name
        - Telegram ID
        - Join Date
        - Active Subscriptions Count
        - Wallet Balance
        - Referral Code
```

---

## Wallet System

**Files:** `src/bot/handlers/wallet.ts`, `src/services/wallet.ts`

### Wallet Structure

```
┌─────────────────────────────────────┐
│           User Wallet               │
├─────────────────────────────────────┤
│  Balance: $50.00                    │
│  Frozen: $0.00                      │
│  Available: $50.00                  │
│  Currency: USD                      │
│  Status: Active                     │
└─────────────────────────────────────┘
```

### Wallet Commands

| Command | Description |
|---------|-------------|
| `/wallet` | View balance, recharge, history |

### Wallet Operations

```typescript
// Get wallet
await getWalletByUserId(userId)

// Credit wallet (add funds)
await credit(userId, amountCents, referenceType, referenceId, description)

// Debit wallet (spend funds)
await debit(walletId, amountCents, referenceType, referenceId, description)

// Get balance
await getUserWalletBalance(userId)
// Returns: { balanceCents, frozenBalanceCents, availableBalanceCents, ... }
```

---

## Payment Flow

**Wallet Recharge with Admin Verification**

### Files Involved

| File | Purpose |
|------|---------|
| `src/bot/handlers/wallet.ts` | Bot UI for wallet recharge |
| `src/services/wallet-recharge.ts` | Recharge business logic |
| `src/bot/handlers/admin.ts` | Admin verification UI |

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER                                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
                    1. Click "Top Up Wallet"
                    (wallet:recharge)
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  WALLET RECHARGE HANDLER (src/bot/handlers/wallet.ts)              │
│                                                                     │
│  1. Set session.awaitingRechargeAmount = true                      │
│  2. Prompt: "Enter amount to recharge"                             │
│     - Minimum: $1.00                                               │
│     - Maximum: $1000.00                                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
                    2. User enters amount
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CREATE RECHARGE REQUEST                                            │
│                                                                     │
│  1. Call: walletRechargeService.createWalletRecharge()             │
│     - Creates recharge request with status: 'awaiting_screenshot'  │
│  2. Store rechargeId in session: ctx.session.pendingRechargeId    │
│  3. Display payment instructions:                                  │
│     ┌─────────────────────────────────────────────────────────┐    │
│     │  💳 Wallet Recharge Instructions                        │    │
│     │                                                         │    │
│     │  Amount: $50.00                                        │    │
│     │                                                         │    │
│     │  Card Number: 1234-5678-9012-3456                      │    │
│     │  Card Holder: Admin Name                               │    │
│     │  Reference: WR-456                                     │    │
│     │                                                         │    │
│     │  ⏰ Please send payment within 24 hours                │    │
│     │  📸 Upload screenshot after payment                    │    │
│     └─────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
                    3. User makes payment
                             │
                             ▼
                    4. User sends screenshot
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SCREENSHOT UPLOAD HANDLER                                         │
│  (bot.on('msg:photo', handleWalletScreenshotUpload))               │
│                                                                     │
│  1. Check: ctx.session.pendingRechargeId exists                   │
│  2. Validate: file type (jpg, png, webp)                          │
│  3. Validate: file size (max 10MB)                                │
│  4. Call: walletRechargeService.attachRechargeScreenshot()         │
│     - Stores file_id, file_path                                   │
│     - Changes status to: 'pending'                                │
│  5. Clear session.pendingRechargeId                               │
│  6. Reply: "✅ Screenshot received. Pending verification."        │
│  7. NOTIFY ADMINS (via bot API)                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         ADMIN                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
                    5. Admin clicks notification
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ADMIN HANDLER (src/bot/handlers/admin.ts)                         │
│                                                                     │
│  1. Display recharge details with screenshot                       │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │  🔍 Wallet Recharge Verification                        │       │
│  │                                                         │       │
│  │  Request ID: WR-456                                     │       │
│  │  User: John Doe (@johndoe)                              │       │
│  │  Amount: $50.00                                         │       │
│  │  Reference: WR-456                                      │       │
│  │                                                         │       │
│  │  [📸 Screenshot displayed]                              │       │
│  │                                                         │       │
│  │  Buttons:                                               │       │
│  │  [✅ Approve]  [❌ Reject]                              │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                     │
│  2. Admin clicks [✅ Approve] or [❌ Reject]                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  VERIFICATION SERVICE (src/services/wallet-recharge.ts)            │
│                                                                     │
│  verifyRecharge({ requestId, approved, adminId, ... })             │
│       │                                                             │
│       ├─── APPROVED ──►                                            │
│       │    1. Credit user's wallet                                 │
│       │    2. Create wallet transaction record                     │
│       │    3. Update request status: 'approved'                   │
│       │    4. Notify USER: "Recharge approved! 🎉"                │
│       │                                                              │
│       └─── REJECTED ──►                                            │
│            1. Update request status: 'rejected'                    │
│            2. Store rejectionReason                                │
│            3. Notify USER: "Recharge rejected. Reason: ..."       │
└─────────────────────────────────────────────────────────────────────┘
```

### Recharge Status Lifecycle

```
awaiting_screenshot ──► pending ──► approved
        │                    │
        │                    └───► rejected
        │
        └───► expired (after 24 hours)
```

---

## Purchase Flow

**Wallet-Based Plan Purchase**

### Files Involved

| File | Purpose |
|------|---------|
| `src/bot/handlers/plans.ts` | Bot UI for purchase |
| `src/services/wallet-purchase.ts` | Purchase business logic |

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER                                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
                    1. Click "Buy Plan" button
                    (plans:buy:{planId})
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PLANS HANDLER (src/bot/handlers/plans.ts)                         │
│                                                                     │
│  1. Get plan details                                               │
│  2. Get user wallet balance                                        │
│  3. Validate: walletPurchaseService.validateWalletBalance()        │
│     ┌─────────────────────────────────────────────────────────┐    │
│     │  Returns: { valid, currentBalance, requiredAmount, ... }│    │
│     └─────────────────────────────────────────────────────────┘    │
│                                                                     │
│     ├─── VALID ──►                                                 │
│     │    Show confirmation with:                                  │
│     │    - Plan details                                           │
│     │    - Price: $10.00                                          │
│     │    - Current balance: $50.00                                │
│     │    - Remaining: $40.00                                      │
│     │    [✅ Confirm Purchase] [❌ Cancel]                         │
│     │                                                              │
│     └─── INVALID ──►                                               │
│          Show error with:                                         │
│          - Required: $10.00                                       │
│          - Available: $5.00                                       │
│          - [💰 Top Up Wallet] [📦 Browse Plans]                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼ (if valid)
                    2. User confirms purchase
                    (plans:confirm:{planId})
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PURCHASE SERVICE (src/services/wallet-purchase.ts)                │
│                                                                     │
│  purchaseWithWallet({ userId, planId, serverId })                  │
│       │                                                             │
│       ▼                                                             │
│  1. Validate wallet balance (within transaction)                   │
│  2. Debit wallet: debit(walletId, amountCents, ...)               │
│     ┌─────────────────────────────────────────────────────────┐    │
│     │  - Creates wallet_transactions record                    │    │
│     │  - Type: 'debit'                                        │    │
│     │  - Reference: 'subscription_purchase'                   │    │
│     └─────────────────────────────────────────────────────────┘    │
│  3. Select best server                                             │
│  4. Create subscription record                                     │
│  5. Create Marzban VPN user                                        │
│  6. Create VPN account record                                      │
│  7. Notify USER: "✅ Purchase Successful! 🎉"                     │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
                    3. User receives subscription
                             │
                             ▼
                    4. User can now connect to VPN
```

### Balance Validation Logic

```typescript
// Available balance = Total balance - Frozen balance
const availableBalance = wallet.balanceCents - wallet.frozenBalanceCents

// Can purchase?
const canAfford = availableBalance >= plan.priceUsdCents
```

---

## Admin Flow

### Admin Commands

| Command | Description |
|---------|-------------|
| `/admin` | Open admin panel - shows pending counts |
| `/payments` | View payment verification panel |
| `/recharge <id>` | Review specific recharge request |
| `/verify_payment <id>` | Verify specific payment |

### Admin Panel Flow

```
/admin
        │
        ▼
┌─────────────────────────────────────┐
│  🔧 Admin Panel                     │
│                                     │
│  Pending Payments: 5                │
│  Pending Recharges: 3               │
│                                     │
│  [📋 Pending Payments]              │
│  [💰 Pending Recharges]             │
│  [📊 All Payments]                  │
└─────────────────────────────────────┘
        │
        ├─── Click [📋 Pending Payments]
        │    │
        │    ▼
        │   Show payment verification queue
        │
        └─── Click [💰 Pending Recharges]
             │
             ▼
┌─────────────────────────────────────┐
│  💰 Pending Wallet Recharges        │
│                                     │
│  1. WR-456                          │
│     User: John                      │
│     Amount: $50.00                  │
│     [View #456]                     │
│                                     │
│  2. WR-457                          │
│     User: Jane                      │
│     Amount: $25.00                  │
│     [View #457]                     │
└─────────────────────────────────────┘
```

### Admin Recharge Approval

```
View Recharge #456
        │
        ▼
┌─────────────────────────────────────┐
│  🔍 Recharge Verification           │
│                                     │
│  Request ID: WR-456                 │
│  User: John Doe (@johndoe)          │
│  Amount: $50.00                     │
│  Reference: WR-456                  │
│                                     │
│  [📸 Screenshot displayed]          │
│                                     │
│  [✅ Approve]  [❌ Reject]          │
└─────────────────────────────────────┘
        │
        ├─── Approve ──► Wallet credited
        │                  User notified
        │
        └─── Reject ───► Enter reason
                             │
                             ▼
                        Status: rejected
                        User notified with reason
```

---

## Marzban Integration

**File:** `src/marzban/index.ts`

The Marzban client handles all VPN user management operations.

### Marzban Client Features

| Feature | Description |
|---------|-------------|
| **Circuit Breaker** | Prevents cascading failures - opens after 5 failures |
| **Auto Retry** | Retries failed requests up to 3 times with exponential backoff |
| **Token Management** | Auto-refreshes authentication token (~55 min expiry) |

### Marzban Operations

```typescript
// Authentication
await marzban.authenticate()  // Uses admin credentials

// User Operations
await marzban.createUser({
  username: 'user_123_1234567890',
  status: 'active',
  expire: 1735689600,  // Unix timestamp
  data_limit: 107374182400,  // 100GB in bytes
  data_limit_reset_strategy: 'no_reset',
  proxies: { vmess: {}, vless: {} },
  inbounds: { vmess: ['node1'], vless: ['node1'] }
})

await marzban.getUser(username)
await marzban.updateUser(username, modifications)
await marzban.deleteUser(username)
await marzban.resetUserUsage(username)
```

### When is Marzban Called?

| Event | Marzban Operation |
|-------|------------------|
| Plan purchased with wallet | `createUser()` - Create new VPN user |
| Subscription renewed | `updateUser()` - Extend expiry date |
| Subscription cancelled | `updateUser()` - Set status to 'disabled' |
| User requests links | `getSubscriptionUrl()` - Get subscription URL |

---

## Database Schema

### Core Tables

#### `users` - User Accounts
```sql
- id (PK)
- telegram_id (unique)
- telegram_first_name
- telegram_last_name
- telegram_username
- marzban_username
- referral_code
- created_at
```

#### `wallets` - User Wallets
```sql
- id (PK)
- user_id (unique, FK → users.id)
- balance_cents (default: 0)
- currency (default: 'USD')
- credit_limit_cents (default: 0)
- frozen_balance_cents (default: 0)
- is_active (default: true)
- is_frozen (default: false)
- freeze_reason
- created_at
- updated_at
```

#### `wallet_transactions` - Wallet Transaction History
```sql
- id (PK)
- wallet_id (FK → wallets.id)
- type (credit, debit, refund, etc.)
- amount_cents
- balance_before_cents
- balance_after_cents
- reference_type
- reference_id
- description
- status (pending, completed, failed, reversed)
- is_manual (default: false)
- admin_id (FK → users.id)
- admin_note
- created_at
```

#### `wallet_recharge_requests` - Wallet Top-up Requests
```sql
- id (PK)
- user_id (FK → users.id)
- verified_by (FK → users.id)
- amount_cents
- currency
- status (awaiting_screenshot, pending, approved, rejected, expired)
- screenshot_file_id
- screenshot_file_unique_id
- payment_reference
- user_note
- admin_note
- rejection_reason
- wallet_transaction_id
- ip_address
- risk_score
- screenshot_received_at
- verified_at
- expires_at
- created_at
- updated_at
```

#### `plans` - Subscription Plans
```sql
- id (PK)
- name, name_fa
- description, description_fa
- plan_type (monthly, quarterly, yearly, lifetime, test)
- duration_days
- price_usd_cents
- price_rial
- data_limit_gb
- device_limit
- is_active, is_public, is_featured
- priority
```

#### `manual_payments` - Payment Records (Legacy - kept for compatibility)
```sql
- id (PK)
- user_id (FK)
- plan_id (FK)
- subscription_id (FK, nullable)
- amount_cents
- currency
- status (awaiting_screenshot, pending, approved, rejected, expired)
- screenshot_file_id
- payment_reference
- user_note
- verified_by (admin_id)
- verified_at
- rejection_reason
- admin_note
- expires_at
```

#### `subscriptions` - Active Subscriptions
```sql
- id (PK)
- user_id (FK)
- plan_id (FK)
- server_id (FK)
- status (active, expired, cancelled)
- started_at
- expires_at
- auto_renew
- data_limit_gb
- used_data_gb
- device_limit
- price_paid_cents
- payment_log_id (FK → wallet_transactions.id)
```

#### `vpn_accounts` - VPN Credentials
```sql
- id (PK)
- user_id (FK)
- server_id (FK)
- subscription_id (FK)
- account_name
- account_key
- marzban_username
- marzban_token
- marzban_subscription_url
- status
- data_limit_bytes
- used_data_bytes
- expires_at
```

---

## Key Services

### 1. Wallet Service

**File:** `src/services/wallet.ts`

```typescript
// Get wallet
await getWalletByUserId(userId)

// Create wallet
await createWallet(userId, currency)

// Credit (add funds)
await credit(userId, amountCents, referenceType, referenceId, description)

// Debit (spend funds)
await debit(walletId, amountCents, referenceType, referenceId, description)

// Get balance
await getUserWalletBalance(userId)
// Returns: { balanceCents, frozenBalanceCents, availableBalanceCents, ... }
```

### 2. Wallet Recharge Service

**File:** `src/services/wallet-recharge.ts`

```typescript
// Create recharge request
walletRechargeService.createWalletRecharge({
  userId,
  amountCents,
  currency,
  ipAddress,
  userNote
})

// Attach screenshot
walletRechargeService.attachRechargeScreenshot(
  requestId, fileId, fileUniqueId, filePath, mimeType, fileSize
)

// Admin verification
walletRechargeService.verifyRecharge({
  requestId,
  adminId,
  approved: true/false,
  adminNote,
  rejectionReason
})
```

### 3. Wallet Purchase Service

**File:** `src/services/wallet-purchase.ts`

```typescript
// Purchase with wallet
walletPurchaseService.purchaseWithWallet({
  userId,
  planId,
  serverId
})

// Validate balance
walletPurchaseService.validateWalletBalance(userId, planId)
// Returns: { valid, currentBalance, requiredAmount, message }
```

### 4. Manual Payment Service (Legacy)

**File:** `src/services/manual-payment.ts`

```typescript
// Create payment request
manualPaymentService.createManualPayment({
  userId,
  planId,
  amountCents,
  currency,
  userNote
})

// Attach screenshot
manualPaymentService.attachPaymentScreenshot(
  paymentId, fileId, fileUniqueId, filePath, mimeType, fileSize
)

// Admin verification
manualPaymentService.verifyPayment({
  paymentId,
  adminId,
  approved: true/false,
  adminNote,
  rejectionReason
})
```

### 5. Database Queries

**File:** `src/db/queries.ts`

Pre-built queries for common operations:

```typescript
// Wallet
walletQueries.getByUserId(userId)
walletQueries.create(userId, currency)

// Wallet Recharge
walletRechargeQueries.findById(id)
walletRechargeQueries.getPending(limit, offset)
walletRechargeQueries.getPendingCount()
walletRechargeQueries.getByUserId(userId)

// Plans
planQueries.getActivePublic()
planQueries.getFeatured()
planQueries.findById(id)
planQueries.getByType(type)

// Manual Payments
manualPaymentQueries.findById(id)
manualPaymentQueries.getPending(limit, offset)
manualPaymentQueries.getPendingCount()
```

---

## Configuration

### Required Environment Variables

```env
# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_ADMIN_IDS=123456789,987654321

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/vpn_bot

# Marzban
MARZBAN_API_URL=https://marzban.example.com
MARZBAN_ADMIN_USERNAME=admin
MARZBAN_ADMIN_PASSWORD=password

# Manual Payment (for wallet recharge)
ADMIN_CARD_NUMBER=1234567890123456
ADMIN_CARD_HOLDER=Admin Name
MANUAL_PAYMENT_EXPIRY_HOURS=24
MAX_SCREENSHOT_SIZE_MB=10

# Wallet Recharge
MIN_WALLET_RECHARGE_CENTS=100          # Minimum $1.00
MAX_WALLET_RECHARGE_CENTS=100000       # Maximum $1000.00
WALLET_RECHARGE_EXPIRY_HOURS=24        # Request expiry

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key-min-32-chars
```

---

## Error Handling

### Bot Error Handler

```typescript
bot.catch((err) => {
  if (err instanceof GrammyError) {
    // Telegram API error - retry or notify
    err.ctx.reply('⚠️ An error occurred. Please try again.')
  } else {
    // Unexpected error - log and notify
    err.ctx.reply('⚠️ Unexpected error. Team notified.')
  }
})
```

### Marzban Circuit Breaker

```typescript
// Opens after 5 consecutive failures
// Stays open for 60 seconds
// Enters half-open mode for testing recovery
```

### Wallet Error Handling

```typescript
// Insufficient balance
{
  success: false,
  message: "Insufficient wallet balance. Required: $10.00, Available: $5.00",
  insufficientBalance: true,
  currentBalance: 500,
  requiredAmount: 1000
}

// Wallet frozen
{
  success: false,
  message: "Your wallet is frozen. Reason: Suspicious activity"
}

// Wallet inactive
{
  success: false,
  message: "Your wallet is currently inactive. Please contact support."
}
```

---

## Summary

### How a User Gets a VPN Subscription (New Flow)

1. **User starts bot** → `/start` → Creates user and wallet
2. **User tops up wallet** (if needed):
   - `/wallet` → "Top Up Wallet"
   - Enter amount → Get payment instructions
   - Pay to card → Upload screenshot
   - Admin approves → Wallet credited
3. **User views plans** → `/plans` → Selects plan
4. **User confirms purchase** → Balance validated and deducted
5. **Subscription created**:
   - Subscription record created
   - Marzban user created
   - VPN account record created
   - User notified with subscription details
6. **User gets VPN link** → Can connect to VPN

### Payment vs Purchase Flow

| Aspect | Payment Flow (Legacy) | Purchase Flow (Current) |
|--------|----------------------|-------------------------|
| Purpose | Direct plan purchase | Wallet top-up |
| Creates | Subscription | Wallet credit |
| Admin action | Creates VPN account | Credits wallet |
| Table | `manual_payments` | `wallet_recharge_requests` |
| Status after approval | `approved` + subscription | `approved` + transaction |

### File Locations Reference

| Component | File Path |
|-----------|-----------|
| Bot Entry | `src/bot/index.ts` |
| Command Handlers | `src/bot/handlers/*.ts` |
| Wallet Handler | `src/bot/handlers/wallet.ts` |
| Plans Handler | `src/bot/handlers/plans.ts` |
| Wallet Service | `src/services/wallet.ts` |
| Wallet Recharge Service | `src/services/wallet-recharge.ts` |
| Wallet Purchase Service | `src/services/wallet-purchase.ts` |
| Manual Payment Service | `src/services/manual-payment.ts` |
| Subscription Service | `src/services/subscription.ts` |
| Marzban Client | `src/marzban/index.ts` |
| Database Queries | `src/db/queries.ts` |
| Schema Definitions | `src/db/schema/*.ts` |
| API Routes | `src/routes/api/*.ts` |
| Migration File | `migrations/0001_create_wallet_recharge_requests.sql` |
