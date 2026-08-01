---
name: Original bundle recovery
description: The visa-manager UI/API contract was restored verbatim from the published production JS bundle; specs are the source of truth.
---
The published app's exact behavior (Arabic strings, routes, API payload shapes) was extracted from its production bundle into `.recovery/specs/*.md` (bundle itself at `.recovery/app.pretty.js`).

**Why:** Git/checkpoints lacked the original source; the deployed bundle was the only source of truth. Frontend pages use plain fetch + react-query (NOT generated orval hooks) to match the original.

**How to apply:** When changing visa-manager pages or api-server routes, check `.recovery/specs/` first and keep the original contract: `/receipt/:id?type=umrah|visa` (query param), Arabic sendStatus values, `GET /api/statement/agents/:id` returns `{agent,totals,payments,transactions}`, provider subs take `parentId`, backups list returns `{name,size,createdAt}` objects, public `GET /api/settings/branding` feeds the login page.
