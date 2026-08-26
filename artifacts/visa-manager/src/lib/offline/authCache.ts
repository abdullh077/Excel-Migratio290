// Offline-continuation of authentication: after any successful online
// `/api/auth/me` or `/api/auth/login` response, the identity + account
// validity is cached locally so the app can keep opening (and using the
// offline pages) on this device even when a later launch has no network.
//
// This never replaces a real login: the very first login on a device must
// still succeed online (there is nothing to fall back to yet). A genuine
// 401/403 rejection from the server is never masked by the cache — only a
// network failure (can't reach the server at all) falls back to it.

import { idbGet, idbPut, idbDelete, STORE_AUTH } from "./idb";

const KEY = "current";

export interface CachedIdentity {
  id: number;
  username: string;
  role: string;
  officeId: number;
  expiresAt: string | null; // subscription/account expiry, ISO date or null = no expiry
  disabled?: boolean;
  cachedAt: string;
}

// In-memory mirror so synchronous code (offlineFetch) can read the current
// office id without awaiting IndexedDB on every call.
let currentOfficeId: number | null = null;

export function getCurrentOfficeId(): number | null {
  return currentOfficeId;
}

export async function hydrateAuthCache(): Promise<CachedIdentity | undefined> {
  const cached = await idbGet<CachedIdentity>(STORE_AUTH, KEY);
  if (cached) currentOfficeId = cached.officeId;
  return cached;
}

export async function saveIdentity(user: { id: number; username: string; role: string; officeId: number; expiresAt?: string | null; disabled?: boolean }): Promise<void> {
  currentOfficeId = user.officeId;
  const record: CachedIdentity = {
    id: user.id,
    username: user.username,
    role: user.role,
    officeId: user.officeId,
    expiresAt: user.expiresAt ?? null,
    disabled: user.disabled ?? false,
    cachedAt: new Date().toISOString(),
  };
  await idbPut(STORE_AUTH, { key: KEY, ...record });
}

export async function clearIdentity(): Promise<void> {
  currentOfficeId = null;
  await idbDelete(STORE_AUTH, KEY);
}

/** Is the cached identity still usable for an offline app launch? */
export function isIdentityValidOffline(cached: CachedIdentity | undefined): boolean {
  if (!cached) return false;
  if (cached.disabled) return false;
  if (cached.expiresAt && new Date(cached.expiresAt).getTime() < Date.now()) return false;
  return true;
}
