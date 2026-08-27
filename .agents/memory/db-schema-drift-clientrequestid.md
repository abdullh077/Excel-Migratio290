---
name: DB schema can drift from Drizzle schema when push silently can't run
description: A duplicate/misnamed session table blocked `drizzle-kit push`, which let two other tables drift out of sync with the Drizzle schema; how it was found and versioned so it self-heals for any DB.
---

Found 2026-08: `lib/db/src/schema/sessions.ts` declared a table named `"sessions"` (plural) with
`text` columns, but the app's real session store (`connect-pg-simple`, see
`artifacts/api-server/src/lib/session.ts`) creates and uses a table named `"session"` (singular,
its default name) with `varchar`/`json`/`timestamp(6)` columns. The declared `sessions` table was
dead — nothing in the app ever read or wrote it — while the real `session` table was invisible to
Drizzle. This meant `drizzle-kit push` always saw `session` as an orphaned table not in the schema
and proposed to **drop it** (destroying live logins), which needs interactive confirmation that
`push` can't get in this project's non-interactive post-merge script
(`scripts/post-merge.sh` runs `pnpm --filter db push`). Because push effectively never completed
cleanly, two unrelated tables (`agents`, `client_accounts`) drifted out of sync with a later schema
change (a `clientRequestId` column added for offline-sync idempotency) without anyone noticing,
which made every create to those two endpoints throw `column "client_request_id" of relation
"agents" does not exist` — a real 500, not an offline-only edge case.

**Why:** a schema/runtime table-name mismatch anywhere silently breaks `push` for the whole
database, not just that one table — so an unrelated, otherwise-correct schema change (the new
column) can never reach any environment where push never successfully runs.

**How to apply:** if a route throws `column ... does not exist` in dev, first check whether
`drizzle-kit push` (via `pnpm --filter db run push`, non-interactively) actually applies cleanly
("No changes detected" or "Changes applied" with no prompt) — if it wants to drop a table
unexpectedly, look for a declared-vs-actual table name/shape mismatch before touching the failing
column. Fix it by correcting the Drizzle schema file to match the real runtime table (not by
force-pushing or manually ALTERing around the symptom), so the fix is versioned and any DB —
freshly provisioned or already drifted — self-heals the next time the existing post-merge push
step runs. Never use `push --force` to get past a data-loss prompt without first understanding
which table it targets.
