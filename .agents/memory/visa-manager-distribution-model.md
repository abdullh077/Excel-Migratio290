---
name: Visa Manager distribution & licensing model
description: How the visa-manager product is distributed to other offices and licensed (final direction, decided after several reversals)
---

# Distribution & licensing (DECIDED)

The product (visa-manager) is distributed as an **offline Windows .exe** (the existing Electron app at `artifacts/desktop/`), NOT as an online multi-tenant web SaaS.

**Why:** The owner explored an online web multi-tenant model (central control, per-office login, live lock, per-office data isolation) but ultimately chose offline distribution: "a program, not a web page," and "I don't need to control users live." Each office runs its own install with its own local SQLite DB, so data isolation is automatic (no tenant_id/office_id column needed).

**Access control — REPLACED licensing with login-based time-limited accounts (current direction):**
- The whole license/activation/trial system was **removed** (owner: "too complicated"). No activation keys, no HMAC generator, no trial keyword, no license UI, no countdown banners.
- Access is now purely **login-gated**. The owner is the single admin (`role=admin`, unlimited — `expiresAt` NULL). His "customers" are other offices: he creates each one a **username + password + validity period** he chooses himself (Settings → new account: 30/90/180/365 days, custom date, or unlimited).
- `users.expiresAt` (Postgres) / `users.expires_at` (desktop SQLite), nullable; NULL = unlimited. Expiry is enforced **at login (403)** AND on **every authenticated request** (`requireAuth`/`requireAdmin` reload the user from DB and revoke the session when past expiry) — login-only checks let a live session outlive its expiry.
- **Why the whole model changed:** owner wanted zero setup friction and no "long code" to paste. He controls durations directly in Settings instead.
- Legacy license route files still exist on disk but are **unmounted** (removed from route aggregation) — leaving them mounted was an auth-bypass (`/license/start-trial` created an admin session with no password). Frontend LicenseContext/LicenseControls/LicenseDurationGrant are dead code, left in place.

**Per-office branding (white-label, chosen "in settings"):** After login, if office info is unset, prompt a dialog for office name / phones / address; store locally; propagate to the print/receipt page AND the WhatsApp message. Editable later in Settings.

**WhatsApp:** free wa.me click-to-send links (no Twilio/API). Message is generated at click time so remaining-days are always accurate. `send_status` reused. Umrah = departure reminder with live remaining days; other visas = general editable message.

**Feature set A-E requested on top:** A subscription/license countdown (days/hrs/mins) in Settings; B in-app expiry warning; C Umrah "entered Kingdom" button starting a 90-day countdown (last 10 days red, then overstay red + alert) via a NEW separate button; D wa.me WhatsApp for all clients; E new visa types علاج/سياحة/دراسية (visa_type is free-text, no schema change).

**Dev/test note:** The .exe can't run in Replit — build & verify in the web stack (visa-manager + api-server on Postgres/Drizzle) in preview, then mirror backend logic into `artifacts/desktop/server` (SQLite). The desktop build predates the license/branding/entryDate/sendStatus work, so its routes + schema must be synced before shipping. Never store real credentials in memory; reset dev passwords via SQL when testing.
