import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading, isError } = useGetMe();

  useEffect(() => {
    if (!isLoading && isError && location !== "/login") {
      setLocation("/login");
    }
  }, [isLoading, isError, location, setLocation]);

  if (isLoading) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">جاري التحقق...</p>
        </div>
      </div>
    );
  }

  if (!user && !isLoading) {
    return null; // redirect in progress
  }

  return <>{children}</>;
}
