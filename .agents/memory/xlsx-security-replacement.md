---
name: xlsx-security-replacement
description: Why xlsx (SheetJS) was replaced with exceljs for Excel export, and a gotcha with exceljs's own transitive dependency.
---

# xlsx (SheetJS) has no upstream fix for its 2 high CVEs

The `xlsx` npm package (SheetJS, `^0.18.5`) has two unfixed high-severity CVEs
(prototype pollution, ReDoS) with no newer version available on npm to
resolve them. A pnpm `overrides` entry cannot fix this — there is no patched
release to override to.

**How to apply:** if `runDependencyAudit()` flags `xlsx`, the fix is to
replace the library, not override its version. `exceljs` is a maintained
drop-in for write-only export use cases (browser bundle via its `browser`
field in package.json — Vite picks it up automatically). API differs from
SheetJS: build a `Workbook`/`Worksheet` object (`addWorksheet(name, { views:
[{ rightToLeft: true }] })`, `ws.addRow([...])`), then
`await wb.xlsx.writeBuffer()` and trigger a browser download via
`Blob` + object URL + a temporary `<a download>` link (no `XLSX.writeFile`
equivalent).

**Gotcha:** `exceljs@4.4.0` itself pulls in `uuid@8.3.2`, which has its own
high-severity finding (GHSA-w5hq-g745-h8pq, missing buffer bounds check).
After switching to exceljs, re-run the dependency audit — don't assume 0
findings just because the previous package is gone. Fix with a scoped pnpm
override (`"exceljs>uuid": "^11.1.1"` in `pnpm-workspace.yaml`), which pnpm
resolves without any exceljs code changes.
