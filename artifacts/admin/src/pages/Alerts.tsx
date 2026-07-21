import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, ShieldAlert, ChevronDown, ChevronRight, Clock, Bot, User } from "lucide-react";
import { adminApi, type DriftAlert, type DQAlert } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-500/10 text-red-400 border border-red-500/20",
    warning: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
    info: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${map[severity] ?? "bg-zinc-800 text-zinc-400"}`}>
      {severity}
    </span>
  );
}

function StatusBadge({ resolved }: { resolved: boolean }) {
  return resolved ? (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-green-500/10 text-green-400 border border-green-500/20">
      resolved
    </span>
  ) : (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-orange-500/10 text-orange-400 border border-orange-500/20">
      active
    </span>
  );
}

/** Shows who/what resolved an alert with a distinct badge + timestamp. */
function ResolvedByCell({
  resolvedAt,
  resolvedBy,
}: {
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}) {
  if (!resolvedAt) return <span className="text-zinc-600">—</span>;

  const isAuto = resolvedBy === "scheduler:auto";
  const label = isAuto
    ? "Auto (scheduler)"
    : resolvedBy && resolvedBy !== "admin"
    ? resolvedBy
    : "Admin";

  return (
    <div className="flex flex-col gap-1">
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium w-fit ${
          isAuto
            ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
            : "bg-sky-500/10 text-sky-400 border border-sky-500/20"
        }`}
      >
        {isAuto ? (
          <Bot className="w-3 h-3 shrink-0" />
        ) : (
          <User className="w-3 h-3 shrink-0" />
        )}
        {label}
      </span>
      <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
        <Clock className="w-3 h-3 shrink-0" />
        {timeAgo(resolvedAt)}
      </span>
    </div>
  );
}

interface SportGroupProps {
  sport: string;
  alerts: DQAlert[];
  onResolve: (id: number) => void;
  isResolving: boolean;
}

