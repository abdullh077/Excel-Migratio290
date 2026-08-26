import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { RequireOnline } from "@/components/layout/RequireOnline";
import { OfflineStatusBar } from "@/components/layout/OfflineStatusBar";
import { useGetMe } from "@/hooks/useAuth";
import { defaultQueryFn, clearClientCaches } from "@/lib/api";
import { hydrateAuthCache } from "@/lib/offline/authCache";
import { flushOutbox, refreshPendingCount } from "@/lib/offline/outbox";
import { patchSyncStatus } from "@/lib/offline/net";
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

// Umrah/visas/statement pages read+write through the offline cache and
// outbox (see src/lib/offline/), so query results for those pages should
// stay resident for the session rather than being treated as always-fresh
// server truth. Dashboard/Archive/Provider/Office remain online-required
// and behave the same as before.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      retry: false,
      staleTime: 30_000,
    },
  },
});

// One-time cleanup: wipe the old (pre-outbox) ad hoc localStorage cache
// left by earlier builds.
void clearClientCaches();

// Hydrate the cached identity (for offline login continuation) and try to
// flush any writes queued while offline, both at startup and whenever the
// connection comes back.
void hydrateAuthCache();
void refreshPendingCount();
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    patchSyncStatus({ online: true });
    void flushOutbox();
  });
  void flushOutbox();
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

// Dashboard, Archive, Provider, and Office (branding + sub-accounts +
// backup/restore) stay online-required in this phase; everything else
// (Umrah, Other visas, Statement) works fully offline once authenticated.
function withOnlineGate(Component: React.ComponentType) {
  return function Gated() {
    return (
      <RequireOnline>
        <Component />
      </RequireOnline>
    );
  };
}

const GatedDashboard = withOnlineGate(DashboardPage);
const GatedArchive = withOnlineGate(ArchivePage);
const GatedOffice = withOnlineGate(OfficePage);
const GatedProvider = withOnlineGate(ProviderPage);

function ProtectedRoutes() {
  return (
    <AuthGuard>
      <Switch>
        <Route path="/" component={GatedDashboard} />
        <Route path="/umrah" component={UmrahPage} />
        <Route path="/visas" component={VisasPage} />
        <Route path="/archive" component={GatedArchive} />
        <Route path="/statement" component={StatementPage} />
        <Route path="/office" component={GatedOffice} />
        <Route path="/provider" component={GatedProvider} />
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
        <Router />
        <OfflineStatusBar />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
