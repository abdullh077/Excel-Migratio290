---
name: Offline outbox idempotency is generic client-side
description: When adding server-side clientRequestId dedupe to a new create endpoint, the offline outbox client code usually needs no changes.
---

`artifacts/visa-manager/src/lib/offline/offlineFetch.ts` already attaches
`clientRequestId: tempId` to the request body for ANY endpoint whose
`planMutation()` entry (in `artifacts/visa-manager/src/lib/offline/affects.ts`)
returns `self.kind === "create"`. `outbox.ts` just replays the stored body
verbatim on retry, so the same id is resent automatically.

**Why:** this generic wiring already covers every existing create endpoint
(umrah, visas, vouchers, ledger, agent payments, and — as of the agent/client
idempotency fix — statement/agents and statement/clients). It's easy to
assume each new endpoint needs a matching outbox/affects.ts change, but if
the endpoint's POST is already mapped with `kind: "create"` in
`planMutation()`, only the server side (add a `client_request_id` unique
column + `onConflictDoNothing` + "return existing row on conflict" logic,
mirroring `umrah.ts`/`vouchers.ts`) needs to change.

**How to apply:** before writing client-side outbox code for a new
idempotent create, check `affects.ts` first — if the route is already
planned as `kind: "create"`, the client requestId plumbing is done; just
build the server-side dedupe path.
