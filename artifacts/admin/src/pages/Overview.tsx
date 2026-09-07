import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  BrainCircuit, AlertTriangle, Clock, TrendingUp,
  Activity, Rss,
} from "lucide-react";
import {
  adminApi,
  type AdminOverview,
  type FeedHealthEntry,
  type ModelRuntimeSportStatus,
  type ModelRuntimeStatus,
  type RecommendationPublicationAudit,
  type TechnicalReadiness,
} from "@/lib/api";
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

function RuntimeState({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const color = normalized.includes("degraded") || normalized.includes("unapproved") || normalized.includes("blocked") || normalized.includes("unhealthy") || normalized.includes("unavailable")
    ? "text-amber-400"
    : normalized.includes("healthy") || normalized.includes("eligible") || normalized === "ready" || normalized.includes("active")
    ? "text-emerald-400"
    : "text-muted-foreground";
  return <span className={`font-medium ${color}`}>{value.replaceAll("_", " ")}</span>;
}

function RuntimeBoolean({ value, trueLabel, falseLabel }: {
  value: boolean;
  trueLabel: string;
  falseLabel: string;
}) {
  return (
    <span className={`font-medium ${value ? "text-emerald-400" : "text-amber-400"}`}>
      {value ? trueLabel : falseLabel}
    </span>
  );
}

function RuntimeSportCard({ sport }: { sport: ModelRuntimeSportStatus }) {
  const candidate = sport.candidateEngine
    ? `${sport.candidateEngine}${sport.candidateVersion ? ` · ${sport.candidateVersion}` : ""}`
    : "No candidate identity";
  const supportedMarkets = Object.entries(sport.supportedMarkets);
  return (
    <article className="rounded-md border border-border bg-background/40 p-3 text-xs" data-testid={`card-runtime-${sport.sport.toLowerCase()}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-sm text-foreground">{sport.sport}</p>
        <span className="rounded bg-muted px-2 py-0.5 font-medium text-foreground">
          Mode: {sport.configuredMode}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Active engine</dt><dd className="mt-0.5 break-all text-foreground">{sport.activePrimaryEngine}</dd></div>
        <div><dt className="text-muted-foreground">Candidate</dt><dd className="mt-0.5 break-all text-foreground">{candidate}</dd></div>
        <div><dt className="text-muted-foreground">Approval</dt><dd className="mt-0.5"><RuntimeState value={sport.approvalStatus} /></dd></div>
        <div><dt className="text-muted-foreground">Actual serving</dt><dd className="mt-0.5"><RuntimeState value={sport.resolvedServingState} /></dd></div>
        <div><dt className="text-muted-foreground">Publication</dt><dd className="mt-0.5"><RuntimeState value={sport.publicationStatus} /></dd></div>
        <div><dt className="text-muted-foreground">Executor</dt><dd className="mt-0.5"><RuntimeBoolean value={sport.executorAvailable} trueLabel="AVAILABLE" falseLabel="UNAVAILABLE" /> <span className="text-muted-foreground">· </span><RuntimeState value={sport.executorHealth} /></dd></div>
        <div className="sm:col-span-2"><dt className="text-muted-foreground">Executor reason</dt><dd className="mt-0.5 break-words text-foreground">{sport.executorHealthReason}</dd></div>
        <div><dt className="text-muted-foreground">Reproducibility</dt><dd className="mt-0.5"><RuntimeBoolean value={sport.reproducibilityReady} trueLabel="READY" falseLabel="NOT READY" /></dd></div>
        <div><dt className="text-muted-foreground">Official bridge</dt><dd className="mt-0.5"><RuntimeBoolean value={sport.officialBridgeReady} trueLabel="READY" falseLabel="NOT READY" /> <span className="text-muted-foreground">· </span><RuntimeState value={sport.officialBridgeStatus} /></dd></div>
        <div><dt className="text-muted-foreground">Runtime health</dt><dd className="mt-0.5"><RuntimeState value={sport.runtimeHealth} /></dd></div>
        <div><dt className="text-muted-foreground">Input contract</dt><dd className="mt-0.5 break-all text-foreground">{sport.inputContract ?? "Not reported"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-muted-foreground">Supported markets</dt><dd className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1">{supportedMarkets.length > 0 ? supportedMarkets.map(([market, classification]) => <span key={market} className="text-foreground">{market}: <RuntimeState value={classification} /></span>) : <span className="text-muted-foreground">None reported</span>}</dd></div>
      </dl>
    </article>
  );
}

function TechnicalReadinessPanel({ readiness }: { readiness?: TechnicalReadiness }) {
  if (!readiness) return null;

  const {
    TECHNICAL_CUTOVER_READY,
    MODEL_EVIDENCE_READY,
    GUARDED_APPROVED,
    technicalBlockers,
    modelEvidenceBlockers,
    guardedApprovalBlockers,
    guardedPersistence: gp,
  } = readiness;

  return (
    <section className="bg-card border border-border rounded-lg overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Technical Readiness & Persistence</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Operational cockpit for guarding mechanisms, database schema integrity, and overall cutover state.
          </p>
        </div>
        <div className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider font-bold ${TECHNICAL_CUTOVER_READY && MODEL_EVIDENCE_READY && GUARDED_APPROVED ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
          {TECHNICAL_CUTOVER_READY && MODEL_EVIDENCE_READY && GUARDED_APPROVED ? "ALL GATES CLEAR" : "GATES BLOCKED"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 border-b border-border bg-border gap-px">
        <div className="bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Technical Cutover</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${TECHNICAL_CUTOVER_READY ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
              {TECHNICAL_CUTOVER_READY ? "READY" : "BLOCKED"}
            </span>
          </div>
          {technicalBlockers.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {technicalBlockers.map((b, i) => (
                <li key={i} className="text-[11px] text-amber-400 flex items-start gap-1.5 leading-snug">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[10px] text-muted-foreground italic">No blockers.</p>
          )}
        </div>
        <div className="bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Model Evidence</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${MODEL_EVIDENCE_READY ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
              {MODEL_EVIDENCE_READY ? "READY" : "BLOCKED"}
            </span>
          </div>
          {modelEvidenceBlockers.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {modelEvidenceBlockers.map((b, i) => (
                <li key={i} className="text-[11px] text-amber-400 flex items-start gap-1.5 leading-snug">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[10px] text-muted-foreground italic">No blockers.</p>
          )}
        </div>
        <div className="bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Guarded Approval</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${GUARDED_APPROVED ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
              {GUARDED_APPROVED ? "READY" : "BLOCKED"}
            </span>
          </div>
          {guardedApprovalBlockers.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {guardedApprovalBlockers.map((b, i) => (
                <li key={i} className="text-[11px] text-amber-400 flex items-start gap-1.5 leading-snug">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[10px] text-muted-foreground italic">No blockers.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px border-b border-border bg-border">
        <div className="bg-card p-3">
          <p className="text-[10px] uppercase text-muted-foreground mb-1">Environment</p>
          <p className="text-sm font-semibold text-foreground font-mono">{gp.environment}</p>
        </div>
        <div className="bg-card p-3">
          <p className="text-[10px] uppercase text-muted-foreground mb-1">Schema Elements</p>
          <p className="text-sm font-semibold text-foreground tracking-tight">
            {gp.schema.tables}T <span className="text-muted-foreground mx-0.5">·</span> {gp.schema.indexes.length}I <span className="text-muted-foreground mx-0.5">·</span> {gp.schema.triggers}TR <span className="text-muted-foreground mx-0.5">·</span> {gp.schema.constraints.length}C
          </p>
        </div>
        <div className="bg-card p-3">
          <p className="text-[10px] uppercase text-muted-foreground mb-1">History Orphans</p>
          <p className={`text-sm font-semibold ${(gp.officialHistoryIntegrity.orphanedPredictionIdentities + gp.officialHistoryIntegrity.orphanedLifecycleEvents + gp.officialHistoryIntegrity.identitiesWithoutLifecycle) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
            {gp.officialHistoryIntegrity.orphanedPredictionIdentities} / {gp.officialHistoryIntegrity.orphanedLifecycleEvents} / {gp.officialHistoryIntegrity.identitiesWithoutLifecycle}
          </p>
        </div>
        <div className="bg-card p-3">
          <p className="text-[10px] uppercase text-muted-foreground mb-1">Ledger / Identity</p>
          <p className="text-sm font-semibold text-foreground tracking-tight">
            {gp.counts.approvalLedger} <span className="text-muted-foreground mx-1">/</span> {gp.counts.officialIdentity}
          </p>
        </div>
        <div className="bg-card p-3">
          <p className="text-[10px] uppercase text-muted-foreground mb-1">Lifecycle Events</p>
          <p className="text-sm font-semibold text-foreground">{gp.counts.officialLifecycle}</p>
        </div>
      </div>

      <div className="p-4 bg-background/50 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          <div>
            <h3 className="text-[10px] uppercase text-muted-foreground font-semibold mb-3 border-b border-border pb-1">Safety Verifications</h3>
            <dl className="space-y-2">
              <div className="flex justify-between items-center gap-4">
                <dt className="text-muted-foreground">Max Safe Execution Age</dt>
                <dd className="text-foreground font-medium text-right">{gp.maxSafeExecutionAgeHours} hours</dd>
              </div>
              <div className="flex justify-between items-center gap-4">
                <dt className="text-muted-foreground">Append-Only Mutations</dt>
                <dd className={`font-medium text-right ${gp.appendOnlyMutationRejectionVerified ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {gp.appendOnlyMutationRejectionVerified ? "VERIFIED" : "UNVERIFIED"}
                </dd>
              </div>
              <div className="flex justify-between items-center gap-4">
                <dt className="text-muted-foreground">Latest Verification</dt>
                <dd className="text-foreground font-mono text-[10px] text-right">{gp.latestSafeMutationVerification ? timeAgo(gp.latestSafeMutationVerification) : "Never"}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h3 className="text-[10px] uppercase text-muted-foreground font-semibold mb-3 border-b border-border pb-1">Latest Executions</h3>
            <dl className="space-y-2">
              {Object.keys(gp.latestSafeExecutions).length > 0 ? (
                Object.entries(gp.latestSafeExecutions).map(([sport, exec]) => {
                  if (!exec) return null;
                  return (
                    <div key={sport} className="flex justify-between items-center gap-4">
                      <dt className="text-muted-foreground">{sport} Safe Execution</dt>
                      <dd className="text-foreground font-mono text-[10px] text-right">{timeAgo(exec.executedAt)}</dd>
                    </div>
                  );
                })
              ) : (
                <div className="text-muted-foreground text-[10px] italic">No safe executions recorded.</div>
              )}
              {Object.keys(gp.latestDryRunResolutions).length > 0 && (
                Object.entries(gp.latestDryRunResolutions).map(([sport, res]) => {
                  if (!res) return null;
                  return (
                    <div key={`dry-${sport}`} className="flex justify-between items-center gap-4">
                      <dt className="text-muted-foreground">{sport} Dry-Run Resolution</dt>
                      <dd className="text-foreground font-mono text-[10px] text-right">
                        {timeAgo(res.resolvedAt)} <span className="text-muted-foreground mx-1">·</span> <span className={res.resolution === "DRY_RUN_PASSED" ? "text-emerald-400" : "text-amber-400"}>{res.resolution.replace(/_/g, " ")}</span>
                      </dd>
                    </div>
                  );
                })
              )}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function RuntimeStatusPanel({ status }: { status?: ModelRuntimeStatus }) {
  if (!status) {
    return <section className="bg-card border border-border rounded-lg p-4 text-sm text-muted-foreground">Runtime status is unavailable.</section>;
  }
  return (
    <section className="bg-card border border-border rounded-lg p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Guarded Serving Runtime</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Actual guarded-serving, executor, reproducibility, and official-bridge state; refreshed {timeAgo(status.generatedAt)}.</p>
        </div>
        {status.latestOfficialPrediction && (
          <p className="text-[11px] text-muted-foreground">
            Latest official: <span className="text-foreground">{status.latestOfficialPrediction.sport} · {status.latestOfficialPrediction.engine}</span>
            {" · "}<RuntimeState value={status.latestOfficialPrediction.publicationStatus} />
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {status.sports.map((sport) => <RuntimeSportCard key={sport.sport} sport={sport} />)}
      </div>
    </section>
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
  const { data: runtimeStatus } = useQuery<ModelRuntimeStatus>({
    queryKey: ["model-runtime-status"],
    queryFn: () => adminApi.modelRuntimeStatus(),
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

      <TechnicalReadinessPanel readiness={runtimeStatus?.technicalReadiness} />

      <RuntimeStatusPanel status={runtimeStatus} />

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
