import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { AuthGuard } from "@/components/layout/AuthGuard";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import UmrahPage from "@/pages/umrah";
import VisasPage from "@/pages/visas";
import ArchivePage from "@/pages/archive";
import StatementPage from "@/pages/statement";
import VouchersPage from "@/pages/vouchers";
import OfficePage from "@/pages/office";
import ProviderPage from "@/pages/provider";
import ReceiptPage from "@/pages/receipt";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.response?.status === 401 || error?.response?.status === 403) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
    },
  },
});

function ProtectedRoutes() {
  return (
    <AuthGuard>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/umrah" component={UmrahPage} />
        <Route path="/visas" component={VisasPage} />
        <Route path="/archive" component={ArchivePage} />
        <Route path="/statement" component={StatementPage} />
        <Route path="/vouchers" component={VouchersPage} />
        <Route path="/office" component={OfficePage} />
        <Route path="/provider" component={ProviderPage} />
        <Route path="/receipt/:type/:id" component={ReceiptPage} />
        <Route component={NotFound} />
      </Switch>
    </AuthGuard>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route component={ProtectedRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
