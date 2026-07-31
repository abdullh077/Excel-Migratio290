# نظام عبور الذكي — نظام إدارة تأشيرات العمرة

نظام إدارة متكامل لمكتب اللواء الغربي للنقل والسفريات والسياحة. يدير تأشيرات العمرة والتأشيرات الأخرى مع تتبع مالي كامل.

## Run & Operate

- `pnpm --filter @workspace/visa-manager run dev` — run the frontend (Vite, uses PORT env)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)
- Required env: `SESSION_SECRET` — session signing key (set as Replit Secret)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, Recharts, wouter (RTL Arabic)
- API: Express 5 + express-session + connect-pg-simple
- Auth: bcryptjs password hashing, pgcrypto for DB seeding, session cookies
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for API contracts
- `lib/db/src/schema/` — Drizzle table definitions (users, umrah_clients, other_visas, sessions)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/visa-manager/src/pages/` — React pages (login, dashboard, umrah, visas, archive, receipt, settings)
- `artifacts/visa-manager/src/components/layout/` — AppLayout, Sidebar

## Product

- **تسجيل الدخول** — username/password auth with session cookies
- **لوحة مؤشرات الأداء** — KPI cards, monthly bar chart, agent performance table, outstanding balances
- **إدارة المعتمرين** — full CRUD, search/filter, inside/outside KSA status
- **التأشيرات الأخرى** — full CRUD with financial tracking (received, balance, agent transfers)
- **الأرشيف العام** — unified read-only view of all records
- **إشعار العميل** — printable/PDF receipt page
- **إدارة المستخدمين** — admin-only: create/delete system users

## Default credentials

- Username: `admin`
- Password: `admin123`
- Change this after first login via Settings → إضافة مستخدم جديد

## User preferences

- Arabic RTL interface throughout
- Start with web app (desktop first), mobile app later
- PDF receipt: optional print button (browser print-to-PDF)
- Single admin user who can share access by creating additional users with username/password

## Gotchas

- pgcrypto extension is used for DB seeding (`crypt()` + `gen_salt('bf')`), while bcryptjs handles runtime auth — both produce bcrypt-compatible hashes
- React Query is configured with `retry: false` on 401/403 errors to avoid infinite loading spinner
- The sessions table is auto-created by connect-pg-simple (`createTableIfMissing: true`)
- `SESSION_SECRET` must be set as a Replit Secret — the app will crash on startup if missing

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
