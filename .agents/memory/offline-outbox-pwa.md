---
name: Visa manager is online-only (offline mode explicitly rejected)
description: The offline outbox + PWA data-caching system was fully removed at the user's explicit request; do not re-propose offline-first behavior for this app.
---
- **Decision (2026-08-26):** user explicitly rejected any offline capability. Reasons stated: data must always live on the server so it's recoverable even if wiped locally, and so main/sub-account users always see synced, shared data. Do not reintroduce offline writes or cached data for this app without asking again.
- Removed entirely: `src/lib/outbox.ts` (localStorage write queue, `oboor-outbox-v1`), the `!navigator.onLine` enqueue branches in umrah/visas create flows, the OfflineBanner in AppLayout, and the Workbox `NetworkFirst` runtime-caching rule for `/api/*` in `vite.config.ts` (now `runtimeCaching: []`).
- Removed React Query persistence to localStorage (`oboor-query-cache-v1` via `PersistQueryClientProvider`/sync-storage-persister) — query cache is in-memory only per session now, so a device can never show stale data after reopening.
- Added a global `OfflineGate` in `App.tsx`: when `navigator.onLine` is false, it blocks the entire app (including login) behind a full-screen "no internet connection" message — no page, form, or cached data is reachable while offline.
- PWA installability (manifest + service worker precache of the static app shell) was deliberately kept — only the *data* caching/offline-write behavior was removed. If the user ever also wants to drop installability, that's a separate, explicit ask.
- `clearClientCaches()` in `src/lib/api.ts` now also wipes the old `oboor-outbox-v1` key (in addition to `oboor-query-cache-v1` and the `api-cache` Cache Storage) so devices that installed earlier offline-capable builds don't retain stale local writes.
