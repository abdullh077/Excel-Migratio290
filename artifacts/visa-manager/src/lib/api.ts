// Small fetch helper with credentials + client cache utilities.

export type ApiError = Error & { status?: number; data?: any };

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: "include", ...init });
}

export async function apiRequest<T = any>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, { credentials: "include", ...init });
  if (!res.ok) {
    let data: any = undefined;
    try {
      data = await res.json();
    } catch {
      // ignore parse errors
    }
    const err = new Error(data?.error || `خطأ ${res.status}`) as ApiError;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  // Some endpoints may return empty bodies
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// Default query function for react-query: query key [0] is the URL.
export const defaultQueryFn = async ({ queryKey }: { queryKey: readonly unknown[] }) => {
  const url = queryKey[0] as string;
  return apiRequest(url);
};

// Removes persisted query cache + API service-worker cache.
export async function clearClientCaches(): Promise<void> {
  try {
    localStorage.removeItem("oboor-query-cache-v1");
  } catch {
    // ignore
  }
  try {
    if (typeof caches !== "undefined") {
      await caches.delete("api-cache");
    }
  } catch {
    // ignore
  }
}
