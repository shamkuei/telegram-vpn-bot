# Telegram VPN Bot - How It Works

This document explains the complete workflow, architecture, and data flow of the Telegram VPN Bot.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Bot Initialization](#bot-initialization)
3. [User Flows](#user-flows)
4. [Payment Flow](#payment-flow)
5. [Admin Flow](#admin-flow)
6. [Marzban Integration](#marzban-integration)
7. [Database Schema](#database-schema)
8. [Key Services](#key-services)

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
│  │  - Command Handlers (/start, /plans, /mysub, etc.)           │  │
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
│ - plans.ts    │◄───┤ - subscription│───►│   (Drizzle)  │
│ - payment.ts  │    │   .ts         │    │               │
│ - admin.ts    │    │ - manual-     │    └───────────────┘
│ - profile.ts  │    │   payment.ts  │              │
└───────────────┘    └───────────────┘              │
                                                    ▼
                                    ┌───────────────────────────────┐
                                    │          Database             │
                                    │  - users                      │
                                    │  - plans                      │
                                    │  - subscriptions              │
                                    │  - manual_payments            │
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
  state?: string                      // Current state in flow
  selectedPlan?: number               // Plan user wants to buy
  selectedServer?: number             // Server user selected
  pendingPaymentId?: number           // Payment awaiting screenshot
  awaitingReference?: boolean         // Waiting for transaction ID
  awaitingRejectionReason?: boolean   // Admin waiting to type reason
  rejectingPaymentId?: number         // Payment ID admin is rejecting
  language?: string                   // User's language preference
  marzbanUsername?: string            // User's Marzban username
}
```

### 4. Handler Registration

```typescript
// Commands
bot.command('start', startHandler)
bot.command('plans', plansHandler)
bot.command('mysub', mySubscriptionsHandler)
bot.command('profile', profileHandler)
bot.command('gift', giftHandler)
bot.command('test', testAccountHandler)
bot.command('referral', referralHandler)

// Admin Commands
bot.command('admin', adminHandler)
bot.command('verify_payment', adminHandler)
bot.command('payments', adminHandler)

// Callback Queries (button clicks)
bot.callbackQuery(/^plans:/, plansHandler)
bot.callbackQuery(/^payment:/, paymentHandler)
bot.callbackQuery(/^admin:/, adminHandler)

// Message Handlers
bot.on('msg:photo', handleScreenshotUpload)   // Screenshot upload
bot.on('msg:text', handleTextInput)            // Reference/reason input
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
        │          Set welcome message
        │
        └─── YES ──► Welcome back message
                        │
                        ▼
              Show main menu with buttons:
              - 📦 View Plans
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
2. Display plans (5 per page)
        │
        └──► Each plan has: "🛒 Buy {Plan Name}" button
                  │
                  ▼
            Callback: payment:create:{planId}
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

## Payment Flow

**The core business logic - Manual Payment with Admin Verification**

### Files Involved

| File | Purpose |
|------|---------|
| `src/bot/handlers/payment.ts` | Bot UI for payment flow |
| `src/services/manual-payment.ts` | Payment business logic |
| `src/bot/handlers/admin.ts` | Admin verification UI |

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER                                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
                    1. Click "Buy Plan" button
                    (payment:create:{planId})
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PAYMENT HANDLER (src/bot/handlers/payment.ts)                     │
│                                                                     │
│  1. Get plan details                                               │
│  2. Call: manualPaymentService.createManualPayment()               │
│     - Creates payment record with status: 'awaiting_screenshot'    │
│  3. Store paymentId in session: ctx.session.pendingPaymentId      │
│  4. Display payment instructions:                                  │
│     ┌─────────────────────────────────────────────────────────┐    │
│     │  💳 Payment Instructions                               │    │
│     │                                                         │    │
│     │  Card Number: 1234-5678-9012-3456                      │    │
│     │  Card Holder: Admin Name                               │    │
│     │  Amount: $10.00                                        │    │
│     │  Reference: MP-123                                     │    │
│     │                                                         │    │
│     │  ⏰ Please send payment within 24 hours                │    │
│     │  📸 Upload screenshot after payment                    │    │
│     └─────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
                    2. User makes payment
                             │
                             ▼
                    3. User sends screenshot
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SCREENSHOT UPLOAD HANDLER                                         │
│  (bot.on('msg:photo', handleScreenshotUpload))                     │
│                                                                     │
│  1. Check: ctx.session.pendingPaymentId exists                     │
│  2. Validate: file type (jpg, png, webp)                          │
│  3. Validate: file size (max 10MB)                                │
│  4. Call: manualPaymentService.attachPaymentScreenshot()           │
│     - Stores file_id, file_path                                   │
│     - Changes status to: 'pending'                                │
│  5. Clear session.pendingPaymentId                                │
│  6. Reply: "✅ Screenshot received. Pending verification."         │
│  7. NOTIFY ADMINS (via bot API)                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         ADMIN                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
                    4. Admin clicks notification
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ADMIN HANDLER (src/bot/handlers/admin.ts)                         │
│                                                                     │
│  1. Display payment details with screenshot                        │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │  🔍 Payment Verification                               │       │
│  │                                                         │       │
│  │  Payment ID: 123                                        │       │
│  │  User: John Doe (@johndoe)                             │       │
│  │  Plan: Monthly Plan                                    │       │
│  │  Amount: $10.00                                        │       │
│  │  Reference: MP-123                                     │       │
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
│  VERIFICATION SERVICE (src/services/manual-payment.ts)             │
│                                                                     │
│  verifyPayment({ paymentId, approved, adminId, ... })              │
│       │                                                             │
│       ├─── APPROVED ──►                                            │
│       │    1. Create subscription                                  │
│       │    2. Create Marzban user                                  │
│       │    3. Create VPN account record                            │
│       │    4. Update payment status: 'approved'                   │
│       │    5. Notify USER: "Payment approved! 🎉"                 │
│       │                                                              │
│       └─── REJECTED ──►                                            │
│            1. Update payment status: 'rejected'                    │
│            2. Store rejectionReason                                │
│            3. Notify USER: "Payment rejected. Reason: ..."        │
└─────────────────────────────────────────────────────────────────────┘
```

### Payment Status Lifecycle

```
awaiting_screenshot ──► pending ──► approved
        │                    │
        │                    └───► rejected
        │
        └───► expired (after 24 hours)
```

---

## Admin Flow

### Admin Commands

| Command | Description |
|---------|-------------|
| `/admin` | Open admin panel - shows pending payment count |
| `/payments` | View all payments |
| `/verify_payment <id>` | Directly verify a specific payment |

### Admin Panel Flow

```
/admin
        │
        ▼
┌─────────────────────────────────────┐
│  🔧 Admin Panel - Manual Payments   │
│                                     │
│  Pending Verifications: 5           │
│                                     │
│  [📋 Pending Payments]              │
│  [📊 All Payments]                  │
│  [🔢 Payment Status]                │
└─────────────────────────────────────┘
        │
        ▼
Click [📋 Pending Payments]
        │
        ▼
┌─────────────────────────────────────┐
│  📋 Pending Payments (5 total)      │
│                                     │
│  1. ID: 123                         │
│     User: John                      │
│     Plan: Monthly                   │
│     Amount: $10.00                  │
│     [View #123]                     │
│                                     │
│  2. ID: 124                         │
│     ...
└─────────────────────────────────────┘
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
| Payment approved | `createUser()` - Create new VPN user |
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
- wallet_balance_cents
- created_at
```

#### `plans` - Subscription Plans
```sql
- id (PK)
- name, name_fa
- description, description_fa
- plan_type (standard, premium, trial)
- duration_days
- price_usd_cents
- price_rial
- data_limit_gb
- device_limit
- is_active, is_public, is_featured
- priority
```

#### `manual_payments` - Payment Records
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

### 1. Manual Payment Service

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

### 2. Subscription Service

**File:** `src/services/subscription.ts`

```typescript
// Create new subscription
subscriptionService.createSubscription(user, {
  planId,
  serverId,
  autoRenew,
  paymentMethod,
  promoCode
})

// Renew existing
subscriptionService.renewSubscription(user, subscriptionId)

// Cancel
subscriptionService.cancelSubscription(user, subscriptionId)
```

### 3. Database Queries

**File:** `src/db/queries.ts`

Pre-built queries for common operations:

```typescript
// Plans
planQueries.getActivePublic()
planQueries.getFeatured()
planQueries.findById(id)
planQueries.getByType(type)

// Manual Payments
manualPaymentQueries.findById(id)
manualPaymentQueries.getByUserId(userId)
manualPaymentQueries.getPending(limit, offset)
manualPaymentQueries.getPendingCount()
manualPaymentQueries.attachScreenshot(...)
manualPaymentQueries.setPaymentReference(...)
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

# Manual Payment
ADMIN_CARD_NUMBER=1234567890123456
ADMIN_CARD_HOLDER=Admin Name
MANUAL_PAYMENT_EXPIRY_HOURS=24
MAX_SCREENSHOT_SIZE_MB=10

# Redis
REDIS_URL=redis://localhost:6379
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

---

## Summary

### How a User Gets a VPN Subscription

1. **User starts bot** → `/start` → Creates user record
2. **User views plans** → `/plans` → Selects plan
3. **User initiates payment** → Gets card number and amount
4. **User pays and uploads screenshot** → Payment status: `pending`
5. **Admin verifies payment** → Approves/Rejects
6. **If approved:**
   - Subscription record created
   - Marzban user created
   - VPN account record created
   - User notified with subscription details
7. **User gets VPN link** → Can connect to VPN

### File Locations Reference

| Component | File Path |
|-----------|-----------|
| Bot Entry | `src/bot/index.ts` |
| Command Handlers | `src/bot/handlers/*.ts` |
| Payment Service | `src/services/manual-payment.ts` |
| Subscription Service | `src/services/subscription.ts` |
| Marzban Client | `src/marzban/index.ts` |
| Database Queries | `src/db/queries.ts` |
| Schema Definitions | `src/db/schema/*.ts` |
| API Routes | `src/routes/api/*.ts` |
