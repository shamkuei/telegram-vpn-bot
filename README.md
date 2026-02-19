# Telegram VPN Bot

A production-ready Telegram VPN Sales Bot that provides automated VPN subscription services through Telegram. Integrates with [Marzban](https://github.com/Gozargah/Marzban) for VPN account management and supports multiple payment providers.

## Features

### Core Features
- **Telegram Bot Interface** - Intuitive bot commands for VPN subscription management
- **Multi-Payment Support** - CryptoPay, NOWPayments, Stripe, and internal wallet system
- **Subscription Management** - Multiple plan types (monthly, quarterly, yearly, lifetime, test)
- **Server Selection** - Multi-region VPN server support
- **Referral System** - User referral program with rewards
- **Reseller System** - Multi-tier reseller accounts (Bronze, Silver, Gold, Platinum)
- **Gift Codes** - Promotional gift code system
- **Test Accounts** - Free trial account generation
- **Multi-language** - English and Persian language support

### Admin Features
- Reseller tier management
- Promo/discount codes
- Feature flags
- Usage alerts
- Audit logging
- Rate limiting

## Tech Stack

- **Runtime:** Node.js 20+ with ES modules
- **Language:** TypeScript
- **Framework:** Hono (HTTP), Grammy (Telegram Bot)
- **Database:** PostgreSQL with Drizzle ORM
- **Cache/Queue:** Redis with BullMQ
- **API:** GraphQL Yoga with Apollo Federation

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- PostgreSQL database
- Redis server
- Marzban instance

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd telegram-vpn-bot

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Configure environment variables
nano .env
```

## Configuration

Edit `.env` file with your settings:

### Required Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/vpn_bot

# Redis
REDIS_URL=redis://localhost:6379

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather

# Marzban Panel
MARZBAN_API_URL=https://your-marzban-panel.com
MARZBAN_ADMIN_USERNAME=admin
MARZBAN_ADMIN_PASSWORD=your_password

# JWT
JWT_SECRET=your_secret_key_min_32_chars
```

### Optional Payment Providers

```env
# CryptoPay
CRYPTOPAY_API_KEY=your_cryptopay_api_key

# NOWPayments
NOWPAYMENTS_API_KEY=your_nowpayments_api_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
```

### Feature Flags

```env
ENABLE_TEST_ACCOUNTS=true
ENABLE_GIFT_CODES=true
ENABLE_RESELLER_SYSTEM=true
ENABLE_REFERRAL_SYSTEM=true
ENABLE_SMART_ALERTS=true
```

## Running the Application

```bash
# Run database migrations
pnpm db:push

# Development mode (with hot reload)
pnpm dev

# Production mode
pnpm build
pnpm start

# Start individual services
pnpm start:bot      # Telegram bot only
pnpm start:workers  # Background workers only
pnpm start:api      # HTTP API server only
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start bot and register (with referral support) |
| `/plans` | Browse available VPN plans |
| `/mysub` | Manage your subscriptions |
| `/profile` | View profile and settings |
| `/referral` | Referral program |
| `/gift` | Redeem gift codes |
| `/test` | Get a free test account |

## Database Operations

```bash
# Open Drizzle Studio (database GUI)
pnpm db:studio

# Generate migrations
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Push schema changes (development)
pnpm db:push
```

## Testing

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

## Code Quality

```bash
# Lint code
pnpm lint

# Format code
pnpm format

# Type checking
pnpm type-check
```

## API Endpoints

- `GET /health` - Health check
- `POST /graphql` - GraphQL API
- `GET /graphql` - GraphQL Playground (dev only)
- `POST /webhooks/*` - Payment provider webhooks
- `/api/*` - REST API v1 (protected)

## Project Structure

```
/src
├── bot/           # Telegram bot handlers and logic
├── graphql/       # GraphQL schema and resolvers
├── routes/        # HTTP API routes
├── services/      # Business logic layer
├── db/            # Database schema and queries
├── workers/       # Background job workers
├── middleware/    # Auth, rate limiting
├── marzban/       # Marzban API client
├── cache/         # Redis caching layer
└── config/        # Environment configuration
```

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
