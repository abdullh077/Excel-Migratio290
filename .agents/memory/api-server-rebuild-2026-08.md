---
name: API Server Rebuild August 2026
description: Status and structure of the full backend rebuild with all routes
---

## Status
- All route files written and in `artifacts/api-server/src/routes/`
- `dist/index.mjs` compiled (54KB, esbuild bundle)
- api-server IS registered as an artifact in the Replit deployment (production), running old dist
- **Dev workflow NOT registered** — `artifacts/api-server: API Server` workflow was pruned

## Route Structure
- `auth.ts` — POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
- `umrah.ts` — CRUD /api/umrah (with clientRequestId idempotency)
- `visas.ts` — CRUD /api/visas
- `dashboard.ts` — GET /api/dashboard/stats|monthly|agents|outstanding
- `archive.ts` — GET /api/archive
- `settings.ts` — GET/PUT /api/settings/office
- `provider.ts` — CRUD /api/provider/accounts + patch expiry/password/username
- `statement.ts` — agents CRUD + payments + clients + ledger + summary + agent-names
- `vouchers.ts` — CRUD /api/vouchers

## To activate new routes
Register the dev workflow: `artifacts/api-server: API Server` with command `pnpm --filter @workspace/api-server run dev`.
The artifact.toml must be written via `verifyAndReplaceArtifactToml`, not direct write.

**Why:** The old dist (from a previous session) is served in production; new dist won't be picked up until the production deployment runs.
