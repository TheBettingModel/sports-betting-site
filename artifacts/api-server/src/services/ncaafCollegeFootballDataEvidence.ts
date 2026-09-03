import {
  db,
  ncaafCollegeFootballDataEvidenceTable,
  ncaafEntityObservationsTable,
  ncaafGameEvidenceTable,
  ncaafTeamGamePerformanceTable,
} from "@workspace/db";
import { cfbdPayloadHash, CFBD_PROVIDER, collegeFootballData, type CfbdTransportMetadata, type CollegeFootballDataResponse } from "./collegeFootballData";
import { ncaafSeasonForDate } from "./ncaafEvidenceLedger";
import type { NcaafCompetitionClassification } from "./ncaafFootballIntelligence";

export const MAX_CFBD_CAPTURE_WEEK = 20;
/** Bulk season results are materialized only in this bounded active window. */
export const CFBD_CAPTURE_WINDOW_DAYS_BEFORE = 14;
export const CFBD_CAPTURE_WINDOW_DAYS_AFTER = 14;

type CfbdGame = Record<string, unknown> & {
  id?: number | string; season?: number; week?: number; startDate?: string;
  homeId?: number | string; awayId?: number | string; homeTeam?: string; awayTeam?: string;
  homePoints?: number; awayPoints?: number; completed?: boolean; neutralSite?: boolean;
  venueId?: number | string; venue?: string; homeClassification?: string; awayClassification?: string;
};

export interface CfbdCaptureDependencies {
  database?: typeof db;
  requestGames?: (season: number, week?: number) => Promise<CollegeFootballDataResponse>;
  now?: () => Date;
}

export interface CfbdCaptureResult {
  season: number;
  week: number | null;
  rawRows: number;
  games: number;
  entities: number;
  performances: number;
  transport: CfbdTransportMetadata;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
function date(value: unknown): Date | null {
  const parsed = typeof value === "string" ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}
function classification(value: unknown): NcaafCompetitionClassification {
  return value === "fbs" || value === "FBS" ? "FBS" : value === "fcs" || value === "FCS" ? "FCS" : value ? "OTHER" : "UNKNOWN";
}
function missingGame(game: CfbdGame) {
  const fields: string[] = [];
  const reasons: Record<string, string> = {};
  const add = (field: string, reason: string) => { fields.push(field); reasons[field] = reason; };
  if (!game.id) add("cfbd_game_id", "CFBD game response omitted game identity");
  if (!game.homeId) add("home_team_id", "CFBD game response omitted home team identity");
  if (!game.awayId) add("away_team_id", "CFBD game response omitted away team identity");
  if (!date(game.startDate)) add("kickoff", "CFBD game response omitted or supplied an invalid kickoff");
  return { fields, reasons };
}
const MARKET_SHAPED_KEY = /(?:market|odds|sportsbook|bookmaker|moneyline|spread|price|wager|bet(?:ting)?|stake|unit|probabilit|forecast|project(?:ed|ion)?|recommendation|expected[_-]?score)/i;
/** Compatible evidence is sports-only even if an upstream response shape changes. */
export function removeMarketShapedFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeMarketShapedFields);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !MARKET_SHAPED_KEY.test(key))
    .map(([key, child]) => [key, removeMarketShapedFields(child)]));
  return value;
}
export function isWithinCfbdCaptureWindow(game: CfbdGame, now: Date): boolean {
  const kickoff = date(game.startDate);
  return kickoff != null && kickoff >= new Date(now.getTime() - CFBD_CAPTURE_WINDOW_DAYS_BEFORE * 86_400_000)
    && kickoff <= new Date(now.getTime() + CFBD_CAPTURE_WINDOW_DAYS_AFTER * 86_400_000);
}

