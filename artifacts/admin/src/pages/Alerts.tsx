import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
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

export function Alerts() {
  const qc = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["alerts", showResolved],
    queryFn: () => adminApi.alerts(showResolved),
    refetchInterval: 30_000,
  });

  const resolve = useMutation({
    mutationFn: ({ type, id }: { type: "drift" | "dq"; id: number }) =>
      adminApi.resolveAlert(type, id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["alerts"] }); },
  });

  const driftAlerts: DriftAlert[] = data?.drift.alerts ?? [];
  const dqAlerts: DQAlert[] = data?.dataQuality.alerts ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Alerts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Drift and data quality issues</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="accent-primary"
          />
          Show resolved
        </label>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading alerts…</div>
      ) : (
        <>
          {/* Summary */}
          {!showResolved && (
            <div className="flex gap-3">
              <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-medium text-foreground">{driftAlerts.length}</span>
                <span className="text-xs text-muted-foreground">Drift</span>
              </div>
              <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-foreground">{dqAlerts.length}</span>
                <span className="text-xs text-muted-foreground">Data Quality</span>
              </div>
            </div>
          )}

          {/* Drift Alerts */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              Model Drift Alerts
            </h2>
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
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {driftAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
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
                        {a.isResolved && <span className="text-xs text-muted-foreground">resolved</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Data Quality Alerts */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              Data Quality Alerts
            </h2>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Severity</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sport</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Age</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dqAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                        {showResolved ? "No resolved alerts." : "No active data quality alerts."}
                      </td>
                    </tr>
                  ) : dqAlerts.map((a) => (
                    <tr key={a.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3"><SeverityBadge severity={a.severity} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{a.alertType}</td>
                      <td className="px-4 py-3 text-xs text-foreground max-w-xs">{a.description}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{a.sport ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(a.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {!a.isResolved && (
                          <button
                            onClick={() => resolve.mutate({ type: "dq", id: a.id })}
                            disabled={resolve.isPending}
                            className="flex items-center gap-1 ml-auto px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded text-xs hover:bg-green-500/20 transition-colors disabled:opacity-40"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Resolve
                          </button>
                        )}
                        {a.isResolved && <span className="text-xs text-muted-foreground">resolved</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
