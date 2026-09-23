import React, { useState } from "react";
import { type NcaafV4ProjectionBoard, type NcaafV4Projection } from "@/lib/api";
import { ChevronDown, ChevronUp } from "lucide-react";

export function NcaafV4BoardPanel({
  board,
  isLoading
}: {
  board?: NcaafV4ProjectionBoard;
  isLoading: boolean;
}) {
  const [showHashes, setShowHashes] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-card border border-primary/30 rounded-lg p-6">
        <p className="text-sm text-muted-foreground animate-pulse">Loading NCAAF V4 TODAY board...</p>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <p className="text-sm text-muted-foreground">NCAAF V4 TODAY board is currently unavailable.</p>
      </div>
    );
  }

  const audit = board.audit as Record<string, unknown>;
  const scheduled = Number(audit.snapshotsSeen ?? 0);
  const eligible = Number(audit.modelEligibleFbsVsFbsTargets ?? 0);
  const outOfDomain = Number(audit.outOfDomainTargets ?? 0);
  const unresolved = Number(audit.identityUnresolvedTargets ?? 0);
  const mktHealth = audit.marketHealth as Record<string, number> | undefined;
  const projectedOpportunities = board.board.filter((row) => row.v4ModelOpinion !== "NEUTRAL").length;

  return (
    <section className="bg-card border border-primary/30 rounded-lg overflow-hidden">
      <div className="bg-primary/5 px-4 py-3 border-b border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-primary">NCAAF V4 TODAY</h2>
            <span className="bg-primary/20 text-primary border border-primary/30 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider">
              {board.model.id === "tbm-ncaaf-v4-expected-score" ? "D-simple-expected-score-linear" : board.model.id}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Board Date: <span className="text-foreground">{board.date}</span> · Generated: <span className="text-foreground">{new Date(board.generatedAt).toLocaleString()}</span>
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {board.model.modelStatus.replace("_", " ")}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {board.model.approvalStatus.replace("_", " ")}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {board.model.publicationStatus.replace("_", " ")}
            </span>
          </div>
        </div>

        <div className="text-right text-xs">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            <div>Scheduled: <span className="text-foreground">{scheduled}</span></div>
            <div>Eligible: <span className="text-foreground">{eligible}</span></div>
            <div>Out of Domain: <span className="text-foreground">{outOfDomain}</span></div>
            <div>Unresolved: <span className="text-foreground">{unresolved}</span></div>
            {mktHealth && (
              <>
                <div className="col-span-2 mt-1 border-t border-border pt-1">
                   Mkt Health: <span className="text-foreground">{mktHealth.safeMatchRate != null ? (mktHealth.safeMatchRate * 100).toFixed(1) + '%' : '—'}</span>
                  {' · '}
                   <span className="text-foreground">{mktHealth.safeMatches ?? 0}</span> matched / <span className="text-foreground">{mktHealth.eligibleForecasts ?? 0}</span> forecasts
                </div>
                 <div className="col-span-2 text-[9px] text-amber-400/80">
                   Unmatched {mktHealth.unmatchedGames ?? 0} · Ambiguous {mktHealth.ambiguousGames ?? 0} · Stale {mktHealth.staleGames ?? 0}
                 </div>
              </>
            )}
          </div>
          <button 
            onClick={() => setShowHashes(!showHashes)}
            className="text-[10px] text-muted-foreground hover:text-foreground mt-2 flex items-center justify-end gap-1 w-full"
          >
            {showHashes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Technical Hashes & Metadata
          </button>
        </div>
      </div>

      {showHashes && (
        <div className="bg-black/40 p-3 border-b border-primary/20 text-[10px] font-mono text-muted-foreground break-all">
          <p>Config Hash: <span className="text-foreground">{board.model.configurationHash}</span></p>
          <p>Param Hash: <span className="text-foreground">{board.model.parameterHash}</span></p>
          <p>Evidence Persistence: <span className="text-foreground">{board.evidencePersistence}</span></p>
        </div>
      )}

      {board.board.length > 0 && projectedOpportunities === 0 && (
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium text-foreground">No qualifying NCAAF V4 projected plays right now.</p>
          <p className="mt-1 text-xs text-muted-foreground">The full forecast board remains available for owner review.</p>
        </div>
      )}

      {/* Main Board Table */}
      <div className="overflow-x-auto">
        {board.board.length === 0 ? (
          <div className="p-8 text-center border-t border-border">
            <p className="text-muted-foreground">No projected opportunities available for {board.date}.</p>
            <p className="text-xs text-muted-foreground mt-1">Zero-opportunity state · Professional</p>
          </div>
        ) : (
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-black/20 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Rank</th>
                <th className="px-3 py-2 text-left font-medium">Matchup & Time</th>
                <th className="px-3 py-2 text-left font-medium">Expected (Score / Mgn / Tot)</th>
                <th className="px-3 py-2 text-left font-medium">Win Prob (H/A)</th>
                <th className="px-3 py-2 text-left font-medium">Fair ML (H/A)</th>
                <th className="px-3 py-2 text-left font-medium">Market (ML / Spr / Tot)</th>
                <th className="px-3 py-2 text-left font-medium">Edge</th>
                <th className="px-3 py-2 text-left font-medium">Opinion</th>
                <th className="px-3 py-2 text-left font-medium">DQ & Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {board.board.map((row) => (
                <tr key={row.predictionId} className="hover:bg-primary/5 transition-colors">
                  <td className="px-3 py-2 font-mono text-muted-foreground text-center">#{row.rank}</td>
                  <td className="px-3 py-2">
                    <p className="font-bold text-foreground">{row.awayTeam} @ {row.homeTeam}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(row.kickoffAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {row.neutralSite ? " · Neutral" : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    <p className="text-foreground">{row.model.expectedHomePoints.toFixed(1)} / {row.model.expectedAwayPoints.toFixed(1)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Mgn: {row.model.expectedMargin.toFixed(1)} · Tot: {row.model.expectedTotal.toFixed(1)}
                    </p>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    <p className="text-foreground">{(row.model.homeWinProbability * 100).toFixed(1)}%</p>
                    <p className="text-muted-foreground">{(row.model.awayWinProbability * 100).toFixed(1)}%</p>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    <p className="text-foreground">{row.model.fairHomeMoneyline != null ? (row.model.fairHomeMoneyline > 0 ? "+" : "") + row.model.fairHomeMoneyline : "—"}</p>
                    <p className="text-muted-foreground">{row.model.fairAwayMoneyline != null ? (row.model.fairAwayMoneyline > 0 ? "+" : "") + row.model.fairAwayMoneyline : "—"}</p>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {row.market ? (
                      <>
                        <p className="text-foreground">
                          ML: {row.market.moneyline ? `${row.market.moneyline.homeOdds}/${row.market.moneyline.awayOdds}` : "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Spr: {row.market.spread ? `${row.market.spread.line} (${row.market.spread.odds})` : "—"} · 
                          Tot: {row.market.total ? `${row.market.total.line} (${row.market.total.odds})` : "—"}
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">No Market</p>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-primary font-bold">
                    {row.comparison && (row.comparison.moneylineHomeEdge || row.comparison.spread || row.comparison.total) ? (
                      <>
                        {row.comparison.moneylineHomeEdge ? `ML Edge: ${(row.comparison.moneylineHomeEdge * 100).toFixed(1)}%` : ""}
                        {row.comparison.spread ? `Spr Diff: ${row.comparison.spread.difference.toFixed(1)}` : ""}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      row.v4ModelOpinion === "BUY" || row.v4ModelOpinion === "STRONG BUY" 
                        ? "bg-primary/20 text-primary border border-primary/30" 
                        : row.v4ModelOpinion === "FADE" 
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : "bg-muted text-muted-foreground border border-border"
                    }`}>
                      {row.v4ModelOpinion}
                    </span>
                    {row.incumbentAgreement !== "NO_INCUMBENT_FORECAST" && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Incumbent: {row.incumbentAgreement}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <p className={`text-[10px] font-bold ${
                      row.model.dataQuality === "HIGH" ? "text-primary" : "text-amber-400"
                    }`}>
                      DQ: {row.model.dataQuality}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Match: {row.marketMatch.classification.replace(/_/g, " ")}
                    </p>
                     <p className="text-[9px] text-muted-foreground/70">
                       {row.marketMatch.rootCause.replace(/_/g, " ")}
                     </p>
                    <p className="text-[9px] text-muted-foreground/60 mt-1">
                       Forecast: {new Date(row.model.featureCutoff).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {row.market?.moneyline?.capturedAt ? ` · Mkt: ${new Date(row.market.moneyline.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ""}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
