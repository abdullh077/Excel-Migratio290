---
name: Offline outbox + PWA pattern (visa manager)
description: How offline support works — outbox, idempotency, PWA cache exclusions, cache wipe on login/logout
---
- Offline creates go into a localStorage outbox (`oboor-outbox-v1`) and auto-upload on `online` event / app start; banner in AppLayout shows pending count.
- **Idempotency rule:** every outbox upload sends `clientRequestId`; server inserts with `onConflictDoNothing` on a unique nullable `client_request_id` column (umrah_clients, other_visas) and returns the existing row on retry. Any new offline-capable create endpoint must follow this or lost responses create duplicates.
- **Why:** architect review flagged duplicate-create risk on retry after uncertain delivery.
- PWA (vite-plugin-pwa): precache shell + NetworkFirst for GET `/api/*` **excluding `/api/auth/*`** — caching auth resurrects stale sessions (security fail).
- React Query cache is persisted to localStorage (`oboor-query-cache-v1`, 7d). `clearOfflineCaches()` must run on logout AND login success so one account's data never leaks to another on the same device.
- drizzle-kit push can't add unique constraints non-interactively on tables with rows; apply via psql then RENAME CONSTRAINT to drizzle's `<table>_<col>_unique` naming so push sees no diff.
