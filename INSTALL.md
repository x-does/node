# node-main — Installation & Setup Guide

> **node.xdoes.space** — the public-facing site for the Company.  
> Stack: Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 (MySQL) · WorkOS AuthKit

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone & Install](#2-clone--install)
3. [Environment Variables](#3-environment-variables)
4. [Database Setup](#4-database-setup)
5. [WorkOS AuthKit Setup](#5-workos-authkit-setup)
6. [Running Locally](#6-running-locally)
7. [Building for Production](#7-building-for-production)
8. [Deployment](#8-deployment)
9. [Verification](#9-verification)
10. [Project Structure](#10-project-structure)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

| Tool       | Minimum Version | Notes                                    |
| ---------- | --------------- | ---------------------------------------- |
| **Node.js** | 20+            | LTS recommended; 22.x works             |
| **npm**     | 10+            | Ships with Node 20+                     |
| **MySQL**   | 8.0+           | Remote or local; Prisma connects via URL |
| **bash**    | 4+             | Only needed for `verify:live` scripts    |

Optional but helpful:
- `openssl` — to generate the cookie password for WorkOS sessions.
- `curl` — used by the verification script.

---

## 2. Clone & Install

```bash
# Navigate to the app directory
cd workspace/work/apps/node-main

# Install dependencies
npm install

# Generate the Prisma client
npm run db:generate
```

If you encounter Prisma version issues, ensure both `prisma` and `@prisma/client` are pinned to v6:

```bash
npm install @prisma/client@^6
npm install -D prisma@^6
```

---

## 3. Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

### Required Variables

| Variable                | Description                                         | Example                                                             |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`          | Prisma MySQL connection string                      | `mysql://user:password@host:3306/dbname`                            |
| `WORKOS_API_KEY`        | WorkOS API key (from WorkOS Dashboard → API Keys)   | `sk_test_...` (staging) / `sk_live_...` (production)                |
| `WORKOS_CLIENT_ID`      | WorkOS Client ID (from WorkOS Dashboard → API Keys) | `client_01H...`                                                     |
| `WORKOS_COOKIE_PASSWORD`| Encryption key for sealed sessions (32+ characters) | Generate with: `openssl rand -base64 32`                            |
| `WORKOS_REDIRECT_URI`   | OAuth callback URL                                  | `http://localhost:3000/api/auth/callback` (local)                   |
| `APP_URL`               | Public base URL of the app                          | `http://localhost:3000` (local) / `https://node.xdoes.space` (prod) |

### Legacy Variables (reference only)

These individual DB vars are documented in `.env.example` for context but are **not used by the app**. Only `DATABASE_URL` is read by Prisma:

```
DB_HOST=srv2082.hstgr.io
DB_PORT=3306
DB_NAME=u414330470_node
DB_USER=u414330470_node
DB_PASSWORD=change-me
```

### Generating the Cookie Password

```bash
openssl rand -base64 32
```

Paste the output as `WORKOS_COOKIE_PASSWORD`. This value encrypts sealed session cookies — keep it secret and consistent across deploys.

---

## 4. Database Setup

The app uses Prisma ORM with MySQL. All tables are prefixed `openclaw_`.

### Option A: Push schema to an existing database (no migrations)

```bash
npm run db:push
```

This creates or updates the tables to match `prisma/schema.prisma` without generating migration files. Good for development and initial setup.

### Option B: Use migrations (recommended for production)

```bash
npm run db:migrate
```

This generates a migration file in `prisma/migrations/` and applies it. Preferred for tracked, reversible changes.

### Seed sample data

```bash
npm run db:seed
```

This populates the `openclaw_products` table with sample store entries via `prisma/seed.ts`.

### Database Tables

| Prisma Model      | MySQL Table                 | Purpose                       |
| ------------------ | --------------------------- | ----------------------------- |
| `LeadEvent`        | `openclaw_lead_events`      | Audit click/lead tracking     |
| `AppStatus`        | `openclaw_app_status`       | Live status display on home   |
| `Product`          | `openclaw_products`         | Store products                |
| `PageView`         | `openclaw_page_views`       | Page view analytics           |
| `TrackingEvent`    | `openclaw_tracking_events`  | Custom event analytics        |

---

## 5. WorkOS AuthKit Setup

Authentication uses WorkOS Hosted UI with sealed sessions. No custom OAuth screens are needed.

### 5.1 WorkOS Dashboard Configuration

1. **Create or select an environment** at [dashboard.workos.com](https://dashboard.workos.com).
2. **Copy your API key and Client ID** from the API Keys page. Set them as `WORKOS_API_KEY` and `WORKOS_CLIENT_ID`.
3. **Add redirect URIs** under Redirects:
   - Local: `http://localhost:3000/api/auth/callback`
   - Production: `https://node.xdoes.space/api/auth/callback`
4. **Enable Authentication methods** under Authentication → Email + Password (optional), and Social Login.

### 5.2 Social Login — Provider Setup

Each social provider must be explicitly enabled and configured in the WorkOS Dashboard.

#### Google

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an OAuth 2.0 Client ID (Web application).
3. Set Authorized redirect URI to: `https://authkit.workos.com/sso/oauth/callback` (WorkOS handles this).
4. Copy the **Client ID** and **Client Secret** into the WorkOS Dashboard under Authentication → Social Login → Google.

#### Microsoft

1. Go to [Azure Portal](https://portal.azure.com/) → App registrations → New registration.
2. Set redirect URI to: `https://authkit.workos.com/sso/oauth/callback`
3. Under Certificates & secrets, create a new client secret.
4. Copy the **Application (client) ID** and **Client secret** into the WorkOS Dashboard under Authentication → Social Login → Microsoft.

#### Apple

1. Go to [Apple Developer](https://developer.apple.com/) → Certificates, Identifiers & Profiles.
2. Register a new Services ID and configure Sign In with Apple.
3. Set the return URL to: `https://authkit.workos.com/sso/oauth/callback`
4. Generate a private key for Sign In with Apple.
5. Enter the **Services ID**, **Team ID**, **Key ID**, and **Private Key** in the WorkOS Dashboard under Authentication → Social Login → Apple.

### 5.3 Identity Linking

WorkOS automatically links accounts that share the same verified email address across different providers. No additional application code is needed. A user who signs in with Google (`user@example.com`) and later with Microsoft (`user@example.com`) will resolve to the same WorkOS user.

### 5.4 Auth Flow Summary

```
User clicks "Sign in"
  → GET /api/auth/login
    → Redirect to WorkOS Hosted UI
      → User picks Google / Microsoft / Apple
        → WorkOS completes auth
          → Redirect to GET /api/auth/callback?code=...
            → App exchanges code for sealed session
              → Set httpOnly cookie "wos-session"
                → Redirect to /
```

Protected routes (e.g. `/dashboard`) are guarded by Next.js middleware that checks for the `wos-session` cookie. Server components use `requireAuth()` from `src/lib/auth.ts` to validate the session and access user data.

---

## 6. Running Locally

```bash
npm run dev
```

The app starts at [http://localhost:3000](http://localhost:3000).

Ensure your `.env` has:
- `DATABASE_URL` pointing to an accessible MySQL instance.
- `WORKOS_REDIRECT_URI=http://localhost:3000/api/auth/callback`
- `APP_URL=http://localhost:3000`

Auth will only work once WorkOS Dashboard is configured with the redirect URI and at least one social provider.

---

## 7. Building for Production

```bash
npm run build
```

This runs the Next.js production build. The output goes to `.next/`.

To preview the production build locally:

```bash
npm run start
```

This serves the built app on port 3000.

### Build Notes

- The WorkOS client uses lazy initialization (`getWorkOS()` in `src/lib/workos.ts`) so that missing environment variables during the static analysis phase of `next build` do not cause failures. The client is only instantiated at runtime when an auth route is hit.
- The middleware file (`src/middleware.ts`) may show a deprecation warning about the `proxy` convention in Next.js 16. This is advisory only and does not affect functionality.

---

## 8. Deployment

### Target: Hostinger (or any Node.js host)

1. Push the code to your GitHub repository.
2. On the host, clone the repo and navigate to `workspace/work/apps/node-main`.
3. Install dependencies: `npm install --production`
4. Generate Prisma client: `npx prisma generate`
5. Apply database schema: `npx prisma db push` (or `npx prisma migrate deploy` for migration-based deploys)
6. Build: `npm run build`
7. Start: `npm run start` (or use a process manager like PM2)

### Production Environment Variables

Set these in your hosting platform's environment configuration (not in committed files):

```
DATABASE_URL=mysql://prod_user:prod_password@prod_host:3306/prod_db
WORKOS_API_KEY=sk_live_...
WORKOS_CLIENT_ID=client_...
WORKOS_COOKIE_PASSWORD=<your-32-char-secret>
WORKOS_REDIRECT_URI=https://node.xdoes.space/api/auth/callback
APP_URL=https://node.xdoes.space
NODE_ENV=production
```

### Production Hardening Checklist

- [ ] `WORKOS_API_KEY` uses a **live** key (not `sk_test_...`)
- [ ] `WORKOS_COOKIE_PASSWORD` is a strong random value (32+ chars)
- [ ] `WORKOS_REDIRECT_URI` uses `https://` and matches the WorkOS Dashboard
- [ ] `APP_URL` uses `https://` and matches the deployed domain
- [ ] `NODE_ENV=production` is set (enables `secure` flag on session cookies)
- [ ] Database credentials are not committed to source control
- [ ] The `.env` file is excluded from deployments (`.gitignore` includes `.env`)
- [ ] HTTPS is enforced at the hosting/reverse-proxy level

---

## 9. Verification

### Health Check

```bash
curl https://node.xdoes.space/api/health
```

Expected: `{"ok":true, ...}` with `Cache-Control: no-store`.

### Full Live Verification Script

The app includes a bash script that verifies all critical surfaces:

```bash
# Full check (includes audit-click probe — creates a tracking event)
npm run verify:live

# Read-only check (skips audit-click)
npm run verify:live:readonly

# Audit-only check (skips root page)
npm run verify:audit:readonly
```

The script checks:
- `/api/health` — status 200, correct payload, no-store headers
- `/` — status 200, parity marker present, CTA markers
- `/audit` — status 200, expected content markers
- `/api/audit-metrics` — status 200, signal fields present
- `/api/audit-click` — 302 redirect to Telegram bot URL (unless `--skip-click`)

You can override the target:

```bash
bash scripts/verify-live-audit-surface.sh --base-url http://localhost:3000
```

### Auth Testing Checklist

- [ ] Visit `/api/auth/login` — redirects to WorkOS Hosted UI
- [ ] Complete login with Google / Microsoft / Apple — redirects back to `/`
- [ ] Header shows user name/avatar and "Sign out" button after login
- [ ] Visit `/dashboard` — displays user info (name, email, profile picture)
- [ ] Click "Sign out" — clears session, header reverts to "Sign in" link
- [ ] Visit `/dashboard` while logged out — redirects to WorkOS login
- [ ] Log in with the same email via two different providers — same user, no duplicates

---

## 10. Project Structure

```
node-main/
├── prisma/
│   ├── schema.prisma          # Database schema (5 models, openclaw_ prefix)
│   └── seed.ts                # Sample product data seeder
├── scripts/
│   └── verify-live-audit-surface.sh  # Live deployment verification
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout (fonts, header, footer, tracking)
│   │   ├── page.tsx           # Landing page
│   │   ├── globals.css        # Tailwind theme + custom properties
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── login/route.ts     # → WorkOS Hosted UI redirect
│   │   │   │   ├── callback/route.ts  # ← Code exchange + session cookie
│   │   │   │   ├── logout/route.ts    # Session destroy + WorkOS logout
│   │   │   │   └── session/route.ts   # Current user JSON endpoint
│   │   │   ├── track/route.ts         # Page view + event tracking
│   │   │   ├── audit-click/route.ts   # Audit click → Telegram redirect
│   │   │   ├── audit-metrics/route.ts # Lead metrics endpoint
│   │   │   └── health/route.ts        # DB health check
│   │   ├── audit/page.tsx     # Audit intake page
│   │   ├── blog/              # Blog listing + [slug] detail pages
│   │   ├── store/             # Store listing + [slug] detail pages
│   │   ├── apps/              # Apps showcase listing + [slug] detail
│   │   └── dashboard/page.tsx # Protected page (requires auth)
│   ├── components/
│   │   ├── layout/            # Header, Footer
│   │   ├── landing/           # Hero, Offerings, Roadmap, Status, Products, CTA
│   │   ├── blog/              # PostCard
│   │   ├── store/             # ProductCard
│   │   ├── apps/              # AppCard
│   │   ├── tracking/          # TrackPageView (client component)
│   │   └── ui/                # Button, Card, Badge, Section
│   ├── content/
│   │   └── blog/              # MDX blog posts (hello-world, building-in-public)
│   ├── lib/
│   │   ├── prisma.ts          # PrismaClient singleton
│   │   ├── workos.ts          # WorkOS client (lazy-initialized singleton)
│   │   ├── auth.ts            # Session helpers (getSession, requireAuth)
│   │   ├── utils.ts           # cn(), formatDate(), slugify()
│   │   ├── tracking.ts        # IP hash, UA extraction
│   │   ├── mdx.ts             # Blog post MDX loader
│   │   ├── apps-data.ts       # Apps showcase configuration
│   │   └── audit-config.ts    # Audit constants and URL builders
│   ├── types/
│   │   └── index.ts           # Shared TypeScript types
│   └── middleware.ts          # Route protection (cookie check → redirect)
├── .env.example               # Environment variable template
├── .gitignore
├── next.config.ts             # Next.js config (no-store headers, strict mode)
├── package.json
├── postcss.config.mjs         # Tailwind CSS v4 PostCSS plugin
└── tsconfig.json              # TypeScript config (strict, path aliases)
```

---

## 11. Troubleshooting

### `WorkOS requires either an API key or a clientId`

This happens during `next build` if the WorkOS client is instantiated at import time without env vars present. The app uses lazy initialization (`getWorkOS()`) to avoid this. If you see this error, ensure `src/lib/workos.ts` uses the function-based pattern, not a top-level `new WorkOS(...)`.

### Prisma: `Can't reach database server`

- Verify `DATABASE_URL` in `.env` is correct and the MySQL server is accessible.
- If using a remote host, check firewall rules and allowed IP addresses.
- Run `npx prisma db push` to test connectivity.

### `Module not found: @prisma/client`

Run `npm run db:generate` (or `npx prisma generate`) after installing dependencies. The Prisma client is generated from the schema and must be regenerated after schema changes.

### Auth callback returns to login in a loop

- Confirm `WORKOS_REDIRECT_URI` in `.env` exactly matches the redirect URI configured in the WorkOS Dashboard.
- Confirm `WORKOS_CLIENT_ID` and `WORKOS_API_KEY` belong to the same WorkOS environment.
- Check the browser's network tab for the callback response — a missing `code` parameter means WorkOS rejected the auth attempt.

### Social login provider not appearing

Social providers do not activate automatically. Each one (Google, Microsoft, Apple) must be:
1. Configured with credentials in the WorkOS Dashboard.
2. Explicitly enabled under Authentication → Social Login.

### Middleware deprecation warning

Next.js 16 shows: `The "middleware" file convention is deprecated. Please use "proxy" instead.` This is a warning only — the middleware works correctly. Migration to the `proxy` convention can be done in a future update.

### Session cookie not set (localhost)

When `NODE_ENV` is not `production`, the `secure` flag on the session cookie is disabled so it works over `http://localhost`. If you override `NODE_ENV=production` locally, you need HTTPS (or the cookie will be rejected by the browser).
