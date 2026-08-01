import { useEffect } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useGetMe } from "@/hooks/useAuth";
import { defaultQueryFn } from "@/lib/api";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      retry: false,
      staleTime: 30_000,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "oboor-query-cache-v1",
});

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
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7,
      }}
    >
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </PersistQueryClientProvider>
  );
}

export default App;
