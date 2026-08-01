import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  officeName?: string | null;
  officeConfigured?: boolean;
  [key: string]: any;
}

export function useGetMe() {
  return useQuery<AuthUser>({
    queryKey: ["/api/auth/me"],
    queryFn: () => apiRequest<AuthUser>("/api/auth/me"),
  });
}

export function useAuth() {
  const { data: user, isLoading, isError } = useGetMe();
  return { user, isLoading, isError };
}
