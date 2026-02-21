# Telegram VPN Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)

A production-ready Telegram bot for automated VPN subscription sales, management, and user support. Integrates with [Marzban](https://github.com/Gozargah/Marzban) for VPN account provisioning and supports **manual payment verification with admin approval**.

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Development](#development)
- [Production Deployment](#production-deployment)
- [Bot Commands](#bot-commands)
- [API Documentation](#api-documentation)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features

### User Features

| Feature | Description |
|---------|-------------|
| **Telegram Bot Interface** | Intuitive bot commands for VPN subscription management |
| **Manual Payment System** | Admin-verified card payments with screenshot upload |
| **Subscription Management** | Multiple plan types (monthly, quarterly, yearly, lifetime, test) |
| **Server Selection** | Multi-region VPN server support with smart load balancing |
| **Referral System** | User referral program with reward distribution |
| **Gift Codes** | Promotional gift code generation and redemption |
| **Test Accounts** | Free trial account generation for new users |
| **Multi-language** | English and Persian language support |
| **Payment Status Tracking** | Real-time payment verification status |

### Admin Features

| Feature | Description |
|---------|-------------|
| **Manual Payment Verification** | Review screenshots and approve/reject payments |
| **Payment Management** | View all pending payments with details |
| **User Notifications** | Automatic user notifications on payment approval/rejection |
| **Reseller System** | Multi-tier reseller accounts (Bronze, Silver, Gold, Platinum) |
| **Promo Codes** | Discount and promotional code management |
| **Feature Flags** | Dynamic feature toggling without deployment |
| **Usage Alerts** | Smart usage threshold notifications |
| **Audit Logging** | Complete audit trail for compliance |
| **Rate Limiting** | Configurable rate limits per endpoint |
| **Monitoring** | Health checks, metrics, and logging |

### Payment Flow

The bot uses a **manual payment system with admin verification**:

1. User selects a plan via `/plans` command
2. Bot displays admin's card number and payment amount
3. User sends money to the specified card
4. User uploads payment screenshot via the bot
5. Admin receives notification with screenshot
6. Admin verifies and approves/rejects the payment
7. Subscription is automatically created upon approval
8. User receives notification with subscription details

## Architecture Overview

```mermaid
graph TB
    subgraph "Presentation Layer"
        TG[Telegram Bot<br/>Grammy]
        API[REST API<br/>Hono]
    end

    subgraph "Business Logic Layer"
        SVC[Services]
        MW[Middleware]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL<br/>Drizzle ORM]
        REDIS[(Redis<br/>Cache + Queue)]
        MARZBAN[Marzban API]
    end

    TG --> SVC
    API --> SVC
    SVC --> PG
    SVC --> REDIS
    SVC --> MARZBAN
```

The application follows a **layered architecture** with clear separation of concerns:

1. **Presentation Layer** - Handles user interaction via Telegram bot and REST API
2. **Business Logic Layer** - Services, middleware, and background workers
3. **Data Access Layer** - PostgreSQL, Redis cache, and external Marzban API

## Tech Stack

### Core Technologies

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | 20+ |
| Language | TypeScript | 5.7+ |
| Package Manager | pnpm | 9.15+ |
| Build Tool | tsup | 8.3+ |

### Framework & Libraries

| Layer | Library | Purpose |
|-------|---------|---------|
| HTTP Framework | Hono 4.6+ | Lightweight, edge-compatible web framework |
| Telegram Bot | Grammy 1.36+ | TypeScript Telegram bot framework |
| Database ORM | Drizzle ORM 0.38+ | Type-safe SQL ORM |
| Cache/Queue | BullMQ 5.29+ | Redis-based job queue |
| GraphQL | GraphQL Yoga 5.10+ | Apollo Federation-ready server |
| Validation | Zod 3.24+ | Runtime type validation |

## Prerequisites

Before installing, ensure you have the following:

- **Node.js** >= 20.0.0 ([Download](https://nodejs.org/))
- **pnpm** >= 9.0.0 (`npm install -g pnpm`)
- **PostgreSQL** database (14+ recommended)
- **Redis** server (6+ recommended)
- **Marzban** instance ([Installation Guide](https://github.com/Gozargah/Marzban#install))
- **Telegram Bot Token** from [@BotFather](https://t.me/botfather)

## Quick Start

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd telegram-vpn-bot

# Install dependencies
pnpm install
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit with your configuration
nano .env
```

### 3. Database Setup

```bash
# Push database schema
pnpm db:push

# Optional: Open Drizzle Studio (database GUI)
pnpm db:studio
```

### 4. Start Development Server

```bash
pnpm dev
```

The application will start on `http://localhost:3000`

## Configuration

### Required Environment Variables

```env
# Application
NODE_ENV=development
APP_URL=http://localhost:3000
API_PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/vpn_bot
DB_POOL_MIN=5
DB_POOL_MAX=50

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_PREFIX=vpn_bot:

# Telegram Bot
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234...
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook
TELEGRAM_ADMIN_IDS=123456789,987654321

# Marzban Panel
MARZBAN_API_URL=https://your-marzban-panel.com
MARZBAN_ADMIN_USERNAME=admin
MARZBAN_ADMIN_PASSWORD=your_password

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=7d
```

### Manual Payment Configuration

```env
# Admin's card details for payments
ADMIN_CARD_NUMBER=1234567890123456
ADMIN_CARD_HOLDER=Admin Name

# Payment expiry time (in hours)
MANUAL_PAYMENT_EXPIRY_HOURS=24

# Maximum screenshot size (in MB)
MAX_SCREENSHOT_SIZE_MB=10
```

### Feature Flags

```env
ENABLE_TEST_ACCOUNTS=true
ENABLE_GIFT_CODES=true
ENABLE_RESELLER_SYSTEM=true
ENABLE_REFERRAL_SYSTEM=true
ENABLE_SMART_ALERTS=true
```

### Worker Concurrency

```env
CONCURRENCY_PAYMENT_WORKER=5
CONCURRENCY_MARZBAN_WORKER=10
CONCURRENCY_NOTIFICATION_WORKER=20
CONCURRENCY_SCHEDULED_WORKER=3
```

## Development

### Available Scripts

```bash
# Development
pnpm dev              # Start development server with hot reload
pnpm type-check       # Run TypeScript type checking
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix linting issues automatically
pnpm format           # Format code with Prettier

# Building
pnpm build            # Build for production (outputs to dist/)

# Running (production)
pnpm start            # Start main server
pnpm start:bot        # Start bot only
pnpm start:workers    # Start background workers only

# Database
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Apply migrations
pnpm db:push          # Push schema changes (development only)
pnpm db:studio        # Open Drizzle Studio (DB GUI)

# Testing
pnpm test             # Run tests
pnpm test:coverage    # Run tests with coverage report
```

## Production Deployment

### Build

```bash
pnpm build
```

This creates three entry points in the `dist/` directory:
- `dist/index.js` - Main HTTP API server
- `dist/bot/index.js` - Telegram bot standalone
- `dist/workers/index.js` - Background workers standalone

### Running in Production

#### Option 1: All-in-One

```bash
pnpm start
```

#### Option 2: Separate Services (Recommended)

```bash
# Terminal 1 - HTTP API
NODE_ENV=production pnpm start

# Terminal 2 - Bot
NODE_ENV=production pnpm start:bot

# Terminal 3 - Workers
NODE_ENV=production pnpm start:workers
```

#### Docker Deployment

```dockerfile
# Example Dockerfile
FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm@9
COPY package*.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

### Environment Checklist

Before deploying to production, ensure:

- [ ] `NODE_ENV=production`
- [ ] Strong `JWT_SECRET` (min 32 characters, randomly generated)
- [ ] Valid SSL certificate for webhook URL
- [ ] PostgreSQL connection pooling configured
- [ ] Redis persistence enabled
- [ ] Monitoring/logging configured (Sentry, Prometheus)
- [ ] Database backups scheduled
- [ ] Rate limiting enabled
- [ ] Admin card number configured for manual payments
- [ ] `TELEGRAM_ADMIN_IDS` set for payment notifications

## Bot Commands

### User Commands

| Command | Description | Handler |
|---------|-------------|---------|
| `/start` | Register user, show main menu | `bot/handlers/start.ts` |
| `/help` | Display help message | `bot/handlers/start.ts` |
| `/plans` | Browse available VPN plans | `bot/handlers/plans.ts` |
| `/mysub` | Manage your subscriptions | `bot/handlers/subscriptions.ts` |
| `/profile` | View profile and settings | `bot/handlers/profile.ts` |
| `/referral` | Get referral link and stats | `bot/handlers/referral.ts` |
| `/gift` | Claim gift codes | `bot/handlers/gift.ts` |
| `/test` | Get free test account | `bot/handlers/test-account.ts` |

### Admin Commands

| Command | Description | Handler |
|---------|-------------|---------|
| `/admin` | Admin panel for payments | `bot/handlers/admin.ts` |
| `/payments` | View all payments | `bot/handlers/admin.ts` |
| `/verify_payment <id>` | Verify specific payment | `bot/handlers/admin.ts` |

## API Documentation

### REST API v1

Base URL: `http://localhost:3000/api`

### Manual Payment Endpoints (User)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/payments` | Create manual payment request | Yes |
| GET | `/payments/:id` | Get payment details | Yes |
| GET | `/payments` | Get user's payment history | Yes |
| GET | `/payments/:id/status` | Check payment status | Yes |
| POST | `/payments/:id/reference` | Set transaction ID | Yes |
| POST | `/payments/:id/cancel` | Cancel payment | Yes |

### Manual Payment Endpoints (Admin)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/payments/admin/pending` | Get pending payments | Admin |
| GET | `/payments/admin/pending/count` | Get pending payment count | Admin |
| POST | `/payments/admin/:id/verify` | Approve/reject payment | Admin |
| GET | `/payments/admin/:id` | Get any payment details | Admin |

### Other Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/users/me` | Get current user | Yes |
| GET | `/subscriptions` | Get user subscriptions | Yes |
| POST | `/subscriptions` | Create subscription | Yes |
| GET | `/wallet` | Get wallet balance | Yes |
| GET | `/servers` | Get available servers | No |
| GET | `/plans` | Get available plans | No |

### GraphQL API

Endpoint: `http://localhost:3000/graphql`

Available in development: GraphQL Playground at `/graphql`

#### Payment Flow Example

```graphql
query GetPaymentStatus($paymentId: BigInt!) {
  manualPayment(id: $paymentId) {
    id
    status
    screenshotReceived
    amountCents
    user {
      telegramId
      telegramFirstName
    }
    plan {
      name
      priceUsdCents
    }
  }
}
```

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0"
}
```

## Project Structure

```
telegram-vpn-bot/
├── src/
│   ├── index.ts                 # Main application entry point
│   ├── config/                  # Environment configuration (Zod)
│   ├── db/                      # Database layer
│   │   ├── schema/                 # Drizzle ORM schema definitions
│   │   │   ├── enums.ts            # PostgreSQL enums
│   │   │   ├── users.ts                # Users table
│   │   │   ├── servers.ts              # VPN servers
│   │   │   ├── plans.ts                # Subscription plans
│   │   │   ├── subscriptions.ts        # User subscriptions
│   │   │   ├── manual-payments.ts     # Manual payments
│   │   │   ├── vpn-accounts.ts         # VPN credentials
│   │   │   ├── wallets.ts              # User wallets
│   │   │   ├── payments.ts             # Payment logs (legacy)
│   │   │   └── ...
│   │   ├── index.ts                # Database connection
│   │   └── queries.ts              # Pre-built queries
│   ├── cache/                   # Redis caching layer
│   ├── marzban/                 # Marzban API client
│   ├── bot/                     # Telegram bot
│   │   ├── index.ts                # Bot setup
│   │   ├── handlers/            # Command handlers
│   │   │   ├── start.ts
│   │   │   ├── plans.ts
│   │   │   ├── subscriptions.ts
│   │   │   ├── payment.ts              # Manual payment handler
│   │   │   ├── profile.ts
│   │   │   ├── admin.ts                # Admin commands
│   │   │   └── ...
│   ├── services/                # Business logic
│   │   ├── user.ts
│   │   ├── subscription.ts
│   │   ├── manual-payment.ts       # Manual payment service
│   │   └── wallet.ts
│   ├── routes/                  # HTTP REST routes
│   │   ├── api/
│   │   ├── health.ts            # Health check
│   │   └── webhooks.ts         # Webhook handlers
│   ├── middleware/              # Hono middleware (auth, rate-limit)
│   ├── graphql/                # GraphQL setup
│   └── workers/                 # Background job workers
├── dist/                        # Build output
├── tests/                       # Test files
├── drizzle.config.ts            # Drizzle ORM config
├── tsconfig.json                # TypeScript config
├── tsup.config.ts               # Build config
├── .env.example                 # Environment template
├── package.json                 # Dependencies & scripts
└── README.md                    # This file
```

### Directory Descriptions

| Directory | Purpose |
|-----------|---------|
| `src/bot/` | Telegram bot handlers, middleware, and utilities |
| `src/graphql/` | GraphQL schema, resolvers, and context |
| `src/routes/` | HTTP REST API routes and middleware |
| `src/services/` | Business logic layer |
| `src/db/` | Database schema, migrations, and queries |
| `src/cache/` | Redis cache service and utilities |
| `src/marzban/` | Marzban panel API client |
| `src/middleware/` | Hono middleware (auth, rate-limit, validation) |
| `src/config/` | Environment configuration with Zod validation |

## Manual Payment System

The bot implements a **manual payment system with admin verification**:

### Payment Flow

```mermaid
sequenceDiagram
    participant User as U
    participant Bot as B
    participant Admin as A
    participant Service as S

    U->>B: /plans command
    B->>U: Show plans list
    U->>B: Select plan (payment:create)
    B->>S: createManualPayment()
    B->>U: Show card number + amount
    Note over U: User sends money to card
    U->>B: Upload screenshot (photo)
    B->>S: attachPaymentScreenshot()
    B->>A: Notify with screenshot
    A->>B: /verify_payment <id>
    B->>A: Show payment + screenshot
    A->>B: Approve payment
    B->>S: verifyPayment(approved=true)
    S->>S: createSubscriptionForPayment()
    S->>Marzban: Create VPN user
    S->>B: Subscription created
    B->>U: "Payment approved! Subscription active"
```

### Payment Statuses

| Status | Description |
|--------|-------------|
| `awaiting_screenshot` | Payment created, waiting for screenshot upload |
| `pending` | Screenshot received, awaiting admin verification |
| `approved` | Payment verified, subscription created successfully |
| `rejected` | Payment rejected by admin, no subscription created |
| `expired` | Payment expired (default: 24 hours) |

### Admin Verification

Admins can verify payments using:

- **Bot Command:** `/verify_payment <payment_id>`
- **API Endpoint:** `POST /api/payments/admin/:id/verify`
- **Inline Keyboard:** Approve/Reject buttons on payment details

### Environment Variables for Manual Payments

```env
# Admin's card details
ADMIN_CARD_NUMBER=1234567890123456
ADMIN_CARD_HOLDER=Admin Name

# Payment configuration
MANUAL_PAYMENT_EXPIRY_HOURS=24
MAX_SCREENSHOT_SIZE_MB=10
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`pnpm test && pnpm lint`)
5. Commit your changes (`pnpm commit` for conventional commits)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- Follow existing code style
- Use TypeScript strict mode
- Write tests for new features
- Update documentation as needed

## Additional Documentation

- [MANUAL_PAYMENT_SETUP.md](MANUAL_PAYMENT_SETUP.md) - Manual payment system setup guide
- [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md) - Detailed technical documentation

## Troubleshooting

### Common Issues

**Issue:** Database connection fails
```bash
# Verify PostgreSQL is running
pg_isready -h localhost -p 5432

# Check connection string in .env
echo $DATABASE_URL
```

**Issue:** Bot doesn't respond to commands
- Verify `TELEGRAM_BOT_TOKEN` is correct
- Check if webhook is set (use `/setwebhook` in production)
- Check bot logs for errors

**Issue:** Manual payment screenshot not uploading
- Check file size (max 10MB by default)
- Check file type (only jpg, png, webp)
- Verify user has pending payment in session

**Issue:** Admin not receiving payment notifications
- Check `TELEGRAM_ADMIN_IDS` in config
- Verify admin hasn't blocked the bot
- Check bot has permission to message admins

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

For issues and questions, please open an issue on GitHub.
