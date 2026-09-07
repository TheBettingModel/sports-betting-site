import type { HistoricalGameSourceRow } from "./mlbHistoricalSource";

export type HistoricalQuarantineReason =
  | "INVALID_PROVIDER_GAME_ID"
  | "INVALID_TEAM_ID"
  | "DUPLICATE_PROVIDER_GAME_ID"
  | "SAME_TEAM"
  | "INVALID_FIRST_PITCH"
  | "UNFINISHED_GAME"
  | "MISSING_SCORE"
  | "UNSUPPORTED_GAME_TYPE"
  | "AMBIGUOUS_CHRONOLOGY";

export interface CanonicalHistoricalGame {
  canonicalGameId: string;
  source: HistoricalGameSourceRow;
  homeCanonicalTeamId: string;
  awayCanonicalTeamId: string;
  outcomeEligible: boolean;
}

export interface HistoricalIdentityResult {
  admitted: CanonicalHistoricalGame[];
  quarantined: { providerGameId: string; reasons: HistoricalQuarantineReason[] }[];
  duplicateSourceRows: number;
}

const SUPPORTED_GAME_TYPES = new Set(["R", "F", "D", "L", "W"]);

export function canonicalMlbTeamId(providerTeamId: string): string | null {
  return /^\d+$/.test(providerTeamId) ? `mlb-team:${providerTeamId}` : null;
}

export function canonicalMlbGameId(providerGameId: string): string | null {
  return /^\d+$/.test(providerGameId) ? `mlb-game:${providerGameId}` : null;
}

/** Exact provider IDs only. No names or abbreviations participate in identity. */
export function resolveHistoricalMlbIdentities(
  rows: readonly HistoricalGameSourceRow[],
): HistoricalIdentityResult {
  const admitted: CanonicalHistoricalGame[] = [];
  const quarantined: HistoricalIdentityResult["quarantined"] = [];
  const grouped = new Map<string, HistoricalGameSourceRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.providerGameId) ?? [];
    group.push(row);
    grouped.set(row.providerGameId, group);
  }
  let duplicateSourceRows = 0;
  const orderedGroups = [...grouped.values()].sort((a, b) =>
    a[0]!.scheduledFirstPitch.localeCompare(b[0]!.scheduledFirstPitch)
    || a[0]!.providerGameId.localeCompare(b[0]!.providerGameId));
  for (const group of orderedGroups) {
    duplicateSourceRows += Math.max(0, group.length - 1);
    const payloadHashes = new Set(group.map((row) => row.payloadHash));
    if (group.length > 1 && payloadHashes.size > 1) {
      quarantined.push({
        providerGameId: group[0]!.providerGameId,
        reasons: ["DUPLICATE_PROVIDER_GAME_ID"],
      });
      continue;
    }
    const source = group[0]!;
    const reasons: HistoricalQuarantineReason[] = [];
    const gameId = canonicalMlbGameId(source.providerGameId);
    const home = canonicalMlbTeamId(source.home.providerTeamId);
    const away = canonicalMlbTeamId(source.away.providerTeamId);
    if (!gameId) reasons.push("INVALID_PROVIDER_GAME_ID");
    if (!home || !away) reasons.push("INVALID_TEAM_ID");
    if (home && away && home === away) reasons.push("SAME_TEAM");
    if (!Number.isFinite(new Date(source.scheduledFirstPitch).getTime())) reasons.push("INVALID_FIRST_PITCH");
    if (!SUPPORTED_GAME_TYPES.has(source.gameType)) reasons.push("UNSUPPORTED_GAME_TYPE");
    const final = source.abstractStatus === "Final" || /final|completed/i.test(source.detailedStatus);
    if (!final) reasons.push("UNFINISHED_GAME");
    if (source.homeRuns === null || source.awayRuns === null) reasons.push("MISSING_SCORE");
    if (source.chronologyState === "AMBIGUOUS") reasons.push("AMBIGUOUS_CHRONOLOGY");
    if (reasons.length || !gameId || !home || !away) {
      quarantined.push({ providerGameId: source.providerGameId, reasons });
      continue;
    }
    admitted.push({
      canonicalGameId: gameId,
      source,
      homeCanonicalTeamId: home,
      awayCanonicalTeamId: away,
      outcomeEligible: true,
    });
  }
  return { admitted, quarantined, duplicateSourceRows };
}