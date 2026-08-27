---
name: Session security baseline
description: Pre-launch session/cookie hardening required for any Express SaaS on Replit autoscale.
---

Rule: before launching a session-based Express app on Replit, always set: `app.set("trust proxy", 1)` in production (TLS terminates at Replit's proxy — without it `secure` cookies are never sent), cookie `{ secure: isProd, httpOnly: true, sameSite: "lax" }`, and `req.session.regenerate()` inside the login handler before attaching the user identity (session fixation).

**Why:** final security audit of visa-manager failed launch on exactly these three; they are invisible in dev (plain HTTP, single instance) and only bite in production.

**How to apply:** any new Express + express-session artifact; verify login still works via curl after adding regenerate (callback-style API).

**2026-08-27 addendum — fuller hardening checklist:** a full security-review pass on visa-manager also added `helmet()` (with `contentSecurityPolicy`/`crossOriginEmbedderPolicy`/`crossOriginResourcePolicy` disabled — the API only ever serves JSON to a same-origin frontend, so those directives add nothing and risk breaking the proxy), `express-rate-limit` both globally (coarse IP throttle) and tightened on `/api/auth/login` (`skipSuccessfulRequests: true`, since a per-account lockout already existed but did nothing against distributed/username-spray attacks from one IP), and bumped bcrypt cost from 10→12. No `cors` package was added: with no CORS middleware at all, Express/browsers default to same-origin-only, which is already the correct posture for an app whose frontend always calls relative `/api/...` paths — don't add permissive CORS just to "cover" the checklist item.
