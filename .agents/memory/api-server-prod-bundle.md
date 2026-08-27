---
name: api-server production bundling
description: esbuild --packages=external breaks production (workspace TS packages left external); use explicit externals and answer 200 on GET /api.
---
- `--packages=external` externalizes `@workspace/db` too; in prod Node then imports raw TS from `lib/db/src` and dies (ERR_UNSUPPORTED_DIR_IMPORT). Dev hides this because tsx runs TS.
- **Fix:** bundle workspace packages; keep only real node_modules deps as explicit `--external:` flags. `drizzle-zod` must be bundled (dep of lib/db only, not resolvable from api-server under pnpm strict hoisting).
- Deployment health probe hits `GET /api` (the service path) and requires 200 — the API router must answer 200 at its root, not just /api/healthz.
- **How to apply:** before publishing, verify prod locally: `PORT=8081 node artifacts/api-server/dist/index.mjs` then curl /api (expect 200).
- **Every direct npm dep needs `--external:`, not just DB-related ones.** Any bundled CJS dep with a top-level `require("tty")`/`require("supports-color")` (e.g. `debug`, pulled in transitively by `express-rate-limit`) hits esbuild's ESM `__require` shim, which throws "Dynamic require of X is not supported" — crashes the process silently before it binds its port (looks like a health-check timeout, not a build error). Symptom: build succeeds, deploy fails at promote with "not all artifact ports opened", and the real stack trace only shows up in `fetchDeploymentLogs`, not the build log. Fix: `--external:` every top-level package.json dependency actually used at runtime; only bundle workspace (`@workspace/*`) packages.
