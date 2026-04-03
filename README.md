# Grails Admin

Internal admin dashboard for [Grails](https://grails.app) — platform metrics, ENS name category management, registration analytics, and audit logging.

## What is this?

Grails Admin is the back-office tool for operating the Grails platform. It provides:

**Dashboard**
- Platform overview: total users, name views, profile views, API requests
- Trending metrics with 1d/7d/30d breakdowns

**Category Management**
- Create, edit, and delete categories (clubs) — curated collections of ENS names
- Bulk add/remove names via CSV or text file upload
- Category images (avatar & header) with drag-and-drop upload to S3
- Classifications system (Ethmojis, Digits, Palindromes, Pre-Punk, Geographic, Letters, Fantasy, Crypto)
- Invalid name scanning and ENS name normalization

**Name Lookup**
- Search any ENS name and view its category memberships
- Add/remove names from categories inline

**Analytics**
- Registration & renewal trends with source/referrer filtering
- Cost breakdowns (ETH spent) and duration tracking
- API request analytics — volume trends, top routes, top users
- Profile and name view tracking
- Configurable date ranges and chart modes (line/bar)

**Activity Log**
- Full audit trail of all database changes with before/after diffs
- Filter by table, operation type, or admin address
- ENS name resolution for admin addresses
- Grouped related events (e.g. membership change + count update)

## Tech Stack

- **Next.js 15** with App Router
- **React 19** with TanStack Query
- **Tailwind CSS v4**
- **PostgreSQL** (direct connection to Grails database)
- **SIWE** (Sign-In With Ethereum) authentication
- **RainbowKit** + **Wagmi** for wallet connection

## Getting Started

### Prerequisites

- Node.js 18+
- Access to the Grails PostgreSQL database
- An authorized admin wallet address

### Environment Variables

Copy `env.example` to `.env.local` and fill in:

```bash
# Database connection (get from Railway)
DATABASE_URL=postgresql://grails_cat_admin:<password>@<host>:<port>/railway

# Grails API for authentication
GRAILS_API_URL=https://grails-api.ethid.org/api/v1

# Comma-separated list of admin wallet addresses
ADMIN_ADDRESSES=0x123...,0x456...

# WalletConnect project ID (required)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

### Installation

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect your wallet.

## Authentication

1. Connect your Ethereum wallet
2. Sign a message to prove ownership
3. Your address is checked against `ADMIN_ADDRESSES`
4. If authorized, you get a session cookie

Only wallets in the `ADMIN_ADDRESSES` list can access the admin panel.

## Security

This app is designed to be public-facing and open source. Security measures include:

- **httpOnly cookies** for session tokens
- **SIWE authentication** (cryptographic wallet verification)
- **Rate limiting** on all API endpoints
- **CSP headers** and security headers
- **Input validation** and length limits
- **Audit logging** of all database changes
- **Parameterized SQL** queries

## Database

The app connects directly to the Grails PostgreSQL database using a restricted user (`grails_cat_admin`) with minimal permissions on category-related tables, and read-only access to analytics/stats views.

All category changes are automatically logged via database triggers.

## License

MIT