function SportAlertGroup({ sport, alerts, onResolve, isResolving }: SportGroupProps) {
  const [expanded, setExpanded] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  const activeAlerts = alerts.filter((a) => !a.isResolved);
  const resolvedAlerts = alerts.filter((a) => a.isResolved);
  const visibleAlerts = showResolved ? alerts : activeAlerts;

  const hasActive = activeAlerts.length > 0;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Sport header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/20 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span className="text-sm font-semibold text-foreground capitalize">{sport}</span>
          <div className="flex items-center gap-1.5">
            {hasActive ? (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-orange-500/15 text-orange-400 border border-orange-500/20">
                {activeAlerts.length} active
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                clear
              </span>
            )}
            {resolvedAlerts.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400">
                {resolvedAlerts.length} resolved
              </span>
            )}
          </div>
        </div>
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {resolvedAlerts.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
                className="accent-primary"
              />
              Show history
            </label>
          )}
        </div>
      </button>

      {/* Alert rows */}
      {expanded && (
        <div className="border-t border-border">
          {visibleAlerts.length === 0 ? (
            <div className="px-4 py-6 text-center text-muted-foreground text-sm">
              No active alerts for {sport}.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-accent/10">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Severity</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Triggered</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Resolved by</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleAlerts.map((a) => (
                  <tr
                    key={a.id}
                    className={`hover:bg-accent/20 transition-colors ${a.isResolved ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3"><StatusBadge resolved={a.isResolved} /></td>
                    <td className="px-4 py-3"><SeverityBadge severity={a.severity} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{a.alertType}</td>
                    <td className="px-4 py-3 text-xs text-foreground max-w-xs">{a.description}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{timeAgo(a.createdAt)}</td>
                    <td className="px-4 py-3">
                      <ResolvedByCell resolvedAt={a.resolvedAt} resolvedBy={a.resolvedBy} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!a.isResolved && (
                        <button
                          onClick={() => onResolve(a.id)}
                          disabled={isResolving}
                          className="flex items-center gap-1 ml-auto px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded text-xs hover:bg-green-500/20 transition-colors disabled:opacity-40"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function Alerts() {
  const qc = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);

  // Drift alerts: use global showResolved toggle
  const { data: driftData, isLoading: driftLoading } = useQuery({
    queryKey: ["alerts", "drift", showResolved],
    queryFn: () => adminApi.alerts(showResolved),
    refetchInterval: 30_000,
  });

  // DQ alerts: always fetch all (active + resolved) for sport-grouped history
  const { data: dqData, isLoading: dqLoading } = useQuery({
    queryKey: ["alerts", "dq", "all"],
    queryFn: () => adminApi.alertsAll(),
    refetchInterval: 30_000,
  });

  const resolve = useMutation({
    mutationFn: ({ type, id }: { type: "drift" | "dq"; id: number }) =>
      adminApi.resolveAlert(type, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const driftAlerts: DriftAlert[] = driftData?.drift.alerts ?? [];
  const dqAlerts: DQAlert[] = dqData?.dataQuality.alerts ?? [];

  // Group DQ alerts by sport
  const dqBySport = dqAlerts.reduce<Record<string, DQAlert[]>>((acc, alert) => {
    const key = alert.sport ?? "Unknown / Global";
    if (!acc[key]) acc[key] = [];
    acc[key].push(alert);
    return acc;
  }, {});

  // Sort sports: those with active alerts first, then alphabetically
  const sortedSports = Object.keys(dqBySport).sort((a, b) => {
    const aActive = dqBySport[a]!.filter((x) => !x.isResolved).length;
    const bActive = dqBySport[b]!.filter((x) => !x.isResolved).length;
    if (aActive !== bActive) return bActive - aActive;
    return a.localeCompare(b);
  });

  const activeDriftCount = driftAlerts.filter((a) => !a.isResolved).length;
  const activeDQCount = dqAlerts.filter((a) => !a.isResolved).length;

  const isLoading = driftLoading || dqLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Alerts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Drift and data quality issues</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading alerts…</div>
      ) : (
        <>
          {/* Summary counts */}
          <div className="flex gap-3">
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium text-foreground">{activeDriftCount}</span>
              <span className="text-xs text-muted-foreground">Active Drift</span>
            </div>
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium text-foreground">{activeDQCount}</span>
              <span className="text-xs text-muted-foreground">Active Data Quality</span>
            </div>
          </div>

          {/* Drift Alerts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                Model Drift Alerts
              </h2>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={showResolved}
                  onChange={(e) => setShowResolved(e.target.checked)}
                  className="accent-primary"
                />
                Show resolved
              </label>
            </div>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Severity</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Metric</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Baseline</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Current</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Age</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Resolved by</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {driftAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">
                        {showResolved ? "No resolved alerts." : "No active drift alerts. All models healthy."}
                      </td>
                    </tr>
                  ) : driftAlerts.map((a) => (
                    <tr key={a.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3"><SeverityBadge severity={a.severity} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{a.alertType}</td>
                      <td className="px-4 py-3 text-xs font-mono text-foreground">{a.metricName}</td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">{a.baselineValue.toFixed(4)}</td>
                      <td className="px-4 py-3 text-right text-xs text-foreground">{a.currentValue.toFixed(4)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(a.createdAt)}</td>
                      <td className="px-4 py-3">
                        <ResolvedByCell resolvedAt={a.resolvedAt} resolvedBy={a.resolvedBy} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!a.isResolved && (
                          <button
                            onClick={() => resolve.mutate({ type: "drift", id: a.id })}
                            disabled={resolve.isPending}
                            className="flex items-center gap-1 ml-auto px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded text-xs hover:bg-green-500/20 transition-colors disabled:opacity-40"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Data Quality Alerts — grouped by sport */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              Data Quality Alerts
              <span className="text-xs font-normal text-muted-foreground">by sport</span>
            </h2>
            {sortedSports.length === 0 ? (
              <div className="bg-card border border-border rounded-lg px-4 py-8 text-center text-muted-foreground text-sm">
                No data quality alerts.
              </div>
            ) : (
              <div className="space-y-2">
                {sortedSports.map((sport) => (
                  <SportAlertGroup
                    key={sport}
                    sport={sport}
                    alerts={dqBySport[sport]!}
                    onResolve={(id) => resolve.mutate({ type: "dq", id })}
                    isResolving={resolve.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
