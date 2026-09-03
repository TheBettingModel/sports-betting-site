import { createHash } from "node:crypto";

export type CfbdTeamMappingState = "MAPPED" | "UNMAPPED" | "AMBIGUOUS" | "INVALID";
export type CfbdGameMappingState = "MAPPED" | "UNMATCHED" | "AMBIGUOUS" | "INVALID";
export type CfbdPlayerMappingState = "MAPPED" | "PROVIDER_ONLY" | "AMBIGUOUS" | "INVALID";

export interface TeamIdentityCandidate { provider: string; teamId: string; school: string; conference?: string | null; subdivision?: string | null }
export interface CfbdTeamIdentity { id?: string | number; school?: string; conference?: string; classification?: string }
export interface TeamMappingDecision { state: CfbdTeamMappingState; canonicalProvider: string | null; canonicalTeamId: string | null; reason: string }

/** Exact normalized school identity only; this intentionally is not fuzzy matching. */
export function normalizeNcaafSchoolIdentity(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[.'’]/g, "").replace(/\s+/g, " ");
}
export function decideCfbdTeamMapping(team: CfbdTeamIdentity, candidates: readonly TeamIdentityCandidate[]): TeamMappingDecision {
  if (team.id == null || !String(team.id).trim() || !team.school?.trim()) return { state: "INVALID", canonicalProvider: null, canonicalTeamId: null, reason: "CFBD team identity lacks stable ID or school" };
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [`${candidate.provider}:${candidate.teamId}`, candidate])).values()];
  const sameSchool = uniqueCandidates.filter((candidate) => normalizeNcaafSchoolIdentity(candidate.school) === normalizeNcaafSchoolIdentity(team.school!));
  const narrowed = sameSchool.filter((candidate) =>
    (!team.conference || !candidate.conference || normalizeNcaafSchoolIdentity(candidate.conference) === normalizeNcaafSchoolIdentity(team.conference))
    && (!team.classification || !candidate.subdivision || candidate.subdivision.toUpperCase() === team.classification.toUpperCase()));
  const matches = narrowed.length ? narrowed : sameSchool;
  if (!matches.length) return { state: "UNMAPPED", canonicalProvider: null, canonicalTeamId: null, reason: "No exact canonical school identity candidate" };
  if (matches.length !== 1) return { state: "AMBIGUOUS", canonicalProvider: null, canonicalTeamId: null, reason: "More than one exact canonical school identity candidate" };
  return { state: "MAPPED", canonicalProvider: matches[0]!.provider, canonicalTeamId: matches[0]!.teamId, reason: "Exact school identity with compatible supplied context" };
}

export interface GameIdentityCandidate { provider: string; eventId: string; homeTeamId: string; awayTeamId: string; kickoffAt: Date; neutralSite?: boolean | null }
export interface CfbdGameIdentity { id?: string | number; homeCanonicalTeamId?: string | null; awayCanonicalTeamId?: string | null; kickoffAt?: Date | null; neutralSite?: boolean | null }
export function decideCfbdGameMapping(game: CfbdGameIdentity, candidates: readonly GameIdentityCandidate[], toleranceMinutes = 90): { state: CfbdGameMappingState; canonicalProvider: string | null; canonicalEventId: string | null; reason: string } {
  if (game.id == null || !game.homeCanonicalTeamId || !game.awayCanonicalTeamId || !game.kickoffAt || !Number.isFinite(game.kickoffAt.getTime())) return { state: "INVALID", canonicalProvider: null, canonicalEventId: null, reason: "CFBD game lacks mapped ordered teams or valid kickoff" };
  const matches = candidates.filter((candidate) => candidate.homeTeamId === game.homeCanonicalTeamId
    && candidate.awayTeamId === game.awayCanonicalTeamId
    && (game.neutralSite == null || candidate.neutralSite == null || candidate.neutralSite === game.neutralSite)
    && Math.abs(candidate.kickoffAt.getTime() - game.kickoffAt!.getTime()) <= toleranceMinutes * 60_000);
  if (!matches.length) return { state: "UNMATCHED", canonicalProvider: null, canonicalEventId: null, reason: "No ordered mapped-team candidate within documented 90-minute kickoff tolerance" };
  if (matches.length !== 1) return { state: "AMBIGUOUS", canonicalProvider: null, canonicalEventId: null, reason: "Multiple ordered mapped-team candidates within kickoff tolerance" };
  return { state: "MAPPED", canonicalProvider: matches[0]!.provider, canonicalEventId: matches[0]!.eventId, reason: "Mapped ordered teams and unique kickoff candidate" };
}

export function providerOnlyPlayerMapping(player: { id?: string | number; name?: string; teamId?: string | number }): { state: CfbdPlayerMappingState; reason: string } {
  return player.id == null || !String(player.id).trim() ? { state: "INVALID", reason: "CFBD player response omitted stable player ID" }
    : { state: "PROVIDER_ONLY", reason: "No cross-provider player identity is inferred from name or roster position" };
}
export function cfbdIdentityHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}