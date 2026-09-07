import { createHash } from "node:crypto";

export const MLB_OFFICIAL_STATS_API = "MLB_STATS_API";
export const MLB_STARTER_EVIDENCE_224C_VERSION = "mlb-starter-evidence-224c-v3";
export const MLB_224C_RESEARCH_DISPOSITION = "RESEARCH_FAILED_NOT_COMPETITIVE";
export const MLB_224C_OOS_USE = "HISTORICAL_BENCHMARK_ONLY";

export const MLB_STARTER_EVIDENCE_STATES = [
  "CONFIRMED_PREGAME",
  "PROJECTED_PREGAME",
  "PROBABLE_PREGAME",
  "ACTUAL_ONLY",
  "UNKNOWN",
  "AMBIGUOUS",
  "MISSED_PREGAME_CAPTURE",
] as const;
export type StarterState = typeof MLB_STARTER_EVIDENCE_STATES[number];
export type IdentityState = "UNKNOWN" | "OFFICIAL_ID" | "AMBIGUOUS";
export type IdentityConfidence = "NONE" | "HIGH" | "AMBIGUOUS";

export interface OfficialMlbScheduleGame {
  gamePk?: number | string;
  gameDate?: string;
  teams?: {
    home?: { team?: { id?: number | string }; probablePitcher?: unknown };
    away?: { team?: { id?: number | string }; probablePitcher?: unknown };
  };
}
export interface OfficialMlbSchedule { dates?: Array<{ games?: OfficialMlbScheduleGame[] }> }

export interface StarterEvidenceRow {
  schemaVersion: string; provider: typeof MLB_OFFICIAL_STATS_API;
  sourceRecordId: string;
  officialGameId: string; officialTeamId: string; officialOpponentTeamId: string;
  officialPlayerId: string | null;
  tbmGameId: string | null; tbmTeamId: string | null; tbmPlayerId: string | null;
  teamSide: "HOME" | "AWAY"; scheduledFirstPitch: Date; featureCutoff: Date; observedAt: Date;
  sourceTimestamp: Date | null; effectiveAt: Date | null;
  starterState: StarterState; identityState: IdentityState; identityConfidence: IdentityConfidence;
  identityProvenance: Record<string, unknown>;
  starterName: string | null;
  metricsState: "IDENTITY_ONLY"; metricsThroughTime: Date | null;
  starterPitMetrics: Record<string, unknown>; daysRest: string | null;
  recentWorkload: Record<string, unknown>; sampleSizes: Record<string, unknown>;
  missingness: Record<string, unknown>;
  pitSafe: boolean; pitSafetyReason: string;
  reason: string;
  rawGamePayload: OfficialMlbScheduleGame; rawGamePayloadHash: string;
  evidenceStateHash: string; evidenceChecksum: string;
}

export interface StarterEvidenceRepository {
  /** Return starter-state hashes already committed for these official games. */
  existingStateHashes(gameIds: readonly string[]): Promise<ReadonlySet<string>>;
  append(rows: readonly StarterEvidenceRow[]): Promise<number>;
}
export interface OfficialMlbStatsClient {
  getSchedule(url: string): Promise<OfficialMlbSchedule>;
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
  return value;
};
export const deterministicChecksum = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");

/** Immutable ledger payload; callers insert this as a new research fact only. */
export function failed224CResearchDisposition(
  recordedAt: Date,
  artifactReferences: Record<string, unknown>,
) {
  const base = {
    experimentId: "MLB_224C", experimentVersion: "v3",
    disposition: MLB_224C_RESEARCH_DISPOSITION, oosUse: MLB_224C_OOS_USE,
    dispositionReason: "224C v3 failed the predeclared competitive research criteria",
    artifactReferences, recordedAt,
  };
  return { ...base, checksum: deterministicChecksum(base) };
}

export function officialScheduleUrl(date: string): string {
  return `https://statsapi.mlb.com/api/v1/schedule?sportId=1&gameType=R&date=${date}&hydrate=probablePitcher,team`;
}
const utcDate = (date: Date) => date.toISOString().slice(0, 10);

