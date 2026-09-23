import React, { useState } from "react";
import { type NcaafV4HealthReport, type NcaafV4HealthMetrics } from "@/lib/api";
import { ChevronDown, ChevronUp } from "lucide-react";

function MetricsRow({ 
  label, 
  value, 
  total, 
  highlight = false, 
  warning = false,
  dim = false
}: { 
  label: string; 
  value: number; 
  total?: number; 
  highlight?: boolean;
  warning?: boolean;
  dim?: boolean;
}) {
  const percentage = total && total > 0 ? (value / total) * 100 : null;
  
  return (
    <div className="flex justify-between items-center py-0.5 border-b border-border/40 last:border-0">
      <span className={`text-[10px] uppercase tracking-wider ${dim ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
        {label}
      </span>
      <div className="text-right">
        <span className={`font-mono text-xs font-medium ${
          highlight ? "text-primary" : 
          warning && value > 0 ? "text-amber-400" : 
          dim ? "text-muted-foreground/60" : "text-foreground"
        }`}>
          {value}
        </span>
        {percentage !== null && (
          <span className={`ml-1 text-[10px] ${percentage === 100 ? "text-primary/70" : "text-muted-foreground"}`}>
            ({percentage.toFixed(1)}%)
          </span>
        )}
      </div>
    </div>
  );
}

function DayCard({ day }: { day: NcaafV4HealthMetrics }) {
  const [showReasons, setShowReasons] = useState(false);
  const reasons = Object.entries(day.unavailableReasons || {});
  
  const hasContent = day.scheduledGames > 0;
  
  return (
    <div className={`rounded-md border p-3 flex flex-col h-full ${hasContent ? 'border-border bg-background/30' : 'border-border/40 bg-background/10'}`}>
      <div className="flex justify-between items-baseline mb-2">
        <span className="font-bold text-sm text-foreground">{day.date}</span>
        {day.scheduledGames > 0 && (
          <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
            {day.scheduledGames} GMS
          </span>
        )}
      </div>
      
      {!hasContent ? (
        <div className="flex-1 flex items-center justify-center min-h-[100px]">
          <span className="text-xs text-muted-foreground/50">No Games</span>
        </div>
      ) : (
        <div className="space-y-3 flex-1">
          <div className="space-y-0">
            <MetricsRow label="FBS vs FBS" value={day.fbsVsFbsGames} total={day.scheduledGames} />
            <MetricsRow label="Provable" value={day.eligibilityProvableGames} total={day.fbsVsFbsGames} />
            <MetricsRow label="Evd Snapshots" value={day.validEvidenceSnapshots} total={day.eligibilityProvableGames} />
            <MetricsRow label="Int Snapshots" value={day.validIntelligenceSnapshots} total={day.validEvidenceSnapshots} />
            <MetricsRow label="V4 Forecasts" value={day.v4Forecasts} total={day.validIntelligenceSnapshots} highlight={day.v4Forecasts > 0 && day.v4Forecasts === day.validIntelligenceSnapshots} />
          </div>

          <div className="space-y-0 pt-2 border-t border-border/60">
            <MetricsRow label="Unavailable" value={day.unavailable} warning={true} />
            <MetricsRow label="Stale" value={day.stale ? 1 : 0} warning={true} />
          </div>

          <div className="space-y-0 pt-2 border-t border-border/60">
            <MetricsRow label="Frozen" value={day.kickoffFrozenGames} dim={true} />
            <MetricsRow label="Awaiting Final" value={day.awaitingFinalGames} warning={true} />
            <MetricsRow label="Graded Final" value={day.gradedFinalGames} dim={true} />
          </div>
          
          {reasons.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/60">
              <button 
                onClick={() => setShowReasons(!showReasons)}
                className="w-full flex items-center justify-between text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="uppercase tracking-wider">Unavailable Reasons</span>
                {showReasons ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              
              {showReasons && (
                <div className="mt-1 space-y-1">
                  {reasons.sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                    <div key={reason} className="flex justify-between items-center text-[10px]">
                      <span className="text-muted-foreground/80 truncate pr-2 max-w-[120px]" title={reason.replace(/_/g, ' ')}>
                        {reason.replace(/_/g, ' ')}
                      </span>
                      <span className="font-mono text-amber-400">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          <div className="pt-2 text-[9px] text-muted-foreground/60 font-mono space-y-0.5">
            <div className="flex justify-between">
              <span>Evd:</span>
              <span>{day.latestEvidenceAt ? new Date(day.latestEvidenceAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Proj:</span>
              <span>{day.latestProjectionAt ? new Date(day.latestProjectionAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function NcaafV4HealthReportPanel({
  report,
  isLoading,
  isFetching
}: {
  report?: NcaafV4HealthReport;
  isLoading: boolean;
  isFetching: boolean;
}) {
  const [showTotalReasons, setShowTotalReasons] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <p className="text-sm text-muted-foreground animate-pulse">Loading NCAAF V4 Health Report...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <p className="text-sm text-muted-foreground">NCAAF V4 Health Report is unavailable.</p>
      </div>
    );
  }

  const { totals, days, asOf, observation } = report;
  const isStale = new Date().getTime() - new Date(asOf).getTime() > 5 * 60 * 1000;
  
  // Sort days by date
  const sortedDays = [...days].sort((a, b) => {
    if (!a.date || !b.date) return 0;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  const allReasons = Object.entries(totals.unavailableReasons || {}).sort((a, b) => b[1] - a[1]);

  return (
    <section className="bg-card border border-border rounded-lg overflow-hidden flex flex-col mt-4">
      <div className="bg-muted/30 px-4 py-3 border-b border-border flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground">NCAAF V4 7-Day Health</h2>
            {isFetching && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" title="Updating..." />}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Pipeline integrity and forecast eligibility · As of <span className={`font-mono ${isStale ? "text-amber-400" : "text-foreground"}`}>{new Date(asOf).toLocaleString()}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Live observation: <span className="font-mono text-foreground">{observation.status}</span>
            {" · "}{observation.completedDays}/{observation.requiredDays} complete days
            {" · "}review after <span className="font-mono text-foreground">{new Date(observation.completesAt).toLocaleString()}</span>
          </p>
        </div>

        {/* Totals Summary */}
        <div className="flex flex-wrap gap-4">
          <div className="bg-background border border-border rounded px-3 py-2 text-right">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Weekly Conversion</span>
            <div className="flex items-baseline justify-end gap-1 font-mono">
              <span className="text-primary font-bold">{totals.v4Forecasts}</span>
              <span className="text-muted-foreground text-xs">/ {totals.fbsVsFbsGames}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {(totals.fbsVsFbsGames > 0 ? (totals.v4Forecasts / totals.fbsVsFbsGames) * 100 : 0).toFixed(1)}% of FBS games
            </div>
          </div>
          
          <div className="bg-background border border-border rounded px-3 py-2 text-right">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Weekly Exceptions</span>
            <div className="flex items-baseline justify-end gap-1 font-mono">
              <span className={totals.unavailable > 0 ? "text-amber-400 font-bold" : "text-foreground"}>{totals.unavailable}</span>
              <span className="text-muted-foreground text-xs block mx-1">unavail</span>
               <span className={totals.stale ? "text-amber-400 font-bold ml-1" : "text-foreground ml-1"}>{totals.stale ? 1 : 0}</span>
              <span className="text-muted-foreground text-xs">stale</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {totals.awaitingFinalGames} awaiting · {totals.gradedFinalGames} graded
            </div>
          </div>
        </div>
      </div>
      
      {/* Total Reasons Dropdown */}
      {allReasons.length > 0 && (
        <div className="bg-muted/10 border-b border-border px-4 py-2">
          <button 
            onClick={() => setShowTotalReasons(!showTotalReasons)}
            className="flex items-center gap-2 text-xs font-medium text-foreground hover:text-primary transition-colors"
          >
            {showTotalReasons ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {totals.unavailable} Total Unavailable Reasons
          </button>
          
          {showTotalReasons && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {allReasons.map(([reason, count]) => (
                <div key={reason} className="bg-background border border-border/50 rounded px-2 py-1.5 flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground truncate mr-2" title={reason.replace(/_/g, ' ')}>
                    {reason.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs font-mono text-amber-400 font-medium">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Days Grid */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3 overflow-x-auto">
        {sortedDays.map(day => (
          <DayCard key={day.date || "unknown"} day={day} />
        ))}
      </div>
    </section>
  );
}
