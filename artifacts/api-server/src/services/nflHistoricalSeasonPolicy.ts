import { classifyNflSeason, record, timestamp, type NflSeasonPhase } from "./nflHistoricalResultNormalization";
import type { NflV4HistoryRow } from "./nflV4HistorySafety";
import { prepareNflFinal } from "./nflFinalIngestion";

export type NflSeasonHistoryRow = NflV4HistoryRow & Readonly<{ resultEvidence: unknown }>;
export type NflSeasonDecision = Readonly<{
  eventId: string;
  phase: NflSeasonPhase;
  seasonYear: number | null;
  decision: "REGULAR_SEASON" | "EXCLUDED" | "QUARANTINED";
  reason: string;
  evidenceAvailableAt: string | null;
}>;

/** Internal warehouse metadata, not a public API or authorization input.
 * The separately reviewed repair transaction writes this only after official
 * NFL identity/score/phase corroboration. Reading it never authorizes writes.
 * Provider URLs/hashes are provenance checks, not cryptographic source attestations.
 */
export function classifyNflStoredHistory(row: NflSeasonHistoryRow, asOf: string): NflSeasonDecision {
  const evidence = record(row.resultEvidence);
  const proof = record(evidence.tbmNflIntegrity);
  // Phase metadata is not independent final-score verification. Ordinary new,
  // unchanged ESPN finals retain the production single-provider trust level;
  // corrections to conflicting stored finals require a separate source review.
  if (!Object.hasOwn(evidence, "tbmNflIntegrity") && Object.hasOwn(evidence, "tbmNflProviderFinal")) {
    const observation = record(evidence.tbmNflProviderFinal);
    const pending = record(evidence.tbmNflPendingObservation);
    const start = row.startsAt instanceof Date && Number.isFinite(row.startsAt.getTime())
      ? row.startsAt.toISOString() : "";
    const checked = prepareNflFinal({
      espnId: row.id, sport: "NFL", homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId,
      commenceTimeISO: start, homeScore: row.homeScore ?? undefined, awayScore: row.awayScore ?? undefined,
      nflFinalCapture: observation.capture,
    }, asOf);
    const n = checked.normalized;
    const valid = observation.schemaVersion === "nfl-provider-final-v1"
      && observation.verificationStatus === "SINGLE_PROVIDER_OBSERVATION"
      && observation.independentlyVerified === false && checked.decision === "ACCEPTED"
      && !(pending.status === "QUARANTINED" && pending.blocking === true);
    return {
      eventId: row.id, phase: n?.seasonPhase ?? "UNKNOWN", seasonYear: n?.seasonYear ?? null,
      decision: !valid ? "QUARANTINED" : n!.seasonPhase === "REGULAR_SEASON" ? "REGULAR_SEASON" : "EXCLUDED",
      reason: !valid ? "INVALID_OR_CONFLICTING_PROVIDER_PHASE_EVIDENCE"
        : n!.seasonPhase === "REGULAR_SEASON" ? "ESPN_EVENT_PHASE_SINGLE_PROVIDER"
        : `${n!.seasonPhase}_EXCLUDED_FROM_REGULAR_SEASON_MODEL`,
      evidenceAvailableAt: n?.observedAt ?? null,
    };
  }
  const year = proof.seasonYear;
  const phaseTypes: Record<string, number> = { PRESEASON: 1, REGULAR_SEASON: 2, POSTSEASON: 3 };
  const classification = classifyNflSeason({ year, type: phaseTypes[String(proof.seasonPhase)] });
  const out = (decision: NflSeasonDecision["decision"], reason: string): NflSeasonDecision => ({
    eventId: row.id, phase: classification.phase, seasonYear: classification.year,
    decision, reason, evidenceAvailableAt: timestamp(proof.evidenceAvailableAt),
  });
  if (proof.schemaVersion !== "nfl-history-integrity-v1" || proof.status !== "CORROBORATED"
    || proof.verificationMethod !== "OFFICIAL_NFL_SEASON_METADATA_REVIEW"
    || !/^[a-f0-9]{64}$/.test(String(proof.bundleSha256))) {
    return out("QUARANTINED", "MISSING_CORROBORATED_SEASON_EVIDENCE");
  }
  if (!classification.year || classification.phase === "UNKNOWN"
    || !Number.isInteger(proof.week) || Number(proof.week) < 1 || Number(proof.week) > 30) {
    return out("QUARANTINED", "UNKNOWN_SEASON_PHASE");
  }
  const start = row.startsAt instanceof Date && Number.isFinite(row.startsAt.getTime())
    ? timestamp(row.startsAt.toISOString()) : null;
  if (proof.gameId !== row.id || proof.homeTeamId !== row.homeTeamId || proof.awayTeamId !== row.awayTeamId
    || !start || timestamp(proof.startsAt) !== start
    || proof.homeScore !== row.homeScore || proof.awayScore !== row.awayScore) {
    return out("QUARANTINED", "SEASON_EVIDENCE_ROW_BINDING_MISMATCH");
  }
  const cutoff = timestamp(asOf), available = timestamp(proof.evidenceAvailableAt);
  if (!cutoff || !available || available > cutoff || available <= start) {
    return out("QUARANTINED", "SEASON_EVIDENCE_NOT_AVAILABLE");
  }
  const source = record(proof.phaseSource);
  const phaseCode = classification.phase === "PRESEASON" ? "pre"
    : classification.phase === "REGULAR_SEASON" ? "reg" : "post";
  let locator: URL;
  try { locator = new URL(String(source.fixtureUrl)); }
  catch { return out("QUARANTINED", "INVALID_SEASON_PROVENANCE"); }
  if (source.url !== `https://www.nfl.com/scores/${classification.year}/${phaseCode}${proof.week}`
    || locator.origin !== "https://www.nfl.com"
    || locator.search || locator.hash || locator.username || locator.password
    || !new RegExp(`^/games/[a-z0-9-]+-at-[a-z0-9-]+-${classification.year}-${phaseCode}-${proof.week}$`).test(locator.pathname)
    || !/^[a-f0-9]{64}$/.test(String(source.sha256))
    || source.captureType !== "WEB_FETCH_EXTRACTED_MARKDOWN"
    || !timestamp(source.capturedAt) || timestamp(source.capturedAt)! > available) {
    return out("QUARANTINED", "INVALID_SEASON_PROVENANCE");
  }
  return classification.phase === "REGULAR_SEASON"
    ? out("REGULAR_SEASON", "CORROBORATED_REGULAR_SEASON")
    : out("EXCLUDED", `${classification.phase}_EXCLUDED_FROM_REGULAR_SEASON_MODEL`);
}

/** Never silently drop unknown history and claim that regular-season coverage
 * is complete. Explicit PRE/POST exclusions are intentional; unknowns block.
 * Retrospectively reviewed evidence is available only at its real capture time.
 */
export function selectNflRegularSeasonHistory<T extends NflSeasonHistoryRow>(
  rows: readonly T[], asOf: string,
): { history: Array<T & { verifiedEvidenceAvailableAt: string }>; decisions: NflSeasonDecision[] } {
  const decisions = rows.map(row => classifyNflStoredHistory(row, asOf));
  const blocked = decisions.filter(d => d.decision === "QUARANTINED");
  if (blocked.length) {
    const error = new Error("NFL_HISTORY_SEASON_EVIDENCE_BLOCKED");
    Object.assign(error, { code: "NFL_HISTORY_SEASON_EVIDENCE_BLOCKED", decisions });
    throw error;
  }
  return {
    history: rows.flatMap((row, i) => decisions[i]!.decision === "REGULAR_SEASON"
      ? [{ ...row, verifiedEvidenceAvailableAt: decisions[i]!.evidenceAvailableAt! }] : []),
    decisions,
  };
}
