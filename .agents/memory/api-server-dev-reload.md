---
name: api-server dev watcher can run stale code
description: Why to restart the api-server workflow after editing backend routes/schema
---

After editing files under `artifacts/api-server/src` (routes, schema wiring), you MUST restart the `artifacts/api-server: API Server` workflow before testing. Its `dev` script is a one-shot `build && start` (esbuild bundle → `node dist/index.mjs`) with NO file watching, so source edits do NOT take effect until the workflow is restarted and rebuilds. A still-running process keeps serving the OLD bundle while the file on disk is already correct.

**Why:** A partial `PUT` that sent only one field (e.g. `{ sendStatus }`) 500'd with drizzle `Error: No values to set`, even though the on-disk handler already handled that field. The running process predated the edit, so its conditional-spread `.set({})` built an empty object. The error's stack-trace line number was a couple lines off from the current file — the tell-tale sign of stale code. A plain workflow restart fixed it with no code change.

**How to apply:** If a backend change "isn't taking effect", or an error's stack-trace line numbers don't line up with the current file, restart the api-server workflow FIRST — don't assume the source is wrong. Separately: conditional-spread `.set()` update handlers throw when no recognized field is present, so they now guard with `Object.keys(values).length === 0 → 400`.
