import { useGetMe } from "@workspace/api-client-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export function useAuth() {
  const { data: user, isLoading, isError } = useGetMe();
  return { user, isLoading, isError };
}

export function useRequireAuth() {
  const { user, isLoading, isError } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isError) {
      setLocation("/login");
    }
  }, [isLoading, isError, setLocation]);

  return { user, isLoading };
}
