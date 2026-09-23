import React from "react";
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  BrainCircuit,
  FlaskConical,
  Clock,
  AlertTriangle,
  LogOut,
  Activity,
} from "lucide-react";
import { clearSession } from "@/lib/api";

const NAV = [
  { href: "/", icon: LayoutDashboard, label: "Overview" },
  { href: "/models", icon: BrainCircuit, label: "Models" },
  { href: "/backtests", icon: FlaskConical, label: "Backtests" },
  { href: "/automation", icon: Clock, label: "Automation" },
  { href: "/alerts", icon: AlertTriangle, label: "Alerts" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  async function logout() {
    await clearSession();
    window.location.reload();
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-sidebar-border">
          <Activity className="w-5 h-5 text-primary" />
          <div>
            <div className="text-sm font-bold text-foreground tracking-wide">TBM Admin</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Master Dashboard</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = location === href;
            return (
              <Link key={href} href={href}>
                <a
                  className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors ${
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-sidebar-border">
          <button
            onClick={logout}
            className="flex items-center gap-2.5 px-3 py-2 w-full rounded text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
