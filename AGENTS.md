# AGENTS.md — Chargen (Artikel & Chargenverwaltung)

## Project Overview
Multi-tenant article and batch (charge) tracking app. Login via Microsoft 365 (Entra ID). Each M365 tenant maps to one app tenant automatically on first login.

**Stack:** Nuxt 3 (frontend) + Hono on Cloudflare Workers (API) + D1 (SQLite).

## Architecture
- **`frontend/`** — Nuxt 3 SPA with `@azure/msal-browser` for auth. Client-side only (no SSR).
- **`api/`** — Cloudflare Worker using Hono. D1 database for storage.
- **Tenant model:** `entra_tenant_id` (from JWT `tid` claim) → auto-creates `app_tenants` row. First user in a tenant gets `admin` role automatically (`db.ts:56-62`). All queries scoped by `tenant_id`.

## Commands

### API (`api/`)
```
npm install          # install deps
npx wrangler dev     # start local dev server (port 8787)
npx wrangler deploy  # deploy to Cloudflare
```

### Frontend (`frontend/`)
```
npm install          # install deps
npm run dev          # start Nuxt dev server (port 3000)
npm run build        # production build
```

### Database
```
npx wrangler d1 execute chargen --file migrations/0001_initial.sql  # apply migration
```

## Environment Variables

### Frontend (`.env` or `frontend/.env`)
```
NUXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8787
NUXT_PUBLIC_ENTRA_CLIENT_ID=<entra-app-registration-client-id>
NUXT_PUBLIC_ENTRA_TENANT_ID=common
NUXT_PUBLIC_ENTRA_REDIRECT_URI=http://localhost:3000
```

### API (`api/wrangler.toml` vars + secrets)
```
[vars]
ENTRA_TENANT_MODE = "multi"
ENTRA_AUDIENCE = "api://<your-app-id-uri>"
```
Set `ENTRA_AUDIENCE` as wrangler secret for production: `npx wrangler secret put ENTRA_AUDIENCE`

## Setup Prerequisites
1. Register Entra ID app (SPA type, redirect URI `http://localhost:3000`).
2. Set API permissions: `openid`, `profile`, `email` (delegated).
3. Copy `.env.example` → `.env` (root) and fill frontend values.
4. Create D1 database: `npx wrangler d1 create chargen`
5. Set `database_id` in `api/wrangler.toml` from step 4 output.
6. Apply migration: `npx wrangler d1 execute chargen --file api/migrations/0001_initial.sql`
7. Set wrangler secret: `npx wrangler secret put ENTRA_AUDIENCE`

## Key Conventions
- All API routes (except `/health`) require bearer token from MSAL.
- Roles: `reader` (read-only), `editor` (CRUD articles/charges), `admin` (also delete + user management).
- D1 uses `.ts` source files; `wrangler.toml` points to `src/index.ts`.
- Frontend env vars prefixed with `NUXT_PUBLIC_`; API uses wrangler secrets/vars.
- No test framework configured yet.
- Frontend is SPA only (no SSR) — `auth.global.ts` middleware skips on server.
- MSAL uses `localStorage` cache (not `sessionStorage`).
- First user in each tenant auto-becomes `admin` (`db.ts:56-62`).
