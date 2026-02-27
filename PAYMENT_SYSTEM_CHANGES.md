# Payment System Changes - Wallet-Based Purchases

This document describes the changes made to the payment system to implement wallet-based purchases with manual wallet recharge.

## Overview

The payment system has been restructured to:
1. Use wallet balance for all purchases (no direct payment gateway during checkout)
2. Implement manual wallet top-up via card payment with screenshot verification
3. Admin approval workflow for wallet recharge requests

## New Features

### 1. Wallet-Based Purchases
- Users can now purchase subscriptions using their wallet balance
- Balance is validated before purchase
- Insufficient balance shows error with top-up option

### 2. Manual Wallet Recharge
- Users initiate wallet recharge by entering an amount
- Bot displays payment instructions (card number, amount, reference)
- Users upload payment screenshot as proof
- Admins review and approve/reject recharge requests
- Upon approval, wallet balance is automatically credited

### 3. Admin Approval Workflow
- Admins can view pending recharge requests
- Review screenshots and payment details
- Approve (credits wallet) or reject (with reason)
- All actions are logged with admin ID

## Database Changes

### New Table: `wallet_recharge_requests`

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | Primary key |
| user_id | BIGINT | Foreign key to users |
| verified_by | BIGINT | Admin who verified |
| amount_cents | INTEGER | Recharge amount in cents |
| currency | VARCHAR(3) | Currency code (USD) |
| status | ENUM | pending, awaiting_screenshot, approved, rejected, expired |
| screenshot_file_id | VARCHAR(256) | Telegram file ID |
| screenshot_file_unique_id | VARCHAR(256) | Telegram unique file ID |
| screenshot_file_path | VARCHAR(512) | File path |
| screenshot_mime_type | VARCHAR(100) | MIME type |
| screenshot_file_size_bytes | INTEGER | File size |
| payment_reference | VARCHAR(256) | User's transaction ID |
| user_note | TEXT | User's note |
| admin_note | TEXT | Admin's note |
| rejection_reason | TEXT | Reason for rejection |
| wallet_transaction_id | BIGINT | Resulting transaction ID |
| ip_address | VARCHAR(45) | User IP |
| risk_score | DECIMAL(3,2) | Fraud risk score |
| screenshot_received_at | TIMESTAMP | Screenshot upload time |
| verified_at | TIMESTAMP | Verification time |
| expires_at | TIMESTAMP | Request expiry time |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update time |

### New Enum: `wallet_recharge_status`
- `pending` - Awaiting admin verification (screenshot uploaded)
- `awaiting_screenshot` - Screenshot not yet uploaded
- `approved` - Approved and wallet credited
- `rejected` - Rejected by admin
- `expired` - Request expired

## New Files Created

### Database Schema
- `/src/db/schema/wallet-recharge-requests.ts` - Wallet recharge requests table definition
- Updated `/src/db/schema/enums.ts` - Added wallet_recharge_status enum
- Updated `/src/db/schema/index.ts` - Exported new table

### Services
- `/src/services/wallet-recharge.ts` - Wallet recharge service (create, verify, attach screenshot)
- `/src/services/wallet-purchase.ts` - Wallet purchase service (buy plans with balance)

### Bot Handlers
- `/src/bot/handlers/wallet.ts` - Wallet bot handlers (balance, recharge, history)

### Database Queries
- Updated `/src/db/queries.ts` - Added walletRechargeQueries

### Migrations
- `/migrations/0001_create_wallet_recharge_requests.sql` - SQL migration script

## Modified Files

### Bot Core
- `/src/bot/index.ts` - Added wallet command, callback handlers, text handlers

### Bot Handlers
- `/src/bot/handlers/plans.ts` - Updated to use wallet balance for purchases
- `/src/bot/handlers/admin.ts` - Added wallet recharge approval workflow

## User Commands

### `/wallet` - Wallet Menu
Shows wallet balance with options to:
- 💰 Top Up Wallet - Start recharge process
- 📜 Recharge History - View past recharge requests
- 🏠 Main Menu

### `/plans` - View Plans (Updated)
Now shows:
- Current wallet balance
- Plan availability based on balance (✅ can afford / ❌ top-up required)
- Direct purchase from wallet balance

## Admin Commands

### `/recharge <id>` - Review Recharge Request
View and approve/reject a specific wallet recharge request.

### `/admin` or `/payments` - Admin Panel
Access to:
- 📋 Pending Payments (subscription purchases)
- 📋 Pending Recharges (wallet top-ups)

## New Environment Variables (Optional)

```bash
# Wallet Recharge Configuration
MIN_WALLET_RECHARGE_CENTS=100          # Minimum $1.00 recharge
MAX_WALLET_RECHARGE_CENTS=100000       # Maximum $1000.00 recharge
WALLET_RECHARGE_EXPIRY_HOURS=24        # Request expiry time
```

## Purchase Flow

### Before (Direct Payment):
1. User selects plan → Payment request created
2. User pays to card → Uploads screenshot
3. Admin approves → Subscription created

### After (Wallet-Based):
1. User tops up wallet (optional):
   - Enters amount → Pays to card → Uploads screenshot
   - Admin approves → Wallet credited
2. User selects plan → Balance checked
3. Purchase confirmed → Balance deducted → Subscription created

## Wallet Recharge Flow

1. User clicks "Top Up Wallet"
2. Enters amount (min $1, max $1000)
3. Bot shows payment instructions (card, amount, reference)
4. User sends money to card
5. User uploads payment screenshot
6. Admins notified
7. Admin reviews and approves/rejects
8. If approved: Wallet credited automatically
9. User notified of result

## Security Features

- All wallet transactions logged in `wallet_transactions` table
- Admin approval requires admin ID recording
- Screenshot validation (file type, size)
- Request expiry to prevent stale requests
- IP address and risk score tracking

## Error Handling

- Insufficient balance: Shows current balance and required amount
- Invalid amount: Validates min/max recharge amounts
- Screenshot validation: File type and size checks
- Request expiry: Auto-expires pending requests

## Migration Steps

1. Run the migration SQL to create the new table:
   ```bash
   psql -U your_user -d your_database -f migrations/0001_create_wallet_recharge_requests.sql
   ```

2. Or use Drizzle Kit to generate and apply migrations:
   ```bash
   npm run db:generate  # Generate migration
   npm run db:migrate   # Apply migration
   ```

3. Restart the bot to load new handlers and services

## Testing Checklist

- [ ] User can view wallet balance
- [ ] User can initiate wallet recharge
- [ ] Payment instructions display correctly
- [ ] Screenshot upload works
- [ ] Admin receives recharge notifications
- [ ] Admin can approve recharge (wallet credited)
- [ ] Admin can reject recharge (with reason)
- [ ] User notified of approval/rejection
- [ ] Purchase validates balance correctly
- [ ] Insufficient balance shows error
- [ ] Successful purchase deducts balance
- [ ] Recharge history displays correctly
