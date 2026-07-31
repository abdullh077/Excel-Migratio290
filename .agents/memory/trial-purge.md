---
name: Trial expiry data purge
description: How/why the 3-day trial wipes its data on expiry, and the rules that keep it safe
---

# Trial expiry data purge

When an **unactivated** 3-day trial expires (or clock rollback is detected), the app deletes all business
records entered during the trial (umrah_clients + other_visas), exactly once, then marks
`license.trial_data_purged_at`. Trial start is refused if a trial or license already exists → the trial is
**once per database**.

**Why:** the product is an offline .exe; the trial must not let someone enter data, let it lapse, and keep
using/exporting it, nor restart the trial to continue.

**How to apply / invariants (do not regress):**
- **Never purge when a paid license exists.** Purge only in the trial-expiry branch and only when
  `activated_at` AND `license_expires_at` are both null. A paid license that *later* lapses must keep its data.
- **Purge must be atomic.** Do it inside a transaction that locks the singleton license row
  (`select ... for update`) and re-checks all conditions under the lock, or a concurrent activate/grant can
  race the DELETE against a freshly-paid license. (This was a real code-review finding.)
- The purge currently runs as a side effect of `GET /license/status` (the frontend polls it). Acceptable for
  this single-user offline app because it's idempotent + guarded, but it *is* a mutation-on-GET; if hardening
  further, move it to an explicit transition step.

**Desktop mirror (deferred):** all of this lives in the web/api-server (Postgres) path. The real .exe
(`artifacts/desktop`, SQLite) must mirror it. For true *once-per-device* that survives deleting the SQLite
file, add an external device marker (hidden file / OS store) — a DB-only flag resets on reinstall.
