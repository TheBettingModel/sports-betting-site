import { createHash } from "node:crypto";

export type CfbdTeamMappingState = "MAPPED" | "UNMAPPED" | "AMBIGUOUS" | "INVALID";
export type CfbdGameMappingState = "MAPPED" | "UNMATCHED" | "AMBIGUOUS" | "INVALID";
export type CfbdPlayerMappingState = "MAPPED" | "PROVIDER_ONLY" | "AMBIGUOUS" | "INVALID";

export interface TeamIdentityCandidate { provider: string; teamId: string; school: string; conference?: string | null; subdivision?: string | null }
export interface CfbdTeamIdentity { id?: string | number; school?: string; mascot?: string; conference?: string; classification?: string }
export type CfbdMappingReviewStatus = "AUTO_APPROVED" | "REVIEW_REQUIRED";
export interface TeamMappingDecision {
  state: CfbdTeamMappingState;
  canonicalProvider: string | null;
  canonicalTeamId: string | null;
  reason: string;
  mappingMethod: "EXACT_PROVIDER_ID" | "EXACT_SCHOOL_MASCOT" | "EXACT_SCHOOL" | "NONE";
  confidence: "HIGH" | "NONE";
  reviewStatus: CfbdMappingReviewStatus;
}

/**
 * Curated provider display-name aliases. Keys and values are fully-normalized
 * school names, so this remains an exact identity comparison, never a fuzzy
 * name or mascot comparison.  The optional provider is deliberately accepted
 * at the boundary so CFBD and ESPN callers use the same vocabulary.
 */
const NCAAF_SCHOOL_ALIASES: Readonly<Record<string, string>> = {
  "ole miss": "mississippi",
  "ole miss rebels": "mississippi rebels",
  uconn: "connecticut",
  "uconn huskies": "connecticut huskies",
  smu: "southern methodist",
  "smu mustangs": "southern methodist mustangs",
  unlv: "nevada las vegas",
  "unlv rebels": "nevada las vegas rebels",
};

/** Exact normalized CFBD/ESPN school identity only; this intentionally is not fuzzy matching. */
export function normalizeNcaafSchoolIdentity(value: string, _provider?: string): string {
  // NFKD plus Unicode character classes makes this deterministic for accented
  // letters, typographic punctuation, and non-ASCII whitespace. It does not
  // perform edit-distance, token-subset, or other fuzzy matching.
  const normalized = value.normalize("NFKD").replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US").replace(/['’ʻ]/gu, "")
    .replace(/[\p{P}\p{S}]+/gu, " ").trim().replace(/\s+/gu, " ");
  return NCAAF_SCHOOL_ALIASES[normalized] ?? normalized;
}
export function decideCfbdTeamMapping(team: CfbdTeamIdentity, candidates: readonly TeamIdentityCandidate[]): TeamMappingDecision {
  const failed = (state: Exclude<CfbdTeamMappingState, "MAPPED">, reason: string): TeamMappingDecision =>
    ({ state, canonicalProvider: null, canonicalTeamId: null, reason, mappingMethod: "NONE", confidence: "NONE", reviewStatus: "REVIEW_REQUIRED" });
  if (team.id == null || !String(team.id).trim() || !team.school?.trim()) return failed("INVALID", "CFBD team identity lacks stable ID or school");
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [`${candidate.provider}:${candidate.teamId}`, candidate])).values()];
  const school = normalizeNcaafSchoolIdentity(team.school, "college_football_data");
  const schoolMascot = team.mascot?.trim()
    ? normalizeNcaafSchoolIdentity(`${team.school} ${team.mascot}`, "college_football_data")
    : null;
  const sameSchool = uniqueCandidates.map((candidate) => {
    const display = normalizeNcaafSchoolIdentity(candidate.school, candidate.provider);
    return { candidate, display, matchedSchoolMascot: schoolMascot != null && display === schoolMascot };
  }).filter(({ display, matchedSchoolMascot }) => display === school || matchedSchoolMascot);
  const corroboratedProviderIds = sameSchool.filter(({ candidate, matchedSchoolMascot }) =>
    String(team.id) === candidate.teamId && matchedSchoolMascot);
  if (corroboratedProviderIds.length > 1) {
    return failed("AMBIGUOUS", "More than one canonical candidate corroborates the provider ID");
  }
  if (corroboratedProviderIds.length === 1) {
    const match = corroboratedProviderIds[0]!;
    const explicitConferenceConflict = team.conference && match.candidate.conference
      && normalizeNcaafSchoolIdentity(match.candidate.conference) !== normalizeNcaafSchoolIdentity(team.conference);
    const explicitClassificationConflict = team.classification && match.candidate.subdivision
      && match.candidate.subdivision.toUpperCase() !== team.classification.toUpperCase();
    if (explicitConferenceConflict || explicitClassificationConflict) {
      return failed("UNMAPPED", "Corroborated provider ID conflicts with supplied conference or classification");
    }
    return {
      state: "MAPPED", canonicalProvider: match.candidate.provider, canonicalTeamId: match.candidate.teamId,
      reason: "Equal provider IDs corroborated by exact normalized school and mascot display identity",
      mappingMethod: "EXACT_PROVIDER_ID", confidence: "HIGH", reviewStatus: "AUTO_APPROVED",
    };
  }
  if (team.conference && sameSchool.some(({ candidate }) => !candidate.conference)) {
    return failed("UNMAPPED", "Exact school identity requires equivalent canonical conference evidence");
  }
  if (team.classification && sameSchool.some(({ candidate }) => !candidate.subdivision)) {
    return failed("UNMAPPED", "Exact school identity requires equivalent canonical classification evidence");
  }
  const matches = sameSchool.filter(({ candidate }) =>
    (!team.conference || !candidate.conference || normalizeNcaafSchoolIdentity(candidate.conference) === normalizeNcaafSchoolIdentity(team.conference))
    && (!team.classification || !candidate.subdivision || candidate.subdivision.toUpperCase() === team.classification.toUpperCase()));
  if (!matches.length) {
    return failed("UNMAPPED", sameSchool.length
      ? "Exact school identity candidate conflicts with supplied conference or classification"
      : "No exact canonical school identity candidate");
  }
  if (matches.length !== 1) return failed("AMBIGUOUS", "More than one exact canonical school identity candidate");
  const match = matches[0]!;
  const mappingMethod = match.matchedSchoolMascot ? "EXACT_SCHOOL_MASCOT" : "EXACT_SCHOOL";
  return {
    state: "MAPPED", canonicalProvider: match.candidate.provider, canonicalTeamId: match.candidate.teamId,
    reason: "Exact normalized school identity with compatible supplied context",
    mappingMethod, confidence: "HIGH", reviewStatus: "AUTO_APPROVED",
  };
}

