---
name: Session security baseline
description: Pre-launch session/cookie hardening required for any Express SaaS on Replit autoscale.
---

Rule: before launching a session-based Express app on Replit, always set: `app.set("trust proxy", 1)` in production (TLS terminates at Replit's proxy — without it `secure` cookies are never sent), cookie `{ secure: isProd, httpOnly: true, sameSite: "lax" }`, and `req.session.regenerate()` inside the login handler before attaching the user identity (session fixation).

**Why:** final security audit of visa-manager failed launch on exactly these three; they are invisible in dev (plain HTTP, single instance) and only bite in production.

**How to apply:** any new Express + express-session artifact; verify login still works via curl after adding regenerate (callback-style API).
