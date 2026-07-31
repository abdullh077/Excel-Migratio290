---
name: Autoscale scheduled work
description: How to run periodic jobs (backups, cleanups) when the app is on Replit autoscale with no cron.
---

Rule: on autoscale deployments the server sleeps when idle, so timers/cron never fire reliably. Implement "daily" jobs as a lazy guard: on any authenticated request of the responsible role, check cheaply whether today's run already happened (e.g. does today's backup object exist in App Storage) and run it fire-and-forget if not. Never let the job block or fail the request.

**Why:** the visa-manager daily DB backup originally hooked only provider *login*; long-lived sessions meant days without backups. Moving the check into the provider auth middleware made it trigger on any provider activity.

**How to apply:** any periodic task on autoscale — piggyback on request traffic, dedupe via an idempotent existence check, wrap in try/catch.
