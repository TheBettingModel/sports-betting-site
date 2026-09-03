import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  BrainCircuit, AlertTriangle, Clock, TrendingUp,
  Activity, Rss,
} from "lucide-react";
import { adminApi, type AdminOverview, type FeedHealthEntry, type RecommendationPublicationAudit } from "@/lib/api";
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

const FEED_STATUS_DOT: Record<FeedHealthEntry["status"], string> = {
  ok: "bg-green-400",
  quiet: "bg-zinc-500",
  error: "bg-red-500",
  stale: "bg-yellow-400",
};

const FEED_STATUS_LABEL: Record<FeedHealthEntry["status"], string> = {
  ok: "Live",
  quiet: "Quiet",
  error: "Error",
  stale: "Stale",
};

const FEED_STATUS_TEXT: Record<FeedHealthEntry["status"], string> = {
  ok: "text-green-400",
  quiet: "text-zinc-400",
  error: "text-red-400",
  stale: "text-yellow-400",
};

const ALERT_SEVERITY_RING: Record<string, string> = {
  critical: "ring-1 ring-red-500/60 border-red-500/40",
  warning:  "ring-1 ring-yellow-400/50 border-yellow-400/30",
};

const ALERT_SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400",
  warning:  "bg-yellow-500/15 text-yellow-400",
};

function FeedHealthGrid({ entries }: { entries: FeedHealthEntry[] }) {
  const [, navigate] = useLocation();

  function handleChipClick(sport: string) {
    navigate("/alerts");
    // Give the Alerts page a tick to mount, then scroll to the sport group
    setTimeout(() => {
      const el = document.getElementById(`sport-${sport.toLowerCase()}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Rss className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Feed Health</h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />Live</span>
          <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-500" />Quiet</span>
          <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />Error</span>
          <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400" />Stale</span>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {entries.map((e) => {
          const alertRing = e.alertSeverity ? (ALERT_SEVERITY_RING[e.alertSeverity] ?? "") : "";
          const alertBadge = e.alertSeverity ? (ALERT_SEVERITY_BADGE[e.alertSeverity] ?? "bg-zinc-700 text-zinc-300") : "";
          const title = [
            e.lastChecked ? `Last checked ${timeAgo(e.lastChecked)}` : "No data yet",
            e.alertCount > 0 ? `${e.alertCount} active alert${e.alertCount !== 1 ? "s" : ""} (${e.alertSeverity})` : "",
          ].filter(Boolean).join(" · ");

          return (
            <button
              key={e.sport}
              onClick={() => handleChipClick(e.sport)}
              className={`relative flex flex-col items-center gap-1 bg-background border border-border rounded-md px-2 py-2.5 cursor-pointer hover:bg-accent/30 transition-colors text-left w-full ${alertRing}`}
              title={title}
            >
              {/* Alert count badge — top-right corner */}
              {e.alertCount > 0 && (
                <span className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-bold px-1 ${alertBadge}`}>
                  {e.alertCount}
                </span>
              )}
              <span className={`inline-block w-2 h-2 rounded-full ${FEED_STATUS_DOT[e.status]}`} />
              <span className="text-xs font-medium text-foreground text-center leading-tight">{e.sport}</span>
              <span className={`text-[10px] ${FEED_STATUS_TEXT[e.status]}`}>
                {e.status === "ok" && e.gameCount != null
                  ? `${e.gameCount} game${e.gameCount !== 1 ? "s" : ""}`
                  : FEED_STATUS_LABEL[e.status]}
              </span>
              {/* Show suppressed indicator when games exist but none qualify */}
              {e.status === "ok" && e.publishedCount === 0 && (e.suppressedCount ?? 0) > 0 && (
                <span className="text-[9px] text-yellow-400 font-medium">0 picks</span>
              )}
            </button>
          );
        })}
      </div>
      {entries[0]?.lastChecked && (
        <p className="text-[10px] text-muted-foreground mt-2 text-right">
          Last ingestion {timeAgo(entries[0].lastChecked)}
        </p>
      )}
    </div>
  );
}

export function Overview() {
  const { data, isLoading, error } = useQuery<AdminOverview>({
    queryKey: ["admin-overview"],
    queryFn: () => adminApi.overview(),
    refetchInterval: 30_000,
  });
  const { data: recommendationAudit } = useQuery<RecommendationPublicationAudit>({
    queryKey: ["recommendation-publication-audit"],
    queryFn: () => adminApi.recommendationPublicationAudit(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="text-muted-foreground text-sm">Loading overview…</div>;
  if (error) return <div className="text-red-400 text-sm">Error: {(error as Error).message}</div>;
  if (!data) return null;

  const { production, challengers, alerts, grading, performance, automation, feedHealth } = data;

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

      {/* Feed health */}
      {feedHealth && feedHealth.length > 0 && (
        <FeedHealthGrid entries={feedHealth} />
      )}

      {recommendationAudit && (
        <section className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Recommendation & Publication Audit</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Raw model opinion is shown separately from publication safety and the subscriber display.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border-b border-border">
            <div className="bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Games</p><p className="text-xl font-bold">{recommendationAudit.summary.totalGames}</p></div>
            <div className="bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">True Raw Neutral</p><p className="text-xl font-bold">{recommendationAudit.summary.rawDistribution.Neutral ?? 0}</p></div>
            <div className="bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Publication Blocked</p><p className="text-xl font-bold text-amber-400">{recommendationAudit.summary.publication.BLOCKED ?? 0}</p></div>
            <div className="bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Published / Publishable</p><p className="text-xl font-bold text-green-400">{(recommendationAudit.summary.publication.PUBLISHED ?? 0) + (recommendationAudit.summary.publication.PUBLISHABLE ?? 0)}</p></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-xs text-muted-foreground">GAME</th>
                <th className="text-left px-4 py-2 text-xs text-muted-foreground">RAW MODEL</th>
                <th className="text-left px-4 py-2 text-xs text-muted-foreground">PUBLICATION</th>
                <th className="text-left px-4 py-2 text-xs text-muted-foreground">BLOCK REASON</th>
                <th className="text-left px-4 py-2 text-xs text-muted-foreground">PUBLIC DISPLAY</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {recommendationAudit.rows.map((row) => (
                  <tr key={row.gameId}>
                    <td className="px-4 py-2"><p className="font-medium">{row.matchup}</p><p className="text-[10px] text-muted-foreground">{row.sport} · {row.modelVersion ?? "model unknown"}</p></td>
                    <td className="px-4 py-2 font-semibold">{row.rawModelRecommendation}<p className="text-[10px] font-normal text-muted-foreground">{row.modelProbability.toFixed(1)}% · edge {row.edge > 0 ? "+" : ""}{row.edge.toFixed(1)}%</p></td>
                    <td className="px-4 py-2"><span className={row.publicationStatus === "BLOCKED" ? "text-amber-400" : row.publicationStatus === "NOT_APPLICABLE_NO_PLAY" ? "text-muted-foreground" : "text-green-400"}>{row.publicationStatus.replaceAll("_", " ")}</span><p className="text-[10px] text-muted-foreground">{row.approvalStatus.replaceAll("_", " ")}</p></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{row.publicationBlockReason?.replaceAll("_", " ") ?? "—"}</td>
                    <td className="px-4 py-2 font-semibold">{row.displayRecommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
