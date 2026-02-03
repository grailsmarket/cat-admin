# Cat Admin

Admin dashboard for managing ENS name categories on [Grails](https://grails.app).

## What is this?

Cat Admin is an internal tool for managing "categories" (also known as "clubs") — curated collections of ENS names grouped by shared characteristics like digit count, patterns, or themes.

**Features:**
- Create new categories
- Add/remove ENS names to categories (bulk operations supported)
- View category membership details
- Look up any ENS name and see its category memberships
- Full audit log of all changes

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

The app connects directly to the Grails PostgreSQL database using a restricted user (`grails_cat_admin`) with minimal permissions:

- `clubs` table: SELECT, INSERT, UPDATE
- `club_memberships` table: SELECT, INSERT, DELETE
- `ens_names` table: SELECT only
- `clubs_audit_log` table: SELECT only

All changes are automatically logged via database triggers.

## License

MIT

