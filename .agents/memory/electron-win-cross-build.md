---
name: Electron Windows cross-build from Linux
description: How to correctly build a Windows .exe with native modules (better-sqlite3) from a Linux host using electron-builder.
---

## The Problem
`electron-builder --win` from Linux runs `@electron/rebuild` against the HOST platform, packaging a Linux ELF `.node` binary inside the Windows `.exe`. The app crashes on first Windows launch with a native module error.

## The Fix
1. Set `"npmRebuild": false` in the electron-builder `build` config to prevent it from overwriting the binary.
2. Before running electron-builder, download the correct Windows prebuild from the `better-sqlite3` GitHub releases and copy it to `node_modules/better-sqlite3/build/Release/better_sqlite3.node`.
3. Verify the binary is a Windows PE (`MZ` magic bytes) before packaging.

**Why:** electron-builder does not cross-compile native modules; it rebuilds for whatever platform node is running on. The `npmRebuild: false` flag + manual prebuild injection is the only reliable path from Linux → Windows for packages like better-sqlite3.

## ABI Derivation
Electron 36.x uses module ABI **135**. Use `node-abi`'s `abi_registry.json` to look up the ABI dynamically. Fallback table: `{ "36": "135", "35": "135", "34": "133", "33": "132" }`.

The inject script lives at `artifacts/desktop/scripts/inject-win-native.js` and is wired into `"dist"` in package.json.

## Session Secret
Desktop Express server should generate a random 48-byte secret on first run and persist it to `DATA_DIR/.session-secret` (mode 0600). Never hardcode a session secret.

## NSIS installer needs wine (Linux) → use zip target instead
electron-builder 26.x building the `nsis` target from Linux tries to sign the bundled `elevate.exe` via
`signtool` through **wine**, which isn't installed → `wine process failed ENOENT`. `CSC_IDENTITY_AUTO_DISCOVERY=false`
does NOT gate that call. Reliable fix without installing wine: build the **`zip`** target
(`electron-builder --win zip --x64`) — it packages `win-unpacked` (which is already complete, with the injected
Windows PE better_sqlite3.node) and skips the elevate.exe signing. Deliver the zip; user extracts + runs the
`.exe`. (`dir` target = the unpacked folder; `portable`/`nsis` still hit the wine path.)
Note: presentAsset DOES accept `.zip` (delivered a 125MB build fine).

## inject-win-native corrupts its own linux-backup on a second run
The inject script saves a `better_sqlite3.node.linux-backup` before swapping in the Windows PE. Running
inject **twice** overwrites that backup with the already-Windows binary, so the Linux ELF is lost and the
store copy stays Windows PE. `pnpm rebuild better-sqlite3` did NOT restore it (kept serving the prebuilt).
Consequence: you cannot `require('better-sqlite3')` from Node in dev after injecting. For the **build** this
is fine (packaging wants the Windows PE). To smoke-test desktop SQL logic (schema/migrations/CRUD) without
the native binary, use Node's built-in `node:sqlite` (`DatabaseSync`, Node 24+) — it mirrors the
better-sqlite3 sync API closely enough to validate SQL and migration paths.

## Startup Race
`startServer()` in `main.js` must resolve **only** on `READY` in stdout, and reject on child `exit` or `error`. The original 3s timeout fallback masked crashes silently.
