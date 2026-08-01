---
name: Visa Manager multi-tenancy & office hierarchy
description: How accounts, offices, and data isolation work in the WEB api-server
---
## Model (WEB api-server — the distributed product)
Three roles on `usersTable.role`: **provider** (the vendor / me), **owner** (office main account), **sub** (employee sub-account).
- `usersTable.parentUserId` (nullable): sub → owner's id; null for owner & provider.
- **officeId** = owner/provider: own id; sub: parentUserId. The provider account doubles as its own full office (uses the app like a client) plus the provider-only management area. Compute once in auth, attach to `req.officeId`.
- Data tables (`umrah_clients`, `other_visas`, `office_settings`) keep their `userId` column but it stores the **officeId** (owner id), NOT the acting user's id. So owner + all their subs share one office's data. Every data query filters/inserts by `req.officeId`.

## Subscription expiry
Lives on the **owner** account (`expiresAt`). Auth must check the OWNER's expiry for subs too (a sub of an expired office is blocked). Provider & owner-unlimited = null.

## Licensing REMOVED
The offline code/HMAC/trial licensing system was fully removed from the WEB product. No activation codes, no machine id, no trial. Access = username/password + owner subscription window only.

**Why:** user pivoted from offline .exe-per-device to an online central multi-office SaaS distributed as an Electron shell.

## Provider dashboard
Only `provider` creates owner accounts (with expiry) AND sub accounts (under an owner). Owners/subs do NOT self-manage accounts. Owner can still edit their office branding (office_settings). Settings/user-management page is provider-gated.

## Known fixes baked in
- Dashboard "داخل المملكة" count must use `entryDate` (present AND within 90 days), NOT issueDate+stayDuration. New pilgrim = خارج (red) until تسجيل الدخول pressed.
- `issuingAuthority` (جهة الإصدار) is hidden from the customer receipt/PDF; `transactionParty` (جهة المعاملة) is a new field shown on the receipt.

## Desktop exe = thin SaaS shell (converted 2026-07-20)
`artifacts/desktop` is now a THIN Electron shell (v2.0.0): `loadURL` of the published production URL, offline.html fallback + retry IPC, no embedded server/sqlite/native deps (old offline server was deleted). Build with `npx electron-builder --win zip --x64` (zip target — nsis needs wine). The exe only works after the user re-publishes so the live deployment carries the new multi-tenant backend. Get the production URL via getDeploymentInfo, never guess.

## Schema apply
`pnpm --filter @workspace/db run push` (drizzle-kit push). No migrate-on-boot.

## Update 2026-08: sub accounts full-featured
- /statement/* and /vouchers use requireOffice (subs allowed); /office/* stays requireOwner.
- Statement client key: transactions carry a `client` field (اسم العميل) separate from `clientName` (اسم الجواز/passport holder). Visas fall back coalesce(nullif(client,''),client_name) for legacy rows; legacy umrah rows (client='') stay unlinked deliberately.
- client_accounts.openingBalance folds into statement balance and ledger.opening; upserted by ensureClientAccount() on umrah/visa save.
