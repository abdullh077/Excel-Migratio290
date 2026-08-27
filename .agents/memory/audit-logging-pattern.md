---
name: Audit logging pattern
description: Lightweight, low-effort way to add a basic audit trail (login attempts, CRUD, downloads) to an Express + Drizzle app that has none.
---

Rule: when asked to add "basic audit logging for sensitive actions" retroactively to an app with dozens of routes, don't hand-instrument every handler. Split it in two:

1. A generic `res.on("finish", ...)` middleware mounted once, globally, after the session middleware (so `req.session.userId`/`officeId` are populated). It fires for every mutating method (POST/PUT/PATCH/DELETE) plus an explicit allowlist of sensitive GET patterns (file/backup downloads), and skips only 4xx responses (401/403/404 before real work happened is noise, not signal). Collapse numeric path segments (`/api/visas/42` → `/api/visas/:id`) so the action label groups sensibly.
2. Hand-write audit calls only for the handful of routes whose *outcome* the generic method+path label can't distinguish — chiefly login (unknown user vs wrong password vs locked vs disabled vs success are 5 different security-relevant outcomes on the same `POST /auth/login`).

Make the audit write fire-and-forget (`void db.insert(...).catch(logError)`), never `await`ed in a way that blocks the response — an audit-log outage or slow insert must not become a user-facing outage.

**Why:** covers ~95% of a full CRUD app's mutation surface with one middleware instead of touching 15+ route files, while still keeping the security-meaningful login outcomes distinct.

**How to apply:** any Express app being retrofit with audit logging where no audit table exists yet. Add the table via the project's normal drizzle-kit push flow before wiring the middleware in, and always add a final 4-arg Express error handler alongside — see session-security-baseline.md's CORS gotcha for why.
