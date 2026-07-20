import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BrainCircuit, AlertTriangle, Clock, TrendingUp,
  Activity, CheckCircle2, XCircle,
} from "lucide-react";
import { adminApi, type AdminOverview } from "@/lib/api";
import { pct, units, timeAgo, statusColor, statusDot } from "@/lib/utils";

function KPI({
  icon: Icon, label, value, sub, accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <div className={`text-2xl font-bold ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function Overview() {
  const { data, isLoading, error } = useQuery<AdminOverview>({
    queryKey: ["admin-overview"],
    queryFn: () => adminApi.overview(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="text-muted-foreground text-sm">Loading overview…</div>;
  if (error) return <div className="text-red-400 text-sm">Error: {(error as Error).message}</div>;
  if (!data) return null;

  const { production, challengers, alerts, grading, performance, automation } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Model health, alert status, and automation</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI icon={BrainCircuit} label="Production Models" value={String(production.modelCount)} sub="active" accent />
        <KPI icon={Activity} label="Challengers" value={String(challengers.count)} sub="in shadow mode" />
        <KPI icon={AlertTriangle} label="Active Alerts" value={String(alerts.total)}
          sub={`${alerts.driftAlerts} drift · ${alerts.dataQualityAlerts} data quality`}
          accent={alerts.total > 0} />
        <KPI icon={Clock} label="Pending Picks" value={String(grading.pendingPicks)} sub="awaiting grade" />
      </div>

      {/* Performance row */}
      <div className="grid grid-cols-3 gap-3">
        <KPI icon={TrendingUp} label="Total Graded" value={String(performance.totalGradedPicks)} sub="decisive picks" />
        <KPI icon={TrendingUp} label="Avg Win Rate" value={pct(performance.avgWinRate)} sub="across all models" accent={!!performance.avgWinRate && performance.avgWinRate >= 0.5} />
        <KPI icon={TrendingUp} label="Avg ROI" value={units(performance.avgROI)} sub="per pick risked" accent={!!performance.avgROI && performance.avgROI > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Automation health */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Automation</h2>
            <span className={`text-xs font-medium ${statusColor(automation.health)}`}>
              {automation.health.toUpperCase()}
            </span>
          </div>
          {automation.lastRun ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusDot(automation.lastRun.status)}`} />
                <span className="text-sm text-foreground">{automation.lastRun.jobName}</span>
                <span className={`text-xs ${statusColor(automation.lastRun.status)}`}>{automation.lastRun.status}</span>
              </div>
              <div className="text-xs text-muted-foreground pl-3.5">
                {timeAgo(automation.lastRun.startedAt)}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No jobs have run yet.</p>
          )}
        </div>

        {/* Production model list */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Production Models</h2>
          {production.models.length === 0 ? (
            <p className="text-sm text-muted-foreground">No models in production.</p>
          ) : (
            <div className="space-y-1.5">
              {production.models.map((m) => (
                <div key={m.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-sm text-foreground">{m.sport}</span>
                    <span className="text-xs text-muted-foreground">{m.market}</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{m.modelId.split("-").pop()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
