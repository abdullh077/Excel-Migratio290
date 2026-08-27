---
name: Offline sync test harness (visa-manager)
description: How to unit-test outbox.ts/affects.ts/cache.ts in plain Node, and the integration pattern for verifying balances after a replayed offline batch.
---

Client-side offline logic (`artifacts/visa-manager/src/lib/offline/*.ts`) is testable with Node's
built-in test runner via `tsx --test src/lib/offline/*.test.ts` (`pnpm --filter @workspace/visa-manager run test`), but two globals must be faked first or `flushOutbox()` silently no-ops:

- `import "fake-indexeddb/auto";` before importing anything from `./idb` — Node has no `indexedDB` global.
- `Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });` — Node's built-in `navigator` has no `onLine`, which `flushOutbox()` reads as "offline" and refuses to run.

**Why:** without both, every outbox test either throws `ReferenceError: indexedDB is not defined` or passes trivially because flush never executes.

**How to apply:** mock `global.fetch` per test with a scripted response queue; use a fresh `officeId` per test (module-level singletons in `idb.ts`/`authCache.ts` persist across tests in the same file) to avoid cross-test bleed. See `outbox.test.ts`, `affects.test.ts`, `cache.test.ts` for the pattern, including how to assert temp-id substitution and permanent-failure isolation.

For server-side balance correctness after a batch of queued writes, `artifacts/api-server/src/routes/statement.offline-sync.test.ts` spins up the real Express `app` on an ephemeral port + the real dev DB, logs in for a session cookie, and replays each write **twice with the same `clientRequestId`** (simulating an outbox retry after a lost response) before asserting the final balance — this is the actual regression case: idempotent dedupe breaking silently would double-count and this is the only way to catch it end-to-end.
