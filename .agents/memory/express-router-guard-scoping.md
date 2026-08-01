---
name: Express router guard scoping
description: Unscoped router.use(middleware) in a sub-router mounted at root leaks the guard into ALL later routers.
---
In api-server, every sub-router is mounted at root (`router.use(subRouter)`), so `router.use(requireX)` without a path prefix runs for EVERY /api request that reaches it — e.g. `requireProvider` in provider.ts was 403-ing statement/vouchers, and umrah's `requireOffice` blocked the public branding route.

**Why:** Express `.use` without a path matches all paths; mounting order determines which guard fires first.

**How to apply:** Always path-scope guards in route files (`router.use("/provider", requireProvider)`) and mount public routes (like GET /settings/branding via publicSettingsRouter) before any guarded router in routes/index.ts.
