---
name: Dependency audit triage
description: How to prioritize runDependencyAudit() findings in a pnpm monorepo before spending time on fixes.
---

Rule: before fixing a flagged package, run `pnpm why -r <package>` to see whether it's a runtime dependency of a deployed server/app, or a transitive dependency of dev-only tooling (vite plugins, `vite-plugin-pwa`/workbox, `orval`/`typedoc` codegen chains, drizzle-kit, etc.). Dev-only findings never run in the deployed request path, so they carry far less real risk than the same CVE in a server dependency that parses attacker-controlled input.

For dev-only transitive findings with an available fix, add a range-scoped `overrides` entry in `pnpm-workspace.yaml` rather than touching the direct dependency (e.g. `"brace-expansion@^5.0.0": "^5.0.9"` — scope the version range so you don't also force-upgrade an unrelated major line of the same package pulled in elsewhere, e.g. a `2.x` resolution from an older `minimatch`). Re-run `pnpm install`, `pnpm run typecheck`, and the relevant test/build scripts after adding overrides — a bumped transitive version can occasionally change peer resolution.

If a flagged runtime package has no upstream fix (e.g. `xlsx`/SheetJS prototype-pollution and ReDoS CVEs with no patched release as of 2026-08), check what the app actually does with it: if it only *writes* files from already-trusted internal data and never *parses* untrusted/uploaded input, real exploitability is low even though the audit still reports it — note this explicitly instead of leaving it as an unexplained open finding, and only replace the library if untrusted-input parsing is ever added.

**Why:** running `pnpm why -r` first (visa-manager audit, 2026-08-27) showed all 6 non-esbuild high/moderate findings were dev-tool-only (vite/postcss/orval/vite-plugin-pwa chains), which reframed the fix from "urgent production risk" to "safe to batch-patch via overrides, no urgency."

**How to apply:** any `runDependencyAudit()` pass in a pnpm workspace before writing a remediation plan or reporting severity to the user.