/** Bounded game capture only. It does not match ESPN IDs and never captures markets. */
export async function captureCollegeFootballDataEvidence(
  input: { season?: number; week?: number } = {},
  dependencies: CfbdCaptureDependencies = {},
): Promise<CfbdCaptureResult> {
  const now = dependencies.now?.() ?? new Date();
  const season = input.season ?? ncaafSeasonForDate(now);
  if (season !== ncaafSeasonForDate(now)) throw new Error("CFBD capture is limited to the current NCAAF season");
  const week = input.week;
  if (week !== undefined && (!Number.isInteger(week) || week < 1 || week > MAX_CFBD_CAPTURE_WEEK)) throw new Error(`CFBD capture week must be 1-${MAX_CFBD_CAPTURE_WEEK}`);
  // NCAA labels are provider-owned: normal capture uses CFBD's season bulk
  // endpoint, while an explicit week remains available for manual/test capture.
  const response = await (dependencies.requestGames ?? ((s, w) => collegeFootballData.request("games", { year: s, week: w })))(season, week);
  if (!Array.isArray(response.payload)) throw new Error("CFBD games response must be an array");
  const database = dependencies.database ?? db;
  const rawInserted = await database.insert(ncaafCollegeFootballDataEvidenceTable).values({
    provider: CFBD_PROVIDER, endpoint: response.endpoint, requestIdentity: response.requestIdentity,
    season, week, capturedAt: response.capturedAt, modeledAsOf: response.capturedAt,
    providerObservedAt: response.providerObservedAt, payloadHash: response.payloadHash, payload: response.payload,
    evidenceState: "observed", missingFields: [], missingReasons: {},
  }).onConflictDoNothing().returning({ id: ncaafCollegeFootballDataEvidenceTable.id });
  const gameValues: Array<typeof ncaafGameEvidenceTable.$inferInsert> = [];
  const entityValues: Array<typeof ncaafEntityObservationsTable.$inferInsert> = [];
  const performanceValues: Array<typeof ncaafTeamGamePerformanceTable.$inferInsert> = [];
  for (const payload of response.payload) {
    if (!payload || typeof payload !== "object") continue;
    const game = payload as CfbdGame;
    if (week === undefined && !isWithinCfbdCaptureWindow(game, now)) continue;
    const gameId = game.id == null ? null : String(game.id);
    if (!gameId) continue;
    const sportsPayload = removeMarketShapedFields(game) as CfbdGame;
    const missing = missingGame(game);
    const kickoffAt = date(game.startDate);
    gameValues.push({
      provider: CFBD_PROVIDER, providerEventId: gameId, providerObservedAt: response.providerObservedAt,
      capturedAt: response.capturedAt, modeledAsOf: response.capturedAt, season, week: integer(game.week) ?? week,
      kickoffAt, gameStatus: game.completed === true ? "final" : null,
      homeScore: integer(game.homePoints), awayScore: integer(game.awayPoints),
      venueId: game.venueId == null ? null : String(game.venueId), venueName: typeof game.venue === "string" ? game.venue : null,
      homeProviderTeamId: game.homeId == null ? null : String(game.homeId), awayProviderTeamId: game.awayId == null ? null : String(game.awayId),
      homeTeamName: typeof game.homeTeam === "string" ? game.homeTeam : null, awayTeamName: typeof game.awayTeam === "string" ? game.awayTeam : null,
      neutralSite: typeof game.neutralSite === "boolean" ? game.neutralSite : null,
      missingFields: missing.fields, missingReasons: missing.reasons, payload: sportsPayload, payloadHash: cfbdPayloadHash(sportsPayload),
    });
    const sides = [{ teamId: game.homeId, opponentId: game.awayId, name: game.homeTeam, side: "home" as const, points: game.homePoints, against: game.awayPoints, class: game.homeClassification },
      { teamId: game.awayId, opponentId: game.homeId, name: game.awayTeam, side: "away" as const, points: game.awayPoints, against: game.homePoints, class: game.awayClassification }];
    for (const side of sides) {
      if (side.teamId == null) continue;
      const teamId = String(side.teamId);
      const entityPayload = { cfbdGameId: gameId, cfbdTeamId: teamId, teamName: side.name ?? null, classification: classification(side.class) };
      entityValues.push({
        provider: CFBD_PROVIDER, providerEntityId: teamId, entityType: "team_season", observationType: "game_team_identity",
        season, week, providerObservedAt: response.providerObservedAt, capturedAt: response.capturedAt, modeledAsOf: response.capturedAt,
        missingFields: side.name ? [] : ["team_name"], missingReasons: side.name ? {} : { team_name: "CFBD game response omitted team name" },
        payload: entityPayload, payloadHash: cfbdPayloadHash(entityPayload),
      });
      // Scores are inserted only when CFBD explicitly marks this game complete and supplies both legitimate integer scores.
      if (game.completed !== true || integer(side.points) == null || integer(side.against) == null || side.opponentId == null) continue;
      const performancePayload = { game: sportsPayload, teamId, side: side.side };
      performanceValues.push({
        provider: CFBD_PROVIDER, providerEventId: gameId, providerTeamId: teamId, providerOpponentTeamId: String(side.opponentId),
        season, week: integer(game.week) ?? week, kickoffAt, teamLocation: game.neutralSite === true ? "neutral" : side.side,
        competitionClassification: classification(side.class), pointsFor: integer(side.points), pointsAgainst: integer(side.against),
        missingFields: [], missingReasons: {}, providerObservedAt: response.providerObservedAt, capturedAt: response.capturedAt,
        payloadHash: cfbdPayloadHash(performancePayload),
        provenance: { source: "college_football_data", cfbdGameId: gameId, capturedAt: response.capturedAt.toISOString(), marketFieldsExcluded: true },
      });
    }
  }
  let games = 0; let entities = 0; let performances = 0;
  for (let offset = 0; offset < gameValues.length; offset += 500) {
    const inserted = await database.insert(ncaafGameEvidenceTable).values(gameValues.slice(offset, offset + 500))
      .onConflictDoNothing().returning({ id: ncaafGameEvidenceTable.id });
    games += inserted.length;
  }
  for (let offset = 0; offset < entityValues.length; offset += 500) {
    const inserted = await database.insert(ncaafEntityObservationsTable).values(entityValues.slice(offset, offset + 500))
      .onConflictDoNothing().returning({ id: ncaafEntityObservationsTable.id });
    entities += inserted.length;
  }
  for (let offset = 0; offset < performanceValues.length; offset += 500) {
    const inserted = await database.insert(ncaafTeamGamePerformanceTable).values(performanceValues.slice(offset, offset + 500))
      .onConflictDoNothing().returning({ id: ncaafTeamGamePerformanceTable.id });
    performances += inserted.length;
  }
  return { season, week: week ?? null, rawRows: rawInserted.length, games, entities, performances, transport: response.transport };
}