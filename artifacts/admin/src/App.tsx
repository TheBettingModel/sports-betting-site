import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { isAuthenticated } from "@/lib/api";
import { Login } from "@/pages/Login";
import { Layout } from "@/components/Layout";
import { Overview } from "@/pages/Overview";
import { Models } from "@/pages/Models";
import { Backtests } from "@/pages/Backtests";
import { Automation } from "@/pages/Automation";
import { Alerts } from "@/pages/Alerts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/models" component={Models} />
        <Route path="/backtests" component={Backtests} />
        <Route path="/automation" component={Automation} />
        <Route path="/alerts" component={Alerts} />
        <Route>
          <div className="text-muted-foreground">Page not found.</div>
        </Route>
      </Switch>
    </Layout>
  );
}

export default function App() {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return (
    <QueryClientProvider client={queryClient}>
      {isAuthenticated() ? (
        <WouterRouter base={base}>
          <Router />
        </WouterRouter>
      ) : (
        <Login />
      )}
    </QueryClientProvider>
  );
}
