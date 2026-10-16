import { canonicalizeHistoricalEvent, type CanonicalHistoricalEvent } from "./v4HistoricalWarehouse";
import { stableHash } from "./v4Platform";
import { classifyNflSeason, completion, kickoffTimestamp, providerId, record, score, timestamp, type NflSeasonPhase } from "./nflHistoricalResultNormalization";

export type NflValidationReason =
  | "MALFORMED_EVENT" | "INVALID_EVENT_ID" | "COMPETITION_COUNT_INVALID"
  | "COMPETITION_EVENT_ID_MISMATCH" | "COMPETITOR_COUNT_INVALID" | "HOME_AWAY_IDENTITY_INVALID"
  | "INVALID_TEAM_ID" | "COMPETITOR_TEAM_ID_MISMATCH" | "SAME_TEAM_BOTH_SIDES"
  | "INVALID_KICKOFF" | "KICKOFF_METADATA_CONFLICT" | "INVALID_OBSERVED_AT"
  | "FINAL_OBSERVED_BEFORE_KICKOFF" | "MISSING_SEASON_YEAR" | "UNKNOWN_SEASON_PHASE"
  | "SEASON_PHASE_CONFLICT" | "PRESEASON_EXCLUDED" | "POSTSEASON_EXCLUDED"
  | "NONFINAL_EVENT" | "UNKNOWN_COMPLETION_STATUS" | "STATUS_METADATA_CONFLICT"
  | "MISSING_FINAL_SCORE" | "INVALID_FINAL_SCORE" | "SUSPICIOUS_ZERO_ZERO_FINAL"
  | "WINNER_SCORE_MISMATCH" | "INVALID_WINNER_FLAG" | "EXPECTED_IDENTITY_MISMATCH"
  | "REFERENCE_IDENTITY_MISMATCH" | "INVALID_REFERENCE_SCORE" | "REFERENCE_SCORE_CONFLICT"
  | "CONFLICTING_EVENT_IDENTITY" | "CONFLICTING_FINAL_SCORES" | "FIXTURE_EVENT_ID_COLLISION" | "DUPLICATE_OBSERVATION"
  | "VALID_REGULAR_SEASON_FINAL" | `WAREHOUSE_${string}`;

export type NflExpectedIdentity = Readonly<{
  eventId: string; homeTeamId: string; awayTeamId: string; kickoff?: string;
}>;
export type NflObservation = Readonly<{
  event: unknown;
  observedAt: string;
  expectedIdentity?: NflExpectedIdentity;
  referenceFinal?: NflExpectedIdentity & Readonly<{ homeScore: number; awayScore: number }>;
}>;
export type NflNormalizedResult = Readonly<{
  eventId: string | null;
  homeTeamId: string | null; awayTeamId: string | null;
  homeTeamName: string | null; awayTeamName: string | null;
  kickoff: string | null; observedAt: string | null;
  seasonYear: number | null; seasonPhase: NflSeasonPhase;
  completion: "FINAL" | "NONFINAL" | "UNKNOWN";
  homeScore: number | null; awayScore: number | null;
  /** Hash of supplied parsed JSON, NOT an attestation of original provider bytes. */
  eventPayloadHash: string;
}>;
export type NflValidationDecision = Readonly<{
  decision: "ACCEPTED" | "REJECTED" | "QUARANTINED";
  reasons: readonly NflValidationReason[];
  normalized: NflNormalizedResult | null;
  warehouseEvent: CanonicalHistoricalEvent | null;
}>;

/** Validation only: ACCEPTED is not source verification or persistence permission. */
export function validateNflHistoricalResult(input: NflObservation): NflValidationDecision {
  const event = record(input.event);
  let payloadHash: string;
  try {
    if (Object.keys(event).length === 0) throw new Error("empty");
    payloadHash = stableHash(event);
  } catch {
    return { decision: "REJECTED", reasons: ["MALFORMED_EVENT"], normalized: null, warehouseEvent: null };
  }
  const quarantine: NflValidationReason[] = [], rejected: NflValidationReason[] = [];
  const q = (reason: NflValidationReason) => { if (!quarantine.includes(reason)) quarantine.push(reason); };
  const eventId = providerId(event.id);
  if (!eventId) q("INVALID_EVENT_ID");
  const competitions = Array.isArray(event.competitions) ? event.competitions : [];
  if (competitions.length !== 1) q("COMPETITION_COUNT_INVALID");
  const competition = record(competitions.length === 1 ? competitions[0] : null);
  if (competition.id !== undefined && providerId(competition.id) !== eventId) q("COMPETITION_EVENT_ID_MISMATCH");
  const competitors = Array.isArray(competition.competitors) ? competition.competitors.map(record) : [];
  if (competitors.length !== 2) q("COMPETITOR_COUNT_INVALID");
  const homes = competitors.filter(c => c.homeAway === "home");
  const aways = competitors.filter(c => c.homeAway === "away");
  if (homes.length !== 1 || aways.length !== 1) q("HOME_AWAY_IDENTITY_INVALID");
  const home = homes[0] ?? {}, away = aways[0] ?? {};
  const homeTeam = record(home.team), awayTeam = record(away.team);
  const homeId = providerId(homeTeam.id), awayId = providerId(awayTeam.id);
  if (!homeId || !awayId) q("INVALID_TEAM_ID");
  for (const c of [home, away]) {
    if (c.id !== undefined && providerId(c.id) !== providerId(record(c.team).id)) q("COMPETITOR_TEAM_ID_MISMATCH");
  }
  if (homeId && homeId === awayId) q("SAME_TEAM_BOTH_SIDES");
  const kickoff = kickoffTimestamp(event.date), observedAt = timestamp(input.observedAt);
  if (!kickoff) q("INVALID_KICKOFF");
  if (competition.date !== undefined && kickoffTimestamp(competition.date) !== kickoff) q("KICKOFF_METADATA_CONFLICT");
  if (!observedAt) q("INVALID_OBSERVED_AT");
  const season = classifyNflSeason(event.season);
  if (season.year === null) q("MISSING_SEASON_YEAR");
  if (season.conflict) q("SEASON_PHASE_CONFLICT");
  if (season.phase === "UNKNOWN") q("UNKNOWN_SEASON_PHASE");
  if (season.phase === "PRESEASON") rejected.push("PRESEASON_EXCLUDED");
  if (season.phase === "POSTSEASON") rejected.push("POSTSEASON_EXCLUDED");
  const eventState = event.status === undefined ? null : completion(event.status);
  const competitionState = competition.status === undefined ? null : completion(competition.status);
  if (eventState !== null && competitionState !== null && eventState !== competitionState) q("STATUS_METADATA_CONFLICT");
  const state = competitionState ?? eventState ?? "UNKNOWN";
  if (state === "UNKNOWN") q("UNKNOWN_COMPLETION_STATUS");
  if (state === "NONFINAL") rejected.push("NONFINAL_EVENT");
  const homeScore = score(home.score), awayScore = score(away.score);
  if (state === "FINAL") {
    if (kickoff && observedAt && observedAt <= kickoff) q("FINAL_OBSERVED_BEFORE_KICKOFF");
    for (const c of [home, away]) {
      if (c.score === undefined || c.score === null || (typeof c.score === "string" && c.score.trim() === "")) q("MISSING_FINAL_SCORE");
      else if (score(c.score) === null) q("INVALID_FINAL_SCORE");
    }
    if (homeScore === 0 && awayScore === 0) q("SUSPICIOUS_ZERO_ZERO_FINAL");
    for (const [c, own, other] of [[home, homeScore, awayScore], [away, awayScore, homeScore]] as const) {
      if (c.winner !== undefined && typeof c.winner !== "boolean") q("INVALID_WINNER_FLAG");
      else if (typeof c.winner === "boolean" && own !== null && other !== null && c.winner !== (own > other)) q("WINNER_SCORE_MISMATCH");
    }
  }
  const matches = (expected: NflExpectedIdentity) =>
    providerId(expected.eventId) === eventId && providerId(expected.homeTeamId) === homeId
    && providerId(expected.awayTeamId) === awayId
    && (expected.kickoff === undefined || kickoffTimestamp(expected.kickoff) === kickoff);
  if (input.expectedIdentity && !matches(input.expectedIdentity)) q("EXPECTED_IDENTITY_MISMATCH");
  if (input.referenceFinal) {
    if (!matches(input.referenceFinal)) q("REFERENCE_IDENTITY_MISMATCH");
    else if (score(input.referenceFinal.homeScore) === null || score(input.referenceFinal.awayScore) === null) q("INVALID_REFERENCE_SCORE");
    else if (state === "FINAL" && (homeScore !== input.referenceFinal.homeScore || awayScore !== input.referenceFinal.awayScore)) q("REFERENCE_SCORE_CONFLICT");
  }
  const name = (team: Record<string, unknown>) => typeof team.displayName === "string"
    && team.displayName.trim() ? team.displayName.trim().replace(/\s+/g, " ") : null;
  const normalized: NflNormalizedResult = {
    eventId, homeTeamId: homeId, awayTeamId: awayId,
    homeTeamName: name(homeTeam), awayTeamName: name(awayTeam),
    kickoff, observedAt, seasonYear: season.year, seasonPhase: season.phase,
    completion: state, homeScore, awayScore, eventPayloadHash: payloadHash,
  };
  const reasons = [...quarantine, ...rejected];
  if (reasons.length) return {
    decision: quarantine.length ? "QUARANTINED" : "REJECTED", reasons, normalized, warehouseEvent: null,
  };
  // A final observed at retrieval was completed by then. Never invent a
  // provider-reported end time or backdate availability to the kickoff.
  const warehouseEvent = canonicalizeHistoricalEvent({
    sport: "NFL", league: "NFL", provider: "ESPN", providerEventId: eventId!,
    season: String(season.year), eventStart: kickoff!,
    completionTime: observedAt!, completionTimeKind: "CONSERVATIVE_BOUND",
    targetAvailableAt: observedAt!, homeParticipantId: homeId!, awayParticipantId: awayId!,
    homeScore, awayScore, rawEventHash: payloadHash,
  });
  if (warehouseEvent.eligibility !== "ELIGIBLE") return {
    decision: "QUARANTINED", reasons: [`WAREHOUSE_${warehouseEvent.quarantineReason}`],
    normalized, warehouseEvent: null,
  };
  return { decision: "ACCEPTED", reasons: ["VALID_REGULAR_SEASON_FINAL"], normalized, warehouseEvent };
}