export interface GameIdentityCandidate { provider: string; eventId: string; homeTeamId: string; awayTeamId: string; kickoffAt: Date; neutralSite?: boolean | null }
export interface CfbdGameIdentity { id?: string | number; homeCanonicalTeamId?: string | null; awayCanonicalTeamId?: string | null; kickoffAt?: Date | null; neutralSite?: boolean | null }
export interface GameMappingDecision {
  state: CfbdGameMappingState; canonicalProvider: string | null; canonicalEventId: string | null; reason: string;
  mappingMethod: "EXACT_ORDERED_TEAMS_KICKOFF" | "NONE"; confidence: "HIGH" | "NONE"; reviewStatus: CfbdMappingReviewStatus;
}
export function decideCfbdGameMapping(game: CfbdGameIdentity, candidates: readonly GameIdentityCandidate[], toleranceMinutes = 90): GameMappingDecision {
  const failed = (state: Exclude<CfbdGameMappingState, "MAPPED">, reason: string): GameMappingDecision =>
    ({ state, canonicalProvider: null, canonicalEventId: null, reason, mappingMethod: "NONE", confidence: "NONE", reviewStatus: "REVIEW_REQUIRED" });
  const kickoffAt = normalizeKickoff(game.kickoffAt);
  if (game.id == null || !String(game.id).trim()) return failed("INVALID", "CFBD game lacks stable game ID");
  if (!game.homeCanonicalTeamId || !game.awayCanonicalTeamId) return failed("INVALID", "CFBD game has one or more unmapped ordered teams");
  if (!kickoffAt) return failed("INVALID", "CFBD game lacks a valid kickoff");
  if (!Number.isFinite(toleranceMinutes) || toleranceMinutes < 0) return failed("INVALID", "Game kickoff tolerance must be a non-negative finite number");
  const orderedTeams = candidates.filter((candidate) =>
    candidate.homeTeamId === game.homeCanonicalTeamId && candidate.awayTeamId === game.awayCanonicalTeamId);
  if (!orderedTeams.length) return failed("UNMATCHED", "No candidate has the mapped ordered team pair");
  const compatibleSite = orderedTeams.filter((candidate) =>
    game.neutralSite == null || candidate.neutralSite == null || candidate.neutralSite === game.neutralSite);
  if (!compatibleSite.length) return failed("UNMATCHED", "Ordered team candidates conflict with supplied neutral-site status");
  const matches = compatibleSite.filter((candidate) => {
    const candidateKickoff = normalizeKickoff(candidate.kickoffAt);
    return candidateKickoff != null
    && Math.abs(candidateKickoff.getTime() - kickoffAt.getTime()) <= toleranceMinutes * 60_000;
  });
  if (!matches.length) return failed("UNMATCHED", "Ordered team candidates have invalid kickoffs or fall outside kickoff tolerance");
  if (matches.length !== 1) return failed("AMBIGUOUS", "Multiple ordered mapped-team candidates within kickoff tolerance");
  return {
    state: "MAPPED", canonicalProvider: matches[0]!.provider, canonicalEventId: matches[0]!.eventId,
    reason: "Mapped ordered teams and unique kickoff candidate", mappingMethod: "EXACT_ORDERED_TEAMS_KICKOFF",
    confidence: "HIGH", reviewStatus: "AUTO_APPROVED",
  };
}

function normalizeKickoff(value: unknown): Date | null {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

export function providerOnlyPlayerMapping(player: { id?: string | number; name?: string; teamId?: string | number }): { state: CfbdPlayerMappingState; reason: string } {
  return player.id == null || !String(player.id).trim() ? { state: "INVALID", reason: "CFBD player response omitted stable player ID" }
    : { state: "PROVIDER_ONLY", reason: "No cross-provider player identity is inferred from name or roster position" };
}
export function cfbdIdentityHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}