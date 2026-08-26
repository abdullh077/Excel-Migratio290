import { useEffect, useSyncExternalStore } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import { Loader2, WifiOff } from "lucide-react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useGetMe } from "@/hooks/useAuth";
import { defaultQueryFn, clearClientCaches } from "@/lib/api";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import UmrahPage from "@/pages/umrah";
import VisasPage from "@/pages/visas";
import ArchivePage from "@/pages/archive";
import StatementPage from "@/pages/statement";
import OfficePage from "@/pages/office";
import ProviderPage from "@/pages/provider";
import ReceiptPage from "@/pages/receipt";
import NotFound from "@/pages/not-found";

// The app is online-only: query results live only in memory for the
// current session and are never persisted to disk, so a device can never
// show stale/old data after being closed and reopened. Server data is the
// single source of truth (also what lets it stay in sync across the
// owner's main account and its sub-accounts).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      retry: false,
      staleTime: 30_000,
    },
  },
});

// One-time cleanup: wipe any query cache / offline outbox left in
// localStorage by older builds that supported offline use.
void clearClientCaches();

function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

// Blocks the entire app whenever there is no network connection. This
// program requires a live connection at all times, so data always stays
// synced with the server and shared correctly between the main account and
// its sub-accounts — nothing is ever shown from a local/offline cache.
function OfflineGate({ children }: { children: React.ReactNode }) {
  const online = useOnline();

  if (online) return <>{children}</>;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-6"
    >
      <div className="max-w-sm text-center">
        <WifiOff className="w-12 h-12 mx-auto mb-4 text-destructive" />
        <h1 className="text-lg font-bold mb-2">لا يوجد اتصال بالإنترنت</h1>
        <p className="text-sm text-muted-foreground">
          يعمل هذا البرنامج بالاتصال بالإنترنت فقط لضمان حفظ بياناتك على
          الخادم ومزامنتها بين الحساب الرئيسي والحسابات الفرعية. يرجى
          الاتصال بالإنترنت للمتابعة.
        </p>
      </div>
    </div>
  );
}

// Receipt is authenticated but renders without the app shell.
function ReceiptRoute() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading, isError } = useGetMe();

  useEffect(() => {
    if (isError) setLocation("/login");
  }, [isError, setLocation]);

  if (isLoading) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center bg-background"
      >
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (isError || !user) return null;

  return <ReceiptPage />;
}

function ProtectedRoutes() {
  return (
    <AuthGuard>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/umrah" component={UmrahPage} />
        <Route path="/visas" component={VisasPage} />
        <Route path="/archive" component={ArchivePage} />
        <Route path="/statement" component={StatementPage} />
        <Route path="/office" component={OfficePage} />
        <Route path="/provider" component={ProviderPage} />
        <Route component={NotFound} />
      </Switch>
    </AuthGuard>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/receipt/:id" component={ReceiptRoute} />
      <Route component={ProtectedRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <OfflineGate>
          <Router />
        </OfflineGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