/** All conflicting finals are quarantined; input ordering cannot pick a winner. */
export function validateNflHistoricalResults(inputs: readonly NflObservation[]): NflValidationDecision[] {
  const results = inputs.map(validateNflHistoricalResult);
  const groups = new Map<string, number[]>();
  results.forEach((r, i) => {
    if (r.normalized?.eventId) {
      const group = groups.get(r.normalized.eventId) ?? [];
      group.push(i); groups.set(r.normalized.eventId, group);
    }
  });
  const quarantine = (i: number, reason: NflValidationReason) => {
    const r = results[i]!;
    results[i] = { ...r, decision: "QUARANTINED", warehouseEvent: null,
      reasons: [...r.reasons.filter(x => x !== "VALID_REGULAR_SEASON_FINAL"), reason] };
  };
  for (const indices of groups.values()) {
    const finals = indices.filter(i => results[i]!.normalized!.completion === "FINAL");
    const identities = new Set(finals.map(i => {
      const n = results[i]!.normalized!;
      return stableHash([n.homeTeamId, n.awayTeamId, n.kickoff, n.seasonYear, n.seasonPhase]);
    }));
    const scores = new Set(finals.filter(i => {
      const n = results[i]!.normalized!;
      return n.homeScore !== null && n.awayScore !== null;
    }).map(i => stableHash([results[i]!.normalized!.homeScore, results[i]!.normalized!.awayScore])));
    if (identities.size > 1) finals.forEach(i => quarantine(i, "CONFLICTING_EVENT_IDENTITY"));
    if (scores.size > 1) finals.forEach(i => quarantine(i, "CONFLICTING_FINAL_SCORES"));
    const seen = new Set<string>();
    const accepted = indices.filter(i => results[i]!.decision === "ACCEPTED").sort((a, b) => {
      const x = results[a]!.normalized!, y = results[b]!.normalized!;
      return x.observedAt!.localeCompare(y.observedAt!) || x.eventPayloadHash.localeCompare(y.eventPayloadHash);
    });
    for (const i of accepted) {
      const n = results[i]!.normalized!;
      // Semantic duplicate: presentation changes and retrieval time are not new results.
      const key = stableHash([n.homeTeamId, n.awayTeamId, n.kickoff, n.seasonYear,
        n.seasonPhase, n.homeScore, n.awayScore]);
      if (seen.has(key)) results[i] = { ...results[i]!, decision: "REJECTED",
        reasons: ["DUPLICATE_OBSERVATION"], warehouseEvent: null };
      seen.add(key);
    }
  }
  // A second provider ID must not cause one fixture to be counted twice.
  const fixtures = new Map<string, number[]>();
  results.forEach((r, i) => {
    const n = r.normalized;
    if (!n || n.completion !== "FINAL" || !n.eventId || !n.homeTeamId || !n.awayTeamId || !n.kickoff) return;
    const key = stableHash([n.homeTeamId, n.awayTeamId, n.kickoff, n.seasonYear]);
    const indices = fixtures.get(key) ?? [];
    indices.push(i); fixtures.set(key, indices);
  });
  for (const indices of fixtures.values()) {
    if (new Set(indices.map(i => results[i]!.normalized!.eventId)).size > 1) {
      indices.forEach(i => quarantine(i, "FIXTURE_EVENT_ID_COLLISION"));
    }
  }
  return results;
}
