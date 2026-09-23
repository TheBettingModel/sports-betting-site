import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, AlertTriangle, ShieldAlert, ChevronDown, ChevronRight,
  Clock, Bot, User, BellOff, BellRing, Timer, RotateCcw,
} from "lucide-react";
import { adminApi, type DriftAlert, type DQAlert, type SportSnooze } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

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
function ResolvedByCell({ resolvedAt, resolvedBy }: { resolvedAt?: string | null; resolvedBy?: string | null }) {
  if (!resolvedAt) return <span className="text-zinc-600">—</span>;
  const isAuto = resolvedBy === "scheduler:auto";
  const isSnooze = resolvedBy?.startsWith("snooze:");
  const label = isAuto
    ? "Auto (scheduler)"
    : isSnooze
    ? "Snoozed"
    : resolvedBy && resolvedBy !== "admin"
    ? resolvedBy
    : "Admin";
  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium w-fit ${
        isAuto
          ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
          : isSnooze
          ? "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
          : "bg-sky-500/10 text-sky-400 border border-sky-500/20"
      }`}>
        {isAuto ? (
          <Bot className="w-3 h-3 shrink-0" />
        ) : isSnooze ? (
          <BellOff className="w-3 h-3 shrink-0" />
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

// ── Snooze countdown ──────────────────────────────────────────────────────────

function useCountdown(isoUntil: string) {
  const [remaining, setRemaining] = useState(() => new Date(isoUntil).getTime() - Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(new Date(isoUntil).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [isoUntil]);
  return remaining;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "expired";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

function SnoozeBanner({ snooze, onUnsnooze }: { snooze: SportSnooze; onUnsnooze: () => void }) {
  const remaining = useCountdown(snooze.snoozedUntil);
  if (remaining <= 0) return null;
  return (
    <div className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/25 rounded-md px-3 py-2 mb-2">
      <div className="flex items-center gap-2 min-w-0">
        <BellOff className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
        <span className="text-xs text-yellow-300 font-medium">Alerts silenced</span>
        {snooze.reason && (
          <span className="text-xs text-yellow-500 truncate hidden sm:block">· {snooze.reason}</span>
        )}
      </div>
      <div className="flex items-center gap-3 ml-3 shrink-0">
        <div className="flex items-center gap-1 text-xs text-yellow-400 font-mono tabular-nums">
          <Timer className="w-3 h-3" />
          {formatDuration(remaining)}
        </div>
        <button
          onClick={onUnsnooze}
          className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 rounded text-[10px] font-medium hover:bg-yellow-500/25 transition-colors"
        >
          <BellRing className="w-3 h-3" />
          Unsilence
        </button>
      </div>
    </div>
  );
}

// ── Snooze dialog ─────────────────────────────────────────────────────────────

const SNOOZE_OPTIONS = [
  { label: "24 hours", hours: 24 },
  { label: "1 week", hours: 168 },
  { label: "1 month", hours: 720 },
  { label: "3 months", hours: 2160 },
];

function SnoozeButton({
  sport,
  isSnoozed,
  onSnooze,
  onUnsnooze,
}: {
  sport: string;
  isSnoozed: boolean;
  onSnooze: (hours: number, reason: string) => void;
  onUnsnooze: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState(168);

  if (isSnoozed) {
    return (
      <button
        onClick={onUnsnooze}
        className="flex items-center gap-1 px-2 py-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded text-xs hover:bg-yellow-500/20 transition-colors"
        title="Remove snooze"
      >
        <BellRing className="w-3 h-3" />
        Unsilence
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded text-xs hover:bg-zinc-700 transition-colors"
        title={`Silence alerts for ${sport}`}
      >
        <BellOff className="w-3 h-3" />
        Silence
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-64 bg-card border border-border rounded-lg shadow-xl p-3 space-y-2.5">
          <p className="text-xs font-semibold text-foreground">Silence alerts for {sport}</p>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="mt-1 w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground"
            >
              {SNOOZE_OPTIONS.map((o) => (
                <option key={o.hours} value={o.hours}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Reason (optional)</label>
            <input
              type="text"
              placeholder="e.g. Off-season"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { onSnooze(duration, reason); setOpen(false); setReason(""); }}
              className="flex-1 px-2 py-1 bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 rounded text-xs font-medium hover:bg-yellow-500/25 transition-colors"
            >
              Silence
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-2 py-1 bg-card border border-border rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sport alert group ─────────────────────────────────────────────────────────

interface SportGroupProps {
  sport: string;
  alerts: DQAlert[];
  snooze: SportSnooze | undefined;
  onResolve: (id: number) => void;
  onSnooze: (sport: string, hours: number, reason: string) => void;
  onUnsnooze: (sport: string) => void;
  isResolving: boolean;
  isSnoozeMutating: boolean;
}

function SportAlertGroup({
  sport, alerts, snooze, onResolve, onSnooze, onUnsnooze, isResolving, isSnoozeMutating,
}: SportGroupProps) {
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
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
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
            {snooze && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1">
                <BellOff className="w-2.5 h-2.5" /> silenced
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {resolvedAlerts.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="accent-primary" />
              Show history
            </label>
          )}
          <SnoozeButton
            sport={sport}
            isSnoozed={!!snooze}
            onSnooze={(hours, reason) => onSnooze(sport, hours, reason)}
            onUnsnooze={() => onUnsnooze(sport)}
          />
        </div>
      </button>

      {/* Snooze countdown */}
      {expanded && snooze && (
        <div className="px-4 pt-3">
          <SnoozeBanner snooze={snooze} onUnsnooze={() => onUnsnooze(sport)} />
        </div>
      )}

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
                  <tr key={a.id} className={`hover:bg-accent/20 transition-colors ${a.isResolved ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3"><StatusBadge resolved={a.isResolved} /></td>
                    <td className="px-4 py-3"><SeverityBadge severity={a.severity} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{a.alertType}</td>
                    <td className="px-4 py-3 text-xs text-foreground max-w-xs">{a.description}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{timeAgo(a.createdAt)}</td>
                    <td className="px-4 py-3"><ResolvedByCell resolvedAt={a.resolvedAt} resolvedBy={a.resolvedBy} /></td>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export function Alerts() {
  const qc = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);

  const { data: driftData, isLoading: driftLoading } = useQuery({
    queryKey: ["alerts", "drift", showResolved],
    queryFn: () => adminApi.alerts(showResolved),
    refetchInterval: 30_000,
  });

  const { data: dqData, isLoading: dqLoading } = useQuery({
    queryKey: ["alerts", "dq", "all"],
    queryFn: () => adminApi.alertsAll(),
    refetchInterval: 30_000,
  });

  const { data: snoozesData } = useQuery({
    queryKey: ["snoozes"],
    queryFn: () => adminApi.snoozes(),
    refetchInterval: 60_000,
  });

  const resolve = useMutation({
    mutationFn: ({ type, id }: { type: "drift" | "dq"; id: number }) =>
      adminApi.resolveAlert(type, id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["alerts"] }); },
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ sport, hours, reason }: { sport: string; hours: number; reason: string }) =>
      adminApi.snoozeSport(sport, hours, reason || undefined),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["snoozes"] }); },
  });

  const unsnoozeMutation = useMutation({
    mutationFn: (sport: string) => adminApi.unsnoozeSport(sport),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["snoozes"] }); },
  });

  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const resetBaseline = useMutation({
    mutationFn: () => adminApi.resetDriftBaseline(),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["alerts"] });
      setResetResult(data.message);
      setResetConfirm(false);
      setTimeout(() => setResetResult(null), 8000);
    },
  });

  const driftAlerts: DriftAlert[] = driftData?.drift.alerts ?? [];
  const dqAlerts: DQAlert[] = dqData?.dataQuality.alerts ?? [];
  const snoozeMap = new Map<string, SportSnooze>(
    (snoozesData?.snoozes ?? []).map((s) => [s.sport, s]),
  );

  const dqBySport = dqAlerts.reduce<Record<string, DQAlert[]>>((acc, alert) => {
    const key = alert.sport ?? "Unknown / Global";
    if (!acc[key]) acc[key] = [];
    acc[key].push(alert);
    return acc;
  }, {});

  const sortedSports = Object.keys(dqBySport).sort((a, b) => {
    const aActive = dqBySport[a]!.filter((x) => !x.isResolved).length;
    const bActive = dqBySport[b]!.filter((x) => !x.isResolved).length;
    if (aActive !== bActive) return bActive - aActive;
    return a.localeCompare(b);
  });

  const isLoading = driftLoading || dqLoading;

  // Scroll to a sport group when the page is opened via a hash link from the
  // Overview feed health chips (e.g. #sport-mlb). Runs once after data loads.
  useEffect(() => {
    if (isLoading || sortedSports.length === 0) return;
    const hash = window.location.hash; // e.g. "#sport-mlb"
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) {
      // Small delay so the DOM settles after React renders
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }, [isLoading, sortedSports.length]);

  const activeDriftCount = driftAlerts.filter((a) => !a.isResolved).length;
  const activeDQCount = dqAlerts.filter((a) => !a.isResolved).length;
  const activeSnoozesCount = snoozesData?.snoozes.length ?? 0;

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
          <div className="flex flex-wrap gap-3">
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
            {activeSnoozesCount > 0 && (
              <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                <BellOff className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-medium text-yellow-300">{activeSnoozesCount}</span>
                <span className="text-xs text-yellow-500">Sport{activeSnoozesCount !== 1 ? "s" : ""} silenced</span>
              </div>
            )}
          </div>

          {/* Drift Alerts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                Model Drift Alerts
              </h2>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="accent-primary" />
                  Show resolved
                </label>
                {!resetConfirm ? (
                  <button
                    onClick={() => setResetConfirm(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded text-xs hover:bg-zinc-700 transition-colors"
                    title="Resolve all stale drift alerts and re-run the monitor with a fresh baseline"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Baseline
                  </button>
                ) : (
                  <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded px-2.5 py-1">
                    <span className="text-xs text-orange-300">Resolve all active drift alerts?</span>
                    <button
                      onClick={() => resetBaseline.mutate()}
                      disabled={resetBaseline.isPending}
                      className="px-2 py-0.5 bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded text-[10px] font-medium hover:bg-orange-500/30 transition-colors disabled:opacity-40"
                    >
                      {resetBaseline.isPending ? "Resetting…" : "Confirm"}
                    </button>
                    <button
                      onClick={() => setResetConfirm(false)}
                      className="px-2 py-0.5 bg-card border border-border rounded text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
            {resetResult && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-md text-xs text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                {resetResult}
              </div>
            )}
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
                      <td className="px-4 py-3"><ResolvedByCell resolvedAt={a.resolvedAt} resolvedBy={a.resolvedBy} /></td>
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
                  <div key={sport} id={`sport-${sport.toLowerCase()}`}>
                    <SportAlertGroup
                      sport={sport}
                      alerts={dqBySport[sport]!}
                      snooze={snoozeMap.get(sport)}
                      onResolve={(id) => resolve.mutate({ type: "dq", id })}
                      onSnooze={(s, hours, reason) => snoozeMutation.mutate({ sport: s, hours, reason })}
                      onUnsnooze={(s) => unsnoozeMutation.mutate(s)}
                      isResolving={resolve.isPending}
                      isSnoozeMutating={snoozeMutation.isPending || unsnoozeMutation.isPending}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
