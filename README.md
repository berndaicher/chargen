# Chargen Web Implementation (Nuxt + Cloudflare)

This folder contains the first implementation slice of the migration:

- frontend: Nuxt UI with Microsoft 365 login flow (Entra ID)
- api: Cloudflare Worker API with D1 and tenant mapping from Entra tid

## Quick Start

1. Configure environment values based on .env.example.
2. Create D1 database and set database_id in api/wrangler.toml.
3. Apply migration 0001_initial.sql.
4. Start API with wrangler dev.
5. Start Nuxt frontend with npm run dev.

## Tenant Model

- Each Microsoft 365 tenant (Entra tid claim) maps to one app tenant.
- API resolves tenant on every request from bearer token.
- Data access is always scoped by tenant_id.
