import { createHash } from "node:crypto";

/** NCAA-only data contracts. No NFL imports, storage, clocks or provider calls. */
export type NcaafPhase = "REGULAR_SEASON" | "BOWL" | "CFP" | "POSTSEASON" | "EXHIBITION" | "UNKNOWN";
export type NcaafProvider = "ESPN" | "CFBD" | "NCAA_OFFICIAL";
export type NcaafIdentity = Readonly<{
  gameId: string; homeTeamId: string; awayTeamId: string; kickoffAt: string;
}>;
export type NcaafIdentityBinding = Readonly<{
  canonical: NcaafIdentity; sourceEventId: string; sourceHomeTeamId: string;
  sourceAwayTeamId: string; mappingEvidenceHash: string;
}>;
export type NcaafSourceCapture = Readonly<{
  provider: NcaafProvider; sourceUrl: string; capturedAt: string;
  payload: unknown; payloadHash: string; binding?: NcaafIdentityBinding;
}>;
export type NcaafFinalFact = Readonly<{
  identity: NcaafIdentity; season: number; phase: NcaafPhase;
  homeScore: number; awayScore: number; capturedAt: string;
  provider: NcaafProvider; upstreamFamily: "ESPN" | "UNVERIFIED_CFBD" | "NCAA_OFFICIAL";
  payloadHash: string;
}>;
export type NcaafEvidenceDecision = Readonly<{
  decision: "ACCEPTED" | "QUARANTINED" | "REJECTED";
  reasons: readonly string[]; fact: NcaafFinalFact | null;
  verification: "NONE" | "SINGLE_UPSTREAM" | "INDEPENDENTLY_CORROBORATED";
  evidenceHashes: readonly string[];
}>;
export const ncaaObject = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
  : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
export const ncaafIntegrityHash = (v: unknown): string =>
  createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
const id = (v: unknown): string | null => /^(?:[1-9]\d*)$/.test(String(v ?? "")) ? String(v) : null;
const instant = (v: unknown): string | null => {
  if (typeof v !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(v)) return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
};
const score = (v: unknown): number | null => {
  if (!(typeof v === "number" || typeof v === "string" && /^\d+$/.test(v))) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 2_147_483_647 ? n : null;
};
export function validNcaafIdentity(v: NcaafIdentity): boolean {
  return /^NCAAF-[1-9]\d*$/.test(v.gameId) && !!id(v.homeTeamId) && !!id(v.awayTeamId)
    && v.homeTeamId !== v.awayTeamId && !!instant(v.kickoffAt);
}
export function sameNcaafIdentity(a: NcaafIdentity, b: NcaafIdentity): boolean {
  return a.gameId === b.gameId && a.homeTeamId === b.homeTeamId && a.awayTeamId === b.awayTeamId
    && !!instant(a.kickoffAt) && instant(a.kickoffAt) === instant(b.kickoffAt);
}
/** NCAA postseason stays usable. NFL regular-season-only policy is not reused. */
export function classifyNcaafPhase(seasonType: unknown, playoff: unknown, bowl: unknown): NcaafPhase {
  if (seasonType === 1 || seasonType === "preseason" || seasonType === "exhibition") return "EXHIBITION";
  const p = ncaaObject(playoff);
  const isCfp = p.competition === "cfp";
  if (seasonType === 2 || seasonType === "regular") return isCfp ? "UNKNOWN" : "REGULAR_SEASON";
  if (seasonType !== 3 && seasonType !== "postseason") return "UNKNOWN";
  if (isCfp) return "CFP";
  return typeof bowl === "string" && bowl.trim() ? "BOWL" : "POSTSEASON";
}
export function captureNcaafSource(
  provider: NcaafProvider, payload: unknown, sourceUrl: string, capturedAt: string,
  binding?: NcaafIdentityBinding,
): NcaafSourceCapture | null {
  try {
    const json = JSON.stringify(payload);
    if (!json || Buffer.byteLength(json) > 256_000) return null;
    const snapshot: unknown = JSON.parse(json);
    return { provider, sourceUrl, capturedAt, payload: snapshot, payloadHash: ncaafIntegrityHash(snapshot),
      ...(binding ? { binding: JSON.parse(JSON.stringify(binding)) as NcaafIdentityBinding } : {}) };
  } catch { return null; }
}
function validSourceUrl(c: NcaafSourceCapture): boolean {
  try {
    const u = new URL(c.sourceUrl);
    if (u.protocol !== "https:" || u.username || u.password || u.hash || u.port) return false;
    if (c.provider === "ESPN") {
      const date = u.searchParams.get("dates") ?? "";
      const parsed = /^\d{8}$/.test(date)
        ? new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T00:00:00Z`) : null;
      return u.hostname === "site.api.espn.com"
        && u.pathname === "/apis/site/v2/sports/football/college-football/scoreboard"
        && !!parsed && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10).replaceAll("-", "") === date
        && u.searchParams.get("limit") === "100" && [...u.searchParams.keys()].length === 2;
    }
    if (c.provider === "CFBD") return u.hostname === "api.collegefootballdata.com" && u.pathname === "/games"
      && [...u.searchParams.keys()].every(k => ["year", "seasonType", "week", "team", "id"].includes(k));
    return c.provider === "NCAA_OFFICIAL" && u.hostname === "stats.ncaa.org"
      && /^\/(?:contests|game)\/[1-9]\d*(?:\/[^?#]*)?$/.test(u.pathname) && !u.search;
  } catch { return false; }
}
export function normalizeNcaafFinalEvidence(
  expected: NcaafIdentity, c: NcaafSourceCapture, asOf: string,
): NcaafEvidenceDecision {
  const fail = (reason: string, reject = false): NcaafEvidenceDecision => ({
    decision: reject ? "REJECTED" : "QUARANTINED", reasons: [reason], fact: null,
    verification: "NONE", evidenceHashes: [],
  });
  if (!validNcaafIdentity(expected)) return fail("INVALID_NCAAF_IDENTITY", true);
  if (!validSourceUrl(c)) return fail("INVALID_NCAAF_SOURCE_URL", true);
  try { if (ncaafIntegrityHash(c.payload) !== c.payloadHash) return fail("SOURCE_HASH_MISMATCH", true); }
  catch { return fail("INVALID_SOURCE_PAYLOAD", true); }
  const capturedAt = instant(c.capturedAt), cutoff = instant(asOf), kickoff = instant(expected.kickoffAt)!;
  if (!capturedAt || !cutoff || capturedAt > cutoff || capturedAt <= kickoff) return fail("UNSAFE_EVIDENCE_TIME");
  const root = ncaaObject(c.payload), event = ncaaObject(root.game ?? root);
  let sourceEventId: string | null, homeId: string | null, awayId: string | null;
  let start: string | null, home: number | null, away: number | null, season: unknown, phase: NcaafPhase, complete: boolean;
  if (c.provider === "ESPN") {
    const competitions = Array.isArray(event.competitions) ? event.competitions : [];
    if (competitions.length !== 1) return fail("AMBIGUOUS_COMPETITION");
    const competition = ncaaObject(competitions[0]);
    const competitors = Array.isArray(competition.competitors) ? competition.competitors.map(ncaaObject) : [];
    const homes = competitors.filter(x => x.homeAway === "home"), aways = competitors.filter(x => x.homeAway === "away");
    if (competitors.length !== 2 || homes.length !== 1 || aways.length !== 1) return fail("AMBIGUOUS_TEAMS");
    sourceEventId = id(event.id); homeId = id(ncaaObject(homes[0]!.team).id); awayId = id(ncaaObject(aways[0]!.team).id);
    start = instant(competition.date ?? event.date);
    home = score(homes[0]!.score); away = score(aways[0]!.score);
    const status = ncaaObject(ncaaObject(event.status).type);
    complete = status.completed === true && status.state === "post"
      && typeof status.name === "string" && /^STATUS_FINAL(?:_OT)?$/.test(status.name);
    const s = ncaaObject(event.season); season = s.year;
    phase = classifyNcaafPhase(s.type, event.playoff, event.bowlName);
    if (sourceEventId !== expected.gameId.slice(6) || homeId !== expected.homeTeamId || awayId !== expected.awayTeamId) {
      return fail("EVENT_OR_TEAM_IDENTITY_MISMATCH", true);
    }
  } else {
    // A CFBD numeric ID equal to an ESPN ID is NOT identity corroboration.
    // Official NCAA references use a reviewed extraction + exact identity mapping.
    const official = c.provider === "NCAA_OFFICIAL";
    if (official && event.sport !== "NCAAF") return fail("WRONG_REFERENCE_SPORT", true);
    sourceEventId = id(event.id);
    homeId = id(official ? event.homeTeamId : event.homeId);
    awayId = id(official ? event.awayTeamId : event.awayId);
    start = instant(official ? event.kickoffAt : event.startDate);
    home = score(official ? event.homeScore : event.homePoints);
    away = score(official ? event.awayScore : event.awayPoints);
    complete = event.completed === true;
    season = event.season;
    phase = classifyNcaafPhase(event.seasonType, event.playoff, event.bowlName);
    const b = c.binding;
    if (!b || !/^[a-f0-9]{64}$/.test(b.mappingEvidenceHash) || !sameNcaafIdentity(expected, b.canonical)
      || b.sourceEventId !== sourceEventId || b.sourceHomeTeamId !== homeId || b.sourceAwayTeamId !== awayId) {
      return fail("VERIFIED_SOURCE_IDENTITY_BINDING_REQUIRED");
    }
  }
  if (start !== kickoff) return fail("KICKOFF_IDENTITY_MISMATCH", true);
  if (!complete) return fail("NOT_A_VERIFIED_COMPLETED_GAME");
  if (home === null || away === null) return fail("INVALID_OR_MISSING_FINAL_SCORE");
  if (home === 0 && away === 0) return fail("SUSPICIOUS_ZERO_ZERO_FINAL");
  if (home === away) return fail("MODERN_NCAAF_TIED_FINAL");
  if (!Number.isInteger(season) || Number(season) < 2023
    || Date.parse(kickoff) < Date.UTC(Number(season), 6, 1)
    || Date.parse(kickoff) >= Date.UTC(Number(season) + 1, 6, 1)) return fail("SEASON_KICKOFF_MISMATCH");
  if (phase === "UNKNOWN" || phase === "EXHIBITION") return fail(phase === "UNKNOWN" ? "UNKNOWN_NCAAF_PHASE" : "EXHIBITION_EXCLUDED");
  return { decision: "ACCEPTED", reasons: ["VALID_NCAAF_FINAL"], verification: "SINGLE_UPSTREAM",
    fact: { identity: { ...expected, kickoffAt: kickoff }, season: Number(season), phase, homeScore: home, awayScore: away,
      capturedAt, provider: c.provider, upstreamFamily: c.provider === "CFBD" ? "UNVERIFIED_CFBD" : c.provider,
      payloadHash: c.payloadHash }, evidenceHashes: [c.payloadHash] };
}
export function verifyNcaafFinalEvidence(
  expected: NcaafIdentity, captures: readonly NcaafSourceCapture[], asOf: string,
): NcaafEvidenceDecision {
  if (!captures.length) return { decision: "QUARANTINED", reasons: ["MISSING_SOURCE_EVIDENCE"],
    verification: "NONE", fact: null, evidenceHashes: [] };
  const checks = captures.map(c => normalizeNcaafFinalEvidence(expected, c, asOf));
  const invalid = checks.find(c => c.decision !== "ACCEPTED");
  if (invalid) return invalid; // Bad observations never disappear by majority vote.
  const facts = checks.map(c => c.fact!);
  const first = facts[0]!;
  const phases = new Set(facts.filter(f => f.phase !== "POSTSEASON").map(f => f.phase));
  if (facts.some(f => f.homeScore !== first.homeScore || f.awayScore !== first.awayScore || f.season !== first.season)
    || phases.size > 1 || facts.some(f => f.phase === "POSTSEASON") && phases.has("REGULAR_SEASON")) return { decision: "QUARANTINED", reasons: ["CONFLICTING_SOURCE_FINALS"],
      fact: null, verification: "NONE", evidenceHashes: [] };
  const families = new Set(facts.map(f => f.upstreamFamily).filter(f => f !== "UNVERIFIED_CFBD"));
  const verification = families.size >= 2 ? "INDEPENDENTLY_CORROBORATED" : "SINGLE_UPSTREAM";
  return { decision: "ACCEPTED", reasons: [verification === "SINGLE_UPSTREAM"
    ? "INDEPENDENT_CORROBORATION_NOT_ESTABLISHED" : "INDEPENDENT_SOURCES_AGREE"],
    fact: { ...(facts.find(f => f.phase !== "POSTSEASON") ?? first),
      capturedAt: facts.map(f => f.capturedAt).sort().at(-1)! }, verification,
    evidenceHashes: [...new Set(facts.map(f => f.payloadHash))].sort() };
}

/** Proposed historical-evidence gate, not a replacement for frozen V4 rows.
 * A later capture/correction cannot retrospectively become pregame evidence. */
export function assessNcaafHistoricalEligibility(
  evidence: NcaafEvidenceDecision,
  context: { targetKickoffAt: string; allowedSeasons: readonly number[];
    homeClassification: string | null; awayClassification: string | null },
) {
  const reasons: string[] = [];
  if (evidence.decision !== "ACCEPTED" || !evidence.fact) reasons.push("UNVERIFIED_HISTORICAL_RESULT");
  if (evidence.verification !== "INDEPENDENTLY_CORROBORATED") reasons.push("INDEPENDENT_HISTORICAL_VERIFICATION_REQUIRED");
  if (context.homeClassification !== "fbs" || context.awayClassification !== "fbs") reasons.push("OUTSIDE_FBS_VS_FBS_MODEL_DOMAIN");
  const target = instant(context.targetKickoffAt), fact = evidence.fact;
  if (!target || fact && (fact.identity.kickoffAt >= target || fact.capturedAt >= target)) reasons.push("NOT_AVAILABLE_BEFORE_TARGET_KICKOFF");
  if (fact && !context.allowedSeasons.includes(fact.season)) reasons.push("SEASON_OUTSIDE_EXPLICIT_MODEL_CONTEXT");
  if (fact && ["EXHIBITION", "UNKNOWN"].includes(fact.phase)) reasons.push("INELIGIBLE_NCAAF_PHASE");
  return { eligible: reasons.length === 0, reasons };
}