function starterFrom(raw: unknown): Pick<StarterEvidenceRow,
  "officialPlayerId" | "starterName" | "starterState" | "identityState" | "identityConfidence"> {
  if (raw === undefined || raw === null) {
    return { officialPlayerId: null, starterName: null, starterState: "UNKNOWN", identityState: "UNKNOWN", identityConfidence: "NONE" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { officialPlayerId: null, starterName: null, starterState: "AMBIGUOUS", identityState: "AMBIGUOUS", identityConfidence: "AMBIGUOUS" };
  }
  const pitcher = raw as { id?: string | number; fullName?: unknown };
  if (pitcher.id === undefined || pitcher.id === null || String(pitcher.id) === "") {
    return { officialPlayerId: null, starterName: typeof pitcher.fullName === "string" ? pitcher.fullName : null, starterState: "AMBIGUOUS", identityState: "AMBIGUOUS", identityConfidence: "AMBIGUOUS" };
  }
  return { officialPlayerId: String(pitcher.id), starterName: typeof pitcher.fullName === "string" ? pitcher.fullName : null, starterState: "PROBABLE_PREGAME", identityState: "OFFICIAL_ID", identityConfidence: "HIGH" };
}

/** Maps an official, prospective schedule payload into two immutable team slots. */
export function buildStarterEvidence(
  game: OfficialMlbScheduleGame, observedAt: Date,
): StarterEvidenceRow[] {
  const gameId = game.gamePk === undefined ? null : String(game.gamePk);
  const scheduledFirstPitch = game.gameDate ? new Date(game.gameDate) : null;
  if (!gameId || !scheduledFirstPitch || Number.isNaN(scheduledFirstPitch.getTime())) return [];
  // This strict inequality is the PIT boundary. A response at/after first pitch
  // (including a retrospective response) is not evidence and is never PIT-safe.
  if (!(observedAt < scheduledFirstPitch)) return [];
  const payloadHash = deterministicChecksum(game);
  const evidenceStateHash = deterministicChecksum({
    gamePk: game.gamePk,
    gameDate: game.gameDate,
    teams: {
      home: {
        teamId: game.teams?.home?.team?.id ?? null,
        probablePitcher: game.teams?.home?.probablePitcher ?? null,
      },
      away: {
        teamId: game.teams?.away?.team?.id ?? null,
        probablePitcher: game.teams?.away?.probablePitcher ?? null,
      },
    },
  });
  const side = (
    teamSide: "HOME" | "AWAY",
    rawTeam: NonNullable<OfficialMlbScheduleGame["teams"]>["home"] | undefined,
  ): StarterEvidenceRow | null => {
    const team = rawTeam as { team?: { id?: string | number }; probablePitcher?: unknown } | undefined;
    if (team?.team?.id === undefined || team.team.id === null) return null;
    const opponent = teamSide === "HOME" ? game.teams?.away?.team?.id : game.teams?.home?.team?.id;
    if (opponent === undefined || opponent === null) return null;
    const starter = starterFrom(team.probablePitcher); // never read startingPitcher/boxscore actuality
    const base: Omit<StarterEvidenceRow, "evidenceChecksum"> = {
      schemaVersion: MLB_STARTER_EVIDENCE_224C_VERSION, provider: MLB_OFFICIAL_STATS_API,
      sourceRecordId: `${gameId}:${String(team.team.id)}:${teamSide}`,
      officialGameId: gameId, officialTeamId: String(team.team.id),
      officialOpponentTeamId: String(opponent), teamSide,
      tbmGameId: null, tbmTeamId: null, tbmPlayerId: null,
      scheduledFirstPitch, featureCutoff: scheduledFirstPitch, observedAt, ...starter,
      sourceTimestamp: null, effectiveAt: null,
      identityProvenance: {
        strategy: "OFFICIAL_STABLE_IDS",
        mlbGameId: gameId,
        mlbTeamId: String(team.team.id),
        mlbPlayerId: starter.officialPlayerId,
        nameOnly: false,
        tbmBridgeState: "NOT_ATTEMPTED",
      },
      metricsState: "IDENTITY_ONLY", metricsThroughTime: null,
      starterPitMetrics: {}, daysRest: null, recentWorkload: {}, sampleSizes: {},
      missingness: { starterPitMetrics: true, daysRest: true, recentWorkload: true },
      pitSafe: true,
      pitSafetyReason: "PROSPECTIVE_OFFICIAL_SCHEDULE_OBSERVED_STRICTLY_BEFORE_SCHEDULED_FIRST_PITCH",
      reason: starter.starterState === "UNKNOWN"
        ? "OFFICIAL_SCHEDULE_HAS_NO_PROBABLE_PITCHER_AT_OBSERVATION"
        : starter.starterState === "AMBIGUOUS"
          ? "OFFICIAL_SCHEDULE_PITCHER_IDENTITY_MALFORMED"
          : "OFFICIAL_SCHEDULE_PROBABLE_PITCHER",
      rawGamePayload: game, rawGamePayloadHash: payloadHash, evidenceStateHash,
    };
    return { ...base, evidenceChecksum: deterministicChecksum(base) };
  };
  return [side("HOME", game.teams?.home), side("AWAY", game.teams?.away)]
    .filter((row): row is StarterEvidenceRow => row !== null);
}

export function verifyStarterEvidenceRow(row: StarterEvidenceRow): boolean {
  const rebuilt = buildStarterEvidence(row.rawGamePayload, row.observedAt)
    .find((candidate) => candidate.sourceRecordId === row.sourceRecordId);
  return deterministicChecksum(row.rawGamePayload) === row.rawGamePayloadHash
    && rebuilt?.evidenceStateHash === row.evidenceStateHash
    && rebuilt?.evidenceChecksum === row.evidenceChecksum;
}

/** Manual/development collector; it has no scheduler or production registration. */
export async function collectProspectiveOfficialMlbStarterEvidence(
  date: string, dependencies: {
    client: OfficialMlbStatsClient;
    repository: StarterEvidenceRepository;
    now?: Date;
    clock?: () => Date;
  },
): Promise<{ requestedDate: string; inserted: number; skippedUnchangedGames: number; skippedAfterCutoffGames: number }> {
  const clock = dependencies.clock ?? (() => dependencies.now ?? new Date());
  const requestStartedAt = clock();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < utcDate(requestStartedAt)) {
    throw new Error("Starter evidence collector accepts current/future UTC dates only; historical schedule responses are not PIT-safe");
  }
  const schedule = await dependencies.client.getSchedule(officialScheduleUrl(date)); // exactly one call/date
  // observedAt is response-receipt time, never request-start time. A slow
  // response that crosses first pitch therefore fails the strict PIT cutoff.
  const observedAt = clock();
  const games = (schedule.dates ?? []).flatMap((bucket) => bucket.games ?? []);
  const candidate = games.flatMap((game) => buildStarterEvidence(game, observedAt));
  if (!candidate.every(verifyStarterEvidenceRow)) {
    throw new Error("Refusing to append starter evidence with an invalid raw, state, or evidence checksum");
  }
  const candidateGameIds = [...new Set(candidate.map((row) => row.officialGameId))];
  const known = await dependencies.repository.existingStateHashes(candidateGameIds);
  const fresh = candidate.filter((row) => !known.has(`${row.officialGameId}:${row.evidenceStateHash}`));
  // State identity is game-scoped: a changed probable starter appends both
  // slots coherently, while unrelated status/score payload changes are no-ops.
  const inserted = await dependencies.repository.append(fresh);
  const validGameIds = new Set(candidate.map((row) => row.officialGameId));
  return {
    requestedDate: date, inserted,
    skippedUnchangedGames: candidateGameIds.filter((id) => candidate.filter((r) => r.officialGameId === id).every((r) => known.has(`${id}:${r.evidenceStateHash}`))).length,
    skippedAfterCutoffGames: games.filter((game) => !validGameIds.has(String(game.gamePk))).length,
  };
}