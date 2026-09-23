import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lt, lte } from "drizzle-orm";
import {
  db,
  ncaafEntityObservationsTable,
  NCAAF_EVIDENCE_SCHEMA_VERSION,
  ncaafEvidenceRunsTable,
  ncaafGameEvidenceTable,
  ncaafMarketObservationsTable,
  ncaafTeamGamePerformanceTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { processInBatches } from "./schedulerRuntime";
import { fetchSportGamesByDate, type FetchedGame } from "./espn";
import { fetchCurrentNcaafEvidenceOdds, type OddsApiGame } from "./oddsApi";
import { normalizeEspnScoreboardPerformance } from "./ncaafFootballIntelligence";
import {
  fetchEspnNcaafSummary,
  type NcaafEspnSummaryPayload,
} from "./espnNcaafSummary";

export const MAX_NCAAF_BACKFILL_DAYS = 31;
const UNAVAILABLE_BOOKMAKER_ID = "__unavailable__";
/** A crashed worker must not make a ledger run appear active indefinitely. */
export const NCAAF_EVIDENCE_RUN_STALE_AFTER_MS = 30 * 60_000;
const NCAAF_MARKET_KICKOFF_TOLERANCE_MS = 6 * 60 * 60_000;
const ncaafCaptureFlights = new Map<string, Promise<unknown>>();

export interface MissingEvidence {
  fields: string[];
  reasons: Record<string, string>;
}

export interface NormalizedMarketEvidence {
  provider: "odds_api";
  providerEventId: string;
  bookmakerProviderId: string;
  bookmakerName: string | null;
  marketKey: string;
  selection: string;
  price: number | null;
  line: number | null;
  observationPhase: "current" | "opening" | "closing" | "unavailable";
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  missing: MissingEvidence;
  payload: unknown;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

export function stablePayloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

/** Mirrors the ledger's unique provider/event/payload constraint for callers
 * that need to de-duplicate a batch before handing it to PostgreSQL. */
export function evidenceIdempotencyKey(
  provider: string,
  providerEventId: string,
  payload: unknown,
  schemaVersion = NCAAF_EVIDENCE_SCHEMA_VERSION,
): string {
  return `${schemaVersion}:${provider}:${providerEventId}:${stablePayloadHash(payload)}`;
}

export function ncaafSeasonForDate(value: Date | string): number {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T12:00:00Z`) : value;
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid NCAAF evidence date");
  return date.getUTCMonth() + 1 >= 8 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

/** NCAAF seasons run Aug 1 through Jul 31; prevents a January bowl from being
 * accidentally queried as the following fall's season. */
export function isWithinNcaafSeason(value: Date | string, season: number): boolean {
  return ncaafSeasonForDate(value) === season;
}

export function normalizeOddsApiMarkets(game: OddsApiGame): NormalizedMarketEvidence[] {
  const result: NormalizedMarketEvidence[] = [];
  for (const book of game.bookmakers ?? []) {
    for (const market of book.markets ?? []) {
      for (const outcome of market.outcomes ?? []) {
        const invalidPrice = !Number.isFinite(outcome.price);
        const invalidPoint = outcome.point !== undefined && !Number.isFinite(outcome.point);
        const fields = [
          ...(invalidPrice ? ["price"] : []),
          ...(invalidPoint ? ["line"] : []),
        ];
        result.push({
          provider: "odds_api",
          providerEventId: game.id,
          bookmakerProviderId: book.key?.trim() || "__unknown__",
          bookmakerName: book.title ?? null,
          marketKey: market.key,
          selection: outcome.name,
          price: invalidPrice ? null : outcome.price,
          line: invalidPoint || outcome.point === undefined ? null : outcome.point,
          observationPhase: "current",
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          commenceTime: game.commence_time,
          missing: {
            fields,
            reasons: Object.fromEntries(fields.map((field) => [field, "provider omitted or supplied a non-finite value"])),
          },
          payload: { event: game, bookmaker: book.key, market: market.key, outcome },
        });
      }
    }
  }
  return result;
}

const unavailablePlayerRoster: MissingEvidence = {
  fields: ["players", "roster", "injuries", "starter_probability"],
  reasons: {
    players: "ESPN scoreboard endpoint does not provide historical player evidence",
    roster: "ESPN scoreboard endpoint does not provide historical roster evidence",
    injuries: "No historical injury provider is configured",
    starter_probability: "No historical starter-probability provider is configured",
  },
};

export function normalizeEspnGameEvidence(game: FetchedGame, capturedAt: Date, modeledAsOf: Date) {
  const season = ncaafSeasonForDate(game.gameDate);
  const fields: string[] = [];
  const reasons: Record<string, string> = {};
  const absent = (field: string, value: unknown, reason: string) => {
    if (value == null) { fields.push(field); reasons[field] = reason; }
  };
  absent("week", game.week, "scoreboard response did not expose week");
  absent("venue", game.venueId ?? game.venueName, "scoreboard response did not expose venue");
  absent("weather", undefined, "scoreboard endpoint does not expose weather");
  absent("home_conference", game.homeConferenceId, "scoreboard response did not expose home conference");
  absent("away_conference", game.awayConferenceId, "scoreboard response did not expose away conference");
  const missing = { fields, reasons };
  return {
    provider: "espn" as const, providerEventId: game.espnId, capturedAt, modeledAsOf, season,
    kickoffAt: new Date(game.commenceTimeISO), week: game.week ?? null, neutralSite: game.neutralSite ?? null,
    venueId: game.venueId ?? null, homeConferenceId: game.homeConferenceId ?? null,
    awayConferenceId: game.awayConferenceId ?? null, homeHalftimeScore: game.homeHalftimeScore ?? null,
    awayHalftimeScore: game.awayHalftimeScore ?? null, isOvertime: game.isOvertime ?? null,
    gameStatus: game.status, homeScore: game.homeScore ?? null, awayScore: game.awayScore ?? null,
    payload: game, missing,
  };
}

export interface EvidenceCaptureDependencies {
  database?: typeof db;
  fetchEspnByDate?: (yyyymmdd: string) => Promise<FetchedGame[]>;
  fetchOdds?: () => Promise<OddsApiGame[]>;
  fetchEspnSummary?: (eventId: string) => Promise<NcaafEspnSummaryPayload>;
  now?: () => Date;
  /** Normal game-day capture must not fan out into tomorrow or later dates. */
  restrictToRequestedDate?: boolean;
}

function easternDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date).replaceAll("-", "");
}

function requestedCalendarDate(value: Date | string): string {
  if (typeof value === "string") {
    const compact = value.replaceAll("-", "");
    if (!/^\d{8}$/.test(compact)) throw new Error("NCAAF evidence date must be YYYY-MM-DD or YYYYMMDD");
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }
  const compact = easternDateString(value);
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

export function ncaafBackfillCalendarDates(from: Date, to: Date): string[] {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  const days = Math.floor((end - start) / 86_400_000) + 1;
  if (days < 1 || days > MAX_NCAAF_BACKFILL_DAYS) {
    throw new Error(`NCAAF evidence backfill must be 1-${MAX_NCAAF_BACKFILL_DAYS} days`);
  }
  return Array.from({ length: days }, (_, offset) =>
    new Date(start + offset * 86_400_000).toISOString().slice(0, 10));
}

function safeProviderDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function selectCurrentNcaafOddsForCapture(
  games: OddsApiGame[],
  season: number,
): OddsApiGame[] {
  return games.filter((game) => {
    const providerDate = safeProviderDate(game.commence_time);
    return providerDate != null && isWithinNcaafSeason(providerDate, season);
  });
}

export function restrictNcaafOddsToRequestedDate(
  games: OddsApiGame[],
  yyyymmdd: string,
): OddsApiGame[] {
  return games.filter((game) => {
    const providerDate = safeProviderDate(game.commence_time);
    return providerDate != null && easternDateString(providerDate) === yyyymmdd;
  });
}

function normalizedTeamIdentity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** These are explicit, one-to-one provider naming aliases, not fuzzy matching. */
const TEAM_IDENTITY_ALIASES: Readonly<Record<string, string>> = {
  olemiss: "mississippirebels",
  uconn: "connecticuthuskies",
  smu: "southernmethodistmustangs",
  unlv: "nevadalvrebels",
};

function canonicalTeamIdentity(value: string): string {
  const normalized = normalizedTeamIdentity(value);
  return TEAM_IDENTITY_ALIASES[normalized] ?? normalized;
}

export interface MarketIdentityMatch {
  game: FetchedGame | null;
  status: "matched_exact" | "matched_alias" | "unmatched_invalid_kickoff" | "unmatched_identity" | "unmatched_kickoff" | "unmatched_ambiguous";
  reason: string;
}

/** Match only an ordered, normalized team identity with a plausible kickoff.
 * A non-unique candidate is intentionally retained as unmatched. */
export function matchNcaafMarketIdentity(
  market: Pick<OddsApiGame, "home_team" | "away_team" | "commence_time">,
  games: readonly FetchedGame[],
): MarketIdentityMatch {
  const marketKickoff = safeProviderDate(market.commence_time);
  if (!marketKickoff) return { game: null, status: "unmatched_invalid_kickoff", reason: "provider event has an invalid kickoff timestamp" };
  const exactHome = normalizedTeamIdentity(market.home_team);
  const exactAway = normalizedTeamIdentity(market.away_team);
  const home = canonicalTeamIdentity(market.home_team);
  const away = canonicalTeamIdentity(market.away_team);
  const candidates = games.filter((game) =>
    canonicalTeamIdentity(game.homeTeamName) === home &&
    canonicalTeamIdentity(game.awayTeamName) === away);
  if (candidates.length === 0) return { game: null, status: "unmatched_identity", reason: "no exact normalized or known-alias home/away identity" };
  const timeCandidates = candidates.filter((game) => {
    const kickoff = safeProviderDate(game.commenceTimeISO);
    return kickoff !== null && Math.abs(kickoff.getTime() - marketKickoff.getTime()) <= NCAAF_MARKET_KICKOFF_TOLERANCE_MS;
  });
  if (timeCandidates.length === 0) return { game: null, status: "unmatched_kickoff", reason: "matching team identity did not have a kickoff within six hours" };
  if (timeCandidates.length !== 1) return { game: null, status: "unmatched_ambiguous", reason: "multiple games share the same identity and kickoff window" };
  const game = timeCandidates[0]!;
  const exact = normalizedTeamIdentity(game.homeTeamName) === exactHome &&
    normalizedTeamIdentity(game.awayTeamName) === exactAway;
  return { game, status: exact ? "matched_exact" : "matched_alias", reason: exact ? "exact normalized home/away identity and kickoff" : "known unambiguous team alias and kickoff" };
}

export interface EvidenceCaptureResult {
  runId?: number;
  games: number;
  markets: number;
  matchedMarkets: number;
  missingEntityObservations: number;
  teamPerformanceRows: number;
  skippedTeamPerformanceRows: number;
  providerErrors: Record<string, string>;
}

export async function reconcileStaleNcaafEvidenceRuns(
  database: typeof db,
  now: Date,
  staleAfterMs = NCAAF_EVIDENCE_RUN_STALE_AFTER_MS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const staleRuns = await database.select({
    id: ncaafEvidenceRunsTable.id,
    coverage: ncaafEvidenceRunsTable.coverage,
    errorDetails: ncaafEvidenceRunsTable.errorDetails,
    statusHistory: ncaafEvidenceRunsTable.statusHistory,
  }).from(ncaafEvidenceRunsTable).where(and(
    eq(ncaafEvidenceRunsTable.status, "running"),
    lt(ncaafEvidenceRunsTable.capturedAt, cutoff),
  ));
  for (const stale of staleRuns) {
    const reason = {
      code: "stale_running_reconciled",
      message: `Run exceeded ${staleAfterMs}ms without finalization`,
      reconciledAt: now.toISOString(),
    };
    const history = Array.isArray(stale.statusHistory) ? stale.statusHistory : [];
    await database.update(ncaafEvidenceRunsTable).set({
      status: "failed",
      completedAt: now,
      coverage: { ...(stale.coverage as Record<string, unknown> ?? {}), partialReasons: [reason] },
      errorDetails: { previous: stale.errorDetails, reconciliation: reason },
      statusHistory: [...history, { status: "failed", ...reason }],
    // A worker can finish between the stale read and this update.  Never
    // replace its terminal outcome with a reconciliation failure.
    }).where(and(
      eq(ncaafEvidenceRunsTable.id, stale.id),
      eq(ncaafEvidenceRunsTable.status, "running"),
    ));
  }
  return staleRuns.length;
}

/**
 * Finalization is the lifecycle boundary for a durable evidence run. Retry a
 * transient database failure before allowing the caller to surface it; stale
 * reconciliation remains the last-resort recovery for process termination.
 */
export async function finalizeNcaafEvidenceRun(
  finalize: () => Promise<unknown>,
  attempts = 3,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    try {
      await finalize();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** Captures a single date without changing canonical games, predictions, picks,
 * grading, or ROI. Providers can fail independently and that failure is recorded
 * in the durable run coverage. */
async function captureNcaafEvidenceDateUnsafe(
  date: Date | string,
  dependencies: EvidenceCaptureDependencies = {},
): Promise<EvidenceCaptureResult> {
  const database = dependencies.database ?? db;
  const now = dependencies.now?.() ?? new Date();
  const requestedDate = requestedCalendarDate(date);
  const yyyymmdd = requestedDate.replaceAll("-", "");
  await reconcileStaleNcaafEvidenceRuns(database, now);
  // The requested date is intentionally not the execution identity. A fixed
  // scheduler/test clock can legitimately start consecutive captures; each
  // must own its own lifecycle row and terminal transition.
  const runKey = `${NCAAF_EVIDENCE_SCHEMA_VERSION}:${requestedDate}:${now.toISOString()}:${randomUUID()}`;
  let [run] = await database.insert(ncaafEvidenceRunsTable).values({
    runKey, requestedFrom: requestedDate, requestedTo: requestedDate, capturedAt: now,
    status: "running", providers: ["espn", "odds_api"],
    statusHistory: [{ status: "running", reason: "capture_started", at: now.toISOString() }],
  }).onConflictDoNothing().returning({ id: ncaafEvidenceRunsTable.id });
  run ??= (await database.select({ id: ncaafEvidenceRunsTable.id })
    .from(ncaafEvidenceRunsTable)
    .where(eq(ncaafEvidenceRunsTable.runKey, runKey))
    .limit(1))[0];
  if (!run) throw new Error(`Unable to create or resume NCAAF evidence run ${runKey}`);
  try {
  const providerErrors: Record<string, string> = {};
  const isHistoricalRequest = requestedDate < easternDateString(now).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  const [requestedEspnResult, oddsResult] = await Promise.allSettled([
    (dependencies.fetchEspnByDate ?? ((d) => fetchSportGamesByDate("NCAAF", d, { throwOnError: true })))(yyyymmdd),
    isHistoricalRequest ? Promise.resolve([] as OddsApiGame[]) : (dependencies.fetchOdds ?? fetchCurrentNcaafEvidenceOdds)(),
  ]);
  const requestedSeason = ncaafSeasonForDate(requestedDate);
  const oddsGames = oddsResult.status === "fulfilled"
    ? (dependencies.restrictToRequestedDate
      ? restrictNcaafOddsToRequestedDate(
        selectCurrentNcaafOddsForCapture(oddsResult.value, requestedSeason),
        yyyymmdd,
      )
      : selectCurrentNcaafOddsForCapture(oddsResult.value, requestedSeason))
    : [];
  const espnGamesById = new Map<string, FetchedGame>();
  if (requestedEspnResult.status === "fulfilled") {
    for (const game of requestedEspnResult.value) espnGamesById.set(game.espnId, game);
  } else {
    providerErrors.espn = String(requestedEspnResult.reason);
  }
  if (oddsResult.status === "rejected") providerErrors.odds_api = String(oddsResult.reason);
  if (!isHistoricalRequest && oddsGames.length > 0) {
    const fetchEspn = dependencies.fetchEspnByDate
      ?? ((d: string) => fetchSportGamesByDate("NCAAF", d, { throwOnError: true }));
    const additionalDates = [...new Set(oddsGames.map((game) => {
      const providerDate = safeProviderDate(game.commence_time)!;
      return easternDateString(providerDate);
    }))].filter((dateKey) => dateKey !== yyyymmdd);
    // Provider schedules can span many future dates. Keep only a small number
    // of response payloads live at once instead of retaining the entire season
    // fan-out until Promise.allSettled completes.
    await processInBatches(additionalDates, 4, async (dateBatch) => {
      const additionalResults = await Promise.allSettled(
        dateBatch.map(async (dateKey) => ({
          dateKey,
          games: await fetchEspn(dateKey),
        })),
      );
      for (let index = 0; index < additionalResults.length; index++) {
        const result = additionalResults[index]!;
        const dateKey = dateBatch[index]!;
        if (result.status === "fulfilled") {
          for (const game of result.value.games) espnGamesById.set(game.espnId, game);
        } else {
          providerErrors[`espn:${dateKey}`] = String(result.reason);
        }
      }
    });
  }
  const espnGames = [...espnGamesById.values()];
  const completedSummaries = new Map<string, NcaafEspnSummaryPayload>();
  await processInBatches(espnGames.filter((game) => game.status === "final"), 4, async (batch) => {
    const results = await Promise.allSettled(batch.map((game) =>
      (dependencies.fetchEspnSummary ?? fetchEspnNcaafSummary)(game.espnId)));
    results.forEach((result, index) => {
      const game = batch[index]!;
      if (result.status === "fulfilled") completedSummaries.set(game.espnId, result.value);
      else providerErrors[`espn_summary:${game.espnId}`] = String(result.reason);
    });
  });
  const gameEvidenceIds = new Map<string, number>();
  let markets = 0; let matchedMarkets = 0; let missingEntityObservations = 0;
  let teamPerformanceRows = 0; let skippedTeamPerformanceRows = 0;

  for (const game of espnGames) {
    const evidence = normalizeEspnGameEvidence(game, now, now);
    const [inserted] = await database.insert(ncaafGameEvidenceTable).values({
      runId: run?.id, provider: evidence.provider, providerEventId: evidence.providerEventId,
      capturedAt: now, modeledAsOf: now, season: evidence.season, kickoffAt: evidence.kickoffAt,
      week: game.week ?? null, gameStatus: game.status, homeScore: game.homeScore ?? null, awayScore: game.awayScore ?? null,
      homeHalftimeScore: game.homeHalftimeScore ?? null, awayHalftimeScore: game.awayHalftimeScore ?? null,
      isOvertime: game.isOvertime ?? null, venueId: game.venueId ?? null, venueName: game.venueName ?? null,
      venueCity: game.venueCity ?? null, venueState: game.venueState ?? null, venueCountry: game.venueCountry ?? null,
      venueIndoor: game.venueIndoor ?? null, homeConferenceId: game.homeConferenceId ?? null,
      awayConferenceId: game.awayConferenceId ?? null, homeProviderTeamId: game.homeTeamId ?? null, awayProviderTeamId: game.awayTeamId ?? null,
      homeTeamName: game.homeTeamName, awayTeamName: game.awayTeamName, neutralSite: game.neutralSite ?? null,
      missingFields: evidence.missing.fields, missingReasons: evidence.missing.reasons,
      payload: evidence.payload, payloadHash: stablePayloadHash(evidence.payload),
    }).onConflictDoNothing().returning({ id: ncaafGameEvidenceTable.id });
    const gameEvidenceId = inserted?.id ?? (await database.select({ id: ncaafGameEvidenceTable.id })
      .from(ncaafGameEvidenceTable).where(and(
        eq(ncaafGameEvidenceTable.provider, "espn"), eq(ncaafGameEvidenceTable.providerEventId, game.espnId),
        eq(ncaafGameEvidenceTable.payloadHash, stablePayloadHash(evidence.payload)),
      )).limit(1))[0]?.id;
    if (gameEvidenceId != null) gameEvidenceIds.set(game.espnId, gameEvidenceId);
    const summary = completedSummaries.get(game.espnId);
    for (const performance of normalizeEspnScoreboardPerformance(game, now)) {
      if (!performance.providerTeamId || !performance.providerOpponentTeamId) {
        skippedTeamPerformanceRows++;
        continue;
      }
      const summaryTeam = summary?.teams.find((team) => team.providerTeamId === performance.providerTeamId);
      const teamDrives = summary?.drives.filter((drive) => drive.providerTeamId === performance.providerTeamId) ?? [];
      const teamPlayers = summary?.players.filter((player) => player.providerTeamId === performance.providerTeamId) ?? [];
      const summaryMissing = summaryTeam
        ? summaryTeam.missingReasons
        : summary ? { teamSummary: "ESPN summary did not contain the matched provider team" } : {};
      const insertedPerformance = await database.insert(ncaafTeamGamePerformanceTable).values({
        schemaVersion: "ncaaf-team-game-performance-v1",
        provider: performance.provider,
        providerEventId: performance.providerEventId,
        providerTeamId: performance.providerTeamId,
        providerOpponentTeamId: performance.providerOpponentTeamId,
        season: performance.season,
        week: performance.week,
        kickoffAt: performance.kickoffAt,
        teamLocation: performance.teamLocation,
        competitionClassification: performance.competitionClassification,
        pointsFor: performance.pointsFor,
        pointsAgainst: performance.pointsAgainst,
        halftimePointsFor: performance.halftimePointsFor,
        halftimePointsAgainst: performance.halftimePointsAgainst,
        overtimePeriods: performance.overtimePeriods,
        possessions: summary ? teamDrives.length || null : performance.possessions,
        offensivePlays: summaryTeam?.totalPlays ?? performance.offensivePlays,
        yardsFor: summaryTeam?.totalYards ?? performance.yardsFor,
        yardsAgainst: performance.yardsAgainst,
        turnoversCommitted: summaryTeam?.turnovers ?? performance.turnoversCommitted,
        turnoversForced: performance.turnoversForced,
        penalties: summaryTeam?.penalties.made ?? performance.penalties,
        penaltyYards: summaryTeam?.penalties.attempted ?? performance.penaltyYards,
        timeOfPossessionSeconds: summaryTeam?.possessionSeconds ?? performance.timeOfPossessionSeconds,
        fieldGoalAttempts: performance.fieldGoalAttempts,
        fieldGoalsMade: performance.fieldGoalsMade,
        rawSummaryEvidence: summary ?? null,
        rawTeamStatisticsEvidence: summaryTeam ?? null,
        rawDriveEvidence: teamDrives,
        rawPlayerEvidence: teamPlayers,
        derivedMetrics: performance.derivedMetrics,
        quality: summaryTeam ? 1 : performance.quality,
        reliability: summaryTeam ? 0.9 : performance.reliability,
        missingFields: [...performance.missingFields, ...Object.keys(summaryMissing)],
        missingReasons: { ...performance.missingReasons, ...summaryMissing },
        providerObservedAt: now,
        capturedAt: now,
        payloadHash: summary?.payloadHash ?? performance.payloadHash,
        provenance: {
          ...performance.provenance,
          summaryEndpoint: summary?.sourceEndpoint ?? null,
          summaryProviderEventId: summary?.providerEventId ?? null,
          summaryCaptured: Boolean(summary),
          summaryMarketFieldsExcluded: true,
        },
      }).onConflictDoNothing().returning({ id: ncaafTeamGamePerformanceTable.id });
      if (insertedPerformance.length > 0) teamPerformanceRows++;
    }
    const teams = [
      {
        id: game.homeTeamId ?? `unmapped:home:${game.espnId}`,
        side: "home",
        name: game.homeTeamName,
        conferenceId: game.homeConferenceId ?? null,
        record: game.homeTeamRecordAvailable === false ? null : game.homeTeamRecord,
        recordAvailable: game.homeTeamRecordAvailable !== false,
      },
      {
        id: game.awayTeamId ?? `unmapped:away:${game.espnId}`,
        side: "away",
        name: game.awayTeamName,
        conferenceId: game.awayConferenceId ?? null,
        record: game.awayTeamRecordAvailable === false ? null : game.awayTeamRecord,
        recordAvailable: game.awayTeamRecordAvailable !== false,
      },
    ];
    for (const team of teams) for (const observationType of ["team_season", "player", "roster"] as const) {
      const unsupported = observationType !== "team_season";
      const payload = unsupported ? { provider: "espn", unsupported: observationType, team } : team;
      const teamSeasonMissing: MissingEvidence = {
        fields: [
          ...(!team.recordAvailable ? ["record"] : []),
          "offensive_efficiency",
          "defensive_efficiency",
          "special_teams",
          "pace",
        ],
        reasons: {
          ...(!team.recordAvailable
            ? { record: "ESPN scoreboard omitted the current record; display fallback was not persisted as evidence" }
            : {}),
          offensive_efficiency: "ESPN scoreboard endpoint does not provide team efficiency evidence",
          defensive_efficiency: "ESPN scoreboard endpoint does not provide team efficiency evidence",
          special_teams: "ESPN scoreboard endpoint does not provide special-teams evidence",
          pace: "ESPN scoreboard endpoint does not provide pace evidence",
        },
      };
      const missing = unsupported ? unavailablePlayerRoster : teamSeasonMissing;
      await database.insert(ncaafEntityObservationsTable).values({
        runId: run?.id, gameEvidenceId: gameEvidenceId ?? null, provider: "espn",
        providerEntityId: team.id, entityType: observationType, observationType,
        season: evidence.season, capturedAt: now, modeledAsOf: now,
        missingFields: missing.fields, missingReasons: missing.reasons,
        payload, payloadHash: stablePayloadHash(payload),
      }).onConflictDoNothing();
      if (unsupported) missingEntityObservations++;
    }
    {
      const observationType = "context";
      await database.insert(ncaafEntityObservationsTable).values({
        runId: run?.id, gameEvidenceId: gameEvidenceId ?? null, provider: "espn",
        providerEntityId: game.espnId, entityType: observationType, observationType,
        season: evidence.season, capturedAt: now, modeledAsOf: now,
        missingFields: evidence.missing.fields, missingReasons: evidence.missing.reasons,
        payload: game, payloadHash: stablePayloadHash(game),
      }).onConflictDoNothing();
    }
    // The Odds API endpoint is current-only. A historical run must say so
    // explicitly instead of attaching today's market or inventing a zero line.
    if (isHistoricalRequest) {
      const payload = { provider: "odds_api", unsupported: "historical_current_market" };
      await database.insert(ncaafMarketObservationsTable).values({
        runId: run?.id, gameEvidenceId: gameEvidenceId ?? null, provider: "odds_api",
        providerEventId: game.espnId, bookmakerProviderId: UNAVAILABLE_BOOKMAKER_ID, bookmakerName: null,
        marketKey: "all", selection: "unavailable", price: null, line: null, observationPhase: "unavailable",
        isMatchedToGame: true, marketIdentityStatus: "matched_exact",
        marketIdentityReason: "market unavailable; linked directly to captured ESPN game",
        capturedAt: now, modeledAsOf: now, season: evidence.season,
        missingFields: ["market"], missingReasons: {
          market: "The configured Odds API endpoint supplies current markets only; historical market evidence was not available",
        },
        payload, payloadHash: stablePayloadHash(payload),
      }).onConflictDoNothing();
    }
  }
  for (const oddsGame of oddsGames) {
    const providerDate = safeProviderDate(oddsGame.commence_time);
    if (!providerDate) continue;
    const identity = matchNcaafMarketIdentity(oddsGame, espnGames);
    const matched = identity.game;
    const matchedGameEvidenceId = matched ? gameEvidenceIds.get(matched.espnId) ?? null : null;
    const normalizedMarkets = normalizeOddsApiMarkets(oddsGame);
    if (normalizedMarkets.length === 0) {
      const season = ncaafSeasonForDate(providerDate);
      const payload = { event: oddsGame, reason: "no market outcomes returned" };
      await database.insert(ncaafMarketObservationsTable).values({
        runId: run?.id, provider: "odds_api", providerEventId: oddsGame.id,
        bookmakerProviderId: UNAVAILABLE_BOOKMAKER_ID, bookmakerName: null, marketKey: "all", selection: "unavailable",
        price: null, line: null, observationPhase: "unavailable", gameEvidenceId: matchedGameEvidenceId, isMatchedToGame: Boolean(matched),
        marketIdentityStatus: identity.status, marketIdentityReason: identity.reason, capturedAt: now, modeledAsOf: now, season,
        missingFields: ["market"], missingReasons: { market: "provider returned no market outcomes", market_identity: identity.reason },
        payload, payloadHash: stablePayloadHash(payload),
      }).onConflictDoNothing();
      markets++; if (matched) matchedMarkets++;
    }
    for (const market of normalizedMarkets) {
      const season = ncaafSeasonForDate(providerDate);
      await database.insert(ncaafMarketObservationsTable).values({
        runId: run?.id, provider: market.provider, providerEventId: market.providerEventId,
        bookmakerProviderId: market.bookmakerProviderId, bookmakerName: market.bookmakerName,
        marketKey: market.marketKey, selection: market.selection, price: market.price, line: market.line,
        observationPhase: market.observationPhase,
        gameEvidenceId: matchedGameEvidenceId,
        isMatchedToGame: Boolean(matched), capturedAt: now, modeledAsOf: now, season,
        marketIdentityStatus: identity.status, marketIdentityReason: identity.reason,
        missingFields: matched ? market.missing.fields : [...market.missing.fields, "market_identity"],
        missingReasons: { ...market.missing.reasons, ...(!matched ? { market_identity: identity.reason } : {}) },
        payload: market.payload, payloadHash: stablePayloadHash(market.payload),
      }).onConflictDoNothing();
      markets++; if (matched) matchedMarkets++;
    }
  }
  const partialReasons = [
    ...Object.entries(providerErrors).map(([provider, error]) => ({
      code: "provider_error", provider, message: error,
    })),
    ...(markets > matchedMarkets ? [{
      code: "unmatched_market_identity", count: markets - matchedMarkets,
      message: "One or more market rows could not be safely linked to an ESPN game",
    }] : []),
  ];
  const status = partialReasons.length === 0 ? "completed" :
    (espnGames.length || oddsGames.length) ? "partial" : "failed";
  const coverage = {
    games: espnGames.length, markets, matchedMarkets, unmatchedMarkets: markets - matchedMarkets,
    missingEntityObservations, teamPerformanceRows, skippedTeamPerformanceRows,
    providerErrors, partialReasons,
    providerLimitations: isHistoricalRequest ? {
      markets: "current Odds API endpoint is not historical",
      players: "no historical player provider is configured",
      rosters: "no historical roster provider is configured",
    } : {},
  };
  const capturedCalendarDates = [
    requestedDate,
    ...oddsGames.map((game) => requestedCalendarDate(safeProviderDate(game.commence_time)!)),
  ].sort();
   const finishedAt = dependencies.now?.() ?? new Date();
   await finalizeNcaafEvidenceRun(async () => {
     const updated = await database.update(ncaafEvidenceRunsTable).set({
       requestedTo: capturedCalendarDates.at(-1) ?? requestedDate,
       status, coverage, errorDetails: partialReasons.length ? { providerErrors, partialReasons } : null, completedAt: finishedAt,
       statusHistory: [{ status: "running", reason: "capture_started", at: now.toISOString() }, {
         status, reason: status === "completed" ? "capture_completed" : "capture_finalized_with_partial_evidence",
         at: finishedAt.toISOString(), partialReasons,
       }],
     }).where(and(
       eq(ncaafEvidenceRunsTable.id, run.id),
       eq(ncaafEvidenceRunsTable.status, "running"),
     )).returning({ status: ncaafEvidenceRunsTable.status });
     if (updated.length > 0) return;
     const [terminal] = await database.select({ status: ncaafEvidenceRunsTable.status })
       .from(ncaafEvidenceRunsTable).where(eq(ncaafEvidenceRunsTable.id, run.id)).limit(1);
     // A retry after an ambiguous commit is successful only when the durable
     // row already has the exact terminal state this worker intended.
     if (terminal?.status === status) return;
     throw new Error(`NCAAF evidence run ${run.id} terminal-state conflict: intended ${status}, observed ${terminal?.status ?? "missing"}`);
   });
  return {
    runId: run?.id, games: espnGames.length, markets, matchedMarkets,
    missingEntityObservations, teamPerformanceRows, skippedTeamPerformanceRows, providerErrors,
  };
  } catch (error) {
    const reason = {
      code: "capture_exception",
      message: error instanceof Error ? error.message : String(error),
    };
     const failedAt = dependencies.now?.() ?? new Date();
     await finalizeNcaafEvidenceRun(async () => {
       const updated = await database.update(ncaafEvidenceRunsTable).set({
         status: "failed", completedAt: failedAt,
         coverage: { games: 0, markets: 0, matchedMarkets: 0, unmatchedMarkets: 0, partialReasons: [reason] },
         errorDetails: { partialReasons: [reason] },
         statusHistory: [{ status: "running", reason: "capture_started", at: now.toISOString() }, {
           status: "failed", reason: "capture_exception", at: failedAt.toISOString(), partialReasons: [reason],
         }],
       }).where(and(
         eq(ncaafEvidenceRunsTable.id, run.id),
         eq(ncaafEvidenceRunsTable.status, "running"),
       )).returning({ status: ncaafEvidenceRunsTable.status });
       if (updated.length > 0) return;
       const [terminal] = await database.select({ status: ncaafEvidenceRunsTable.status })
         .from(ncaafEvidenceRunsTable).where(eq(ncaafEvidenceRunsTable.id, run.id)).limit(1);
       if (terminal?.status === "failed") return;
       throw new Error(`NCAAF evidence run ${run.id} failure-state conflict: observed ${terminal?.status ?? "missing"}`);
     });
    throw error;
  }
}

/** Process-wide single-flight protection is intentionally here, rather than in
 * either scheduler job, because odds ingestion and result grading both invoke it. */
export async function runNcaafEvidenceSingleFlight<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const active = ncaafCaptureFlights.get(key);
  if (active) return active as Promise<T>;
  const capture = operation();
  ncaafCaptureFlights.set(key, capture);
  try {
    return await capture;
  } finally {
    if (ncaafCaptureFlights.get(key) === capture) ncaafCaptureFlights.delete(key);
  }
}

export async function captureNcaafEvidenceDate(
  date: Date | string,
  dependencies: EvidenceCaptureDependencies = {},
): Promise<EvidenceCaptureResult> {
  const key = requestedCalendarDate(date);
  return runNcaafEvidenceSingleFlight(key, () => captureNcaafEvidenceDateUnsafe(date, dependencies));
}

export async function captureCurrentNcaafEvidence(dependencies: EvidenceCaptureDependencies = {}) {
  return captureNcaafEvidenceDate(dependencies.now?.() ?? new Date(), {
    ...dependencies,
    restrictToRequestedDate: true,
  });
}

/** Bounded, append-only backfill. No prediction/pick references are written. */
export async function backfillNcaafEvidence(
  from: Date, to: Date, dependencies: EvidenceCaptureDependencies = {},
): Promise<EvidenceCaptureResult[]> {
  const result: EvidenceCaptureResult[] = [];
  for (const requestedDate of ncaafBackfillCalendarDates(from, to)) {
    result.push(await captureNcaafEvidenceDate(requestedDate, dependencies));
  }
  return result;
}

export function isEvidenceAvailableAsOf(
  observation: { capturedAt: Date; modeledAsOf: Date; kickoffAt: Date | null; season: number },
  cutoff: Date,
): boolean {
  if (!observation.kickoffAt) return false;
  assertPregameEvidenceCutoff(observation.kickoffAt, cutoff);
  return observation.season === ncaafSeasonForDate(observation.kickoffAt) &&
    isWithinNcaafSeason(observation.kickoffAt, observation.season) &&
    observation.capturedAt <= cutoff && observation.modeledAsOf <= cutoff;
}

export function assertPregameEvidenceCutoff(modeledKickoff: Date, cutoff: Date): void {
  const kickoffMs = modeledKickoff.getTime();
  const cutoffMs = cutoff.getTime();
  if (!Number.isFinite(kickoffMs) || !Number.isFinite(cutoffMs)) {
    throw new Error("NCAAF evidence cutoff and modeled kickoff must be valid dates");
  }
  if (cutoffMs >= kickoffMs) {
    throw new Error("NCAAF evidence cutoff must be before the modeled kickoff");
  }
}

async function getEligibleGameEvidenceIds(providerEventId: string, cutoff: Date): Promise<number[]> {
  const eventRows = await db.select({
    id: ncaafGameEvidenceTable.id,
    kickoffAt: ncaafGameEvidenceTable.kickoffAt,
  }).from(ncaafGameEvidenceTable).where(and(
    eq(ncaafGameEvidenceTable.provider, "espn"),
    eq(ncaafGameEvidenceTable.providerEventId, providerEventId),
  ));
  if (eventRows.length === 0) return [];

  const eligibleIds = eventRows
    .filter((row) => row.kickoffAt && cutoff < row.kickoffAt)
    .map((row) => row.id);
  if (eligibleIds.length === 0) {
    throw new Error("NCAAF evidence cutoff must be before the persisted event kickoff");
  }
  return eligibleIds;
}

export async function getNcaafGameEvidenceAsOf(providerEventId: string, cutoff: Date) {
  const eligibleIds = await getEligibleGameEvidenceIds(providerEventId, cutoff);
  if (eligibleIds.length === 0) return [];
  return db.select().from(ncaafGameEvidenceTable).where(and(
    inArray(ncaafGameEvidenceTable.id, eligibleIds),
    lte(ncaafGameEvidenceTable.capturedAt, cutoff),
    lte(ncaafGameEvidenceTable.modeledAsOf, cutoff),
  )).orderBy(asc(ncaafGameEvidenceTable.capturedAt));
}

/** Point-in-time ledger read. This does not join to, or alter, prediction
 * tables. Callers receive only evidence whose capture and declared effective
 * time were both available at the requested cutoff. The target event's
 * persisted kickoff—not a caller-supplied date—defines the pregame boundary. */
export async function getNcaafEvidenceAsOf(providerEventId: string, cutoff: Date) {
  const eligibleIds = await getEligibleGameEvidenceIds(providerEventId, cutoff);
  if (eligibleIds.length === 0) {
    return { providerEventId, cutoff, games: [], entities: [], markets: [] };
  }
  const [games, entities, markets] = await Promise.all([
    db.select().from(ncaafGameEvidenceTable).where(and(
      inArray(ncaafGameEvidenceTable.id, eligibleIds),
      lte(ncaafGameEvidenceTable.capturedAt, cutoff),
      lte(ncaafGameEvidenceTable.modeledAsOf, cutoff),
    )).orderBy(asc(ncaafGameEvidenceTable.capturedAt)),
    db.select().from(ncaafEntityObservationsTable).where(and(
      inArray(ncaafEntityObservationsTable.gameEvidenceId, eligibleIds),
      lte(ncaafEntityObservationsTable.capturedAt, cutoff),
      lte(ncaafEntityObservationsTable.modeledAsOf, cutoff),
    )).orderBy(asc(ncaafEntityObservationsTable.capturedAt)),
    db.select().from(ncaafMarketObservationsTable).where(and(
      inArray(ncaafMarketObservationsTable.gameEvidenceId, eligibleIds),
      lte(ncaafMarketObservationsTable.capturedAt, cutoff),
      lte(ncaafMarketObservationsTable.modeledAsOf, cutoff),
    )).orderBy(asc(ncaafMarketObservationsTable.capturedAt)),
  ]);
  return { providerEventId, cutoff, games, entities, markets };
}

export interface NcaafCoverageReport {
  runs: number; completed: number; partial: number; failed: number;
  games: number; markets: number; matchedMarkets: number; unmatchedMarkets: number;
}

export function summarizeNcaafCoverage(rows: Array<{ status: string; coverage: unknown }>): NcaafCoverageReport {
  const report: NcaafCoverageReport = { runs: rows.length, completed: 0, partial: 0, failed: 0, games: 0, markets: 0, matchedMarkets: 0, unmatchedMarkets: 0 };
  for (const row of rows) {
    if (row.status === "completed") report.completed++; else if (row.status === "partial") report.partial++; else if (row.status === "failed") report.failed++;
    const coverage = row.coverage as Partial<Record<"games" | "markets" | "matchedMarkets" | "unmatchedMarkets", number>> | null;
    for (const key of ["games", "markets", "matchedMarkets", "unmatchedMarkets"] as const) report[key] += Number(coverage?.[key] ?? 0);
  }
  return report;
}

export interface NcaafRunStateBreakdown {
  activeRunning: number;
  staleRunning: number;
  finalized: number;
}

/** A running row is active only during the reconciliation window. This helper
 * makes operational coverage reports deterministic for a caller-supplied clock. */
export function summarizeNcaafRunStates(
  rows: Array<{ status: string; capturedAt: Date }>,
  now: Date,
  staleAfterMs = NCAAF_EVIDENCE_RUN_STALE_AFTER_MS,
): NcaafRunStateBreakdown {
  const cutoff = now.getTime() - staleAfterMs;
  return rows.reduce<NcaafRunStateBreakdown>((result, row) => {
    if (row.status !== "running") result.finalized++;
    else if (row.capturedAt.getTime() < cutoff) result.staleRunning++;
    else result.activeRunning++;
    return result;
  }, { activeRunning: 0, staleRunning: 0, finalized: 0 });
}

export async function getNcaafCoverageReport() {
  return summarizeNcaafCoverage(await db.select({
    status: ncaafEvidenceRunsTable.status, coverage: ncaafEvidenceRunsTable.coverage,
  }).from(ncaafEvidenceRunsTable).orderBy(asc(ncaafEvidenceRunsTable.capturedAt)));
}