import { providerId, score } from "./nflHistoricalResultNormalization";

/** Structural checks only. Database rows do NOT establish independent source
 * verification, schedule completeness, season phase, or actual completion time. */
export type NflV4HistoryRow = Readonly<{
  id: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  startsAt: Date | null;
  homeScore: number | null;
  awayScore: number | null;
}>;
export type NflHistoryIssue = Readonly<{
  eventId: string | null;
  reason: "INVALID_EVENT_ID" | "INVALID_TEAM_IDENTITY" | "INVALID_KICKOFF"
    | "OUTSIDE_HISTORY_WINDOW" | "MISSING_FINAL_SCORE" | "INVALID_FINAL_SCORE"
    | "SUSPICIOUS_ZERO_ZERO_FINAL" | "CONFLICTING_EVENT_HISTORY" | "FIXTURE_EVENT_ID_COLLISION";
}>;

export class NflHistoryIntegrityError extends Error {
  readonly code = "NFL_HISTORY_INTEGRITY_BLOCKED";
  constructor(readonly issues: readonly NflHistoryIssue[]) {
    super("NFL_HISTORY_INTEGRITY_BLOCKED");
    this.name = "NflHistoryIntegrityError";
  }
}

/** Reject the WHOLE supplied batch on any questionable row; do not silently
 * filter bad finals and produce a forecast from a knowingly incomplete subset.
 * Exact semantic duplicates are safely replayed once. No corrections occur. */
export function requireNflV4History<T extends NflV4HistoryRow>(
  history: readonly T[], seedBoundary: string, targetKickoff: Date,
): T[] {
  const seed = Date.parse(seedBoundary), target = targetKickoff.getTime();
  if (!Number.isFinite(seed) || !Number.isFinite(target) || seed >= target || !Array.isArray(history)) {
    throw new Error("NFL_HISTORY_CONTEXT_INVALID");
  }
  const issues: NflHistoryIssue[] = [];
  const events = new Map<string, { signature: string; row: T }>();
  const fixtures = new Map<string, string>();
  for (const row of history) {
    // Stored game identities use NFL-<ESPN id>; raw provider observations use
    // the numeric id. Bridge only this exact namespace, never arbitrary prefixes.
    const rawId = row && typeof row.id === "string" ? row.id : null;
    const candidateId = rawId?.startsWith("NFL-") ? rawId.slice(4) : rawId;
    const id = candidateId && providerId(candidateId) === candidateId ? candidateId : null;
    const issue = (reason: NflHistoryIssue["reason"]) => issues.push({ eventId: id ? rawId : null, reason });
    if (!row || !id) { issue("INVALID_EVENT_ID"); continue; }
    if (providerId(row.homeTeamId) !== row.homeTeamId || !row.homeTeamId
      || providerId(row.awayTeamId) !== row.awayTeamId || !row.awayTeamId
      || row.homeTeamId === row.awayTeamId) issue("INVALID_TEAM_IDENTITY");
    const start = row.startsAt instanceof Date ? row.startsAt.getTime() : NaN;
    if (!Number.isFinite(start)) issue("INVALID_KICKOFF");
    else if (start <= seed || start >= target) issue("OUTSIDE_HISTORY_WINDOW");
    if (row.homeScore == null || row.awayScore == null) issue("MISSING_FINAL_SCORE");
    else if (typeof row.homeScore !== "number" || typeof row.awayScore !== "number"
      || score(row.homeScore) === null || score(row.awayScore) === null) issue("INVALID_FINAL_SCORE");
    else if (row.homeScore === 0 && row.awayScore === 0) issue("SUSPICIOUS_ZERO_ZERO_FINAL");
    // Even invalid rows can conflict with a second observation; never pick the
    // first/last score as a correction. JSON encodes a deterministic row identity.
    const signature = JSON.stringify([row.homeTeamId, row.awayTeamId, start, row.homeScore, row.awayScore]);
    const prior = events.get(id);
    if (prior && prior.signature !== signature) issue("CONFLICTING_EVENT_HISTORY");
    if (!prior || (prior.signature === signature && row.id < prior.row.id)) events.set(id, { signature, row });
    if (row.homeTeamId && row.awayTeamId && Number.isFinite(start)) {
      const fixture = JSON.stringify([[row.homeTeamId, row.awayTeamId].sort(), start]);
      const priorId = fixtures.get(fixture);
      if (priorId && priorId !== id) issue("FIXTURE_EVENT_ID_COLLISION");
      fixtures.set(fixture, id);
    }
  }
  if (issues.length) {
    const distinct = new Map(issues.map(i => [JSON.stringify(i), i]));
    throw new NflHistoryIntegrityError([...distinct.values()]
      .sort((a, b) => (a.eventId ?? "").localeCompare(b.eventId ?? "") || a.reason.localeCompare(b.reason)));
  }
  return [...events.values()].map(e => e.row)
    .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime() || a.id.localeCompare(b.id));
}
