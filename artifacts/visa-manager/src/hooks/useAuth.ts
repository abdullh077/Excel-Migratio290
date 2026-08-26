import { useQuery } from "@tanstack/react-query";
import { apiRequest, type ApiError } from "@/lib/api";
import { saveIdentity, hydrateAuthCache, isIdentityValidOffline, clearIdentity } from "@/lib/offline/authCache";

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  officeId?: number;
  expiresAt?: string | null;
  officeName?: string | null;
  officeConfigured?: boolean;
  __offline?: boolean;
  [key: string]: any;
}

// Offline continuation: a genuine 401/403 (or any other HTTP rejection) from
// the server is never masked — it always redirects to login, even offline.
// Only a real network failure (server unreachable) falls back to the last
// identity cached after a previous successful online login/me check, and
// only if that cached account hasn't locally expired or been disabled.
async function fetchMe(): Promise<AuthUser> {
  try {
    const user = await apiRequest<AuthUser>("/api/auth/me");
    if (user?.officeId != null) {
      await saveIdentity({
        id: user.id,
        username: user.username,
        role: user.role,
        officeId: user.officeId,
        expiresAt: user.expiresAt ?? null,
      });
    }
    return user;
  } catch (err) {
    const apiErr = err as ApiError;
    if (apiErr?.status) {
      // Real rejection from the server — clear any cached offline session too.
      await clearIdentity();
      throw err;
    }
    const cached = await hydrateAuthCache();
    if (cached && isIdentityValidOffline(cached)) {
      return {
        id: cached.id,
        username: cached.username,
        role: cached.role,
        officeId: cached.officeId,
        expiresAt: cached.expiresAt,
        __offline: true,
      };
    }
    throw err;
  }
}

export function useGetMe() {
  return useQuery<AuthUser>({
    queryKey: ["/api/auth/me"],
    queryFn: fetchMe,
  });
}

export function useAuth() {
  const { data: user, isLoading, isError } = useGetMe();
  return { user, isLoading, isError };
}
