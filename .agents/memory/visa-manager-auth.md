---
name: Visa Manager Auth Pattern
description: Auth setup combining bcryptjs (runtime) + pgcrypto (seeding) with React Query retry config to avoid infinite spinner on 401.
---

**Rule:** When using session-based auth with `useGetMe()` as the auth guard, configure React Query to NOT retry on 401/403 errors. Without this, the loading spinner stays forever while React Query retries.

**Why:** React Query by default retries failed queries 3 times. On the auth check (`GET /api/auth/me`), a 401 response causes 3 retries before `isError` becomes true. During those retries, `isLoading` is true and the spinner shows. Only after all retries does `isError` become true and the redirect to `/login` fires.

**How to apply:**
```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});
```

**pgcrypto vs bcryptjs:** For seeding via `executeSql`, use pgcrypto's `crypt(password, gen_salt('bf', 10))`. For runtime verification in Node.js, use `bcryptjs.compare()`. Both use the bcrypt algorithm and are cross-compatible — bcryptjs can verify a hash created by pgcrypto and vice versa.

**Session secret:** Must be a Replit Secret (`SESSION_SECRET`). Using `process.env.SESSION_SECRET!` (no fallback) causes fast fail if missing, which is correct behavior.

**Password inputs are intentionally `type="text"` (visible) in Settings** (create-account + change-password dialogs). **Why:** the admin/owner sets the password and must read it to hand the credential to the office he's provisioning; hiding it defeats the workflow. Do NOT "fix" these to `type="password"` without adding a show/hide toggle. Account management is admin-only (`requireAdmin`); admin can change any password including his own via `PATCH /users/:id/password`.
