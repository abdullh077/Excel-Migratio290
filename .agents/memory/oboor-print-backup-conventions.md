---
name: Oboor print header & backup conventions
description: Unified print header component, sub-account lockout enforcement points, and DB-based backup design for the visa-manager app.
---

- **Unified print header**: every printable document (receipt, cash voucher, statement) must use `components/print/PrintHeader.tsx` (`PrintHeader` + `PrintWatermark`). Layout: office info right, big logo center, doc number/date left, gold border, navy text, transparent logo watermark behind content (watermark absolute + content wrapped in `relative`, or text paints under it).
  **Why:** user demanded identical office branding on all printable/PDF documents; ad-hoc headers drifted.
- **Sub-account lockout (`users.disabled`)** must be enforced in THREE places: login, `requireOffice` (per-request for active sessions), and `/auth/me` (destroy session). Missing any one is a bypass.
- **Backups live in the central DB** (`backups` table, JSONB, keep 30) — not the filesystem (autoscale disks are ephemeral). Daily auto-backup is lazy on login, guarded by `pg_try_advisory_lock(748291)` to stay once-per-day under concurrent logins. Owners also get an office-scoped daily auto-download to their device via `useDailyLocalBackup` in AppLayout (localStorage day marker).
- **Nested dialog scrollbars**: shadcn `DialogContent` already has `max-h-[85vh] overflow-y-auto`; never add another `max-h/overflow-y-auto` on an inner form div or you get double scrollbars.
- Dates in UI must use `ar-SA-u-ca-gregory` (plain `ar-SA` renders Hijri).
