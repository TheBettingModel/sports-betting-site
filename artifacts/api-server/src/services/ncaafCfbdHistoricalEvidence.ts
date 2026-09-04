import { db, ncaafCollegeFootballDataEvidenceTable, ncaafGameEvidenceTable } from "@workspace/db";
import { CFBD_PROVIDER, cfbdPayloadHash, type CollegeFootballDataResponse } from "./collegeFootballData";

type CfbdGame = Record<string, unknown>;
const HISTORICAL_GAME_INSERT_BATCH_SIZE = 250;
const asText = (value: unknown) => value == null ? null : String(value);
const asNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const asDate = (value: unknown) => {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

export interface CfbdMalformedHistoricalGame { index: number; reason: string }
export interface CfbdNormalizedHistoricalGames {
  rows: Array<typeof ncaafGameEvidenceTable.$inferInsert>;
  malformed: CfbdMalformedHistoricalGame[];
}

/**
 * CFBD /games is a retrospective season aggregate in this flow. `modeledAsOf`
 * is deliberately the capture timestamp, never kickoff, so it cannot become
 * accidental pregame evidence.  CFBD's IDs are retained without name matching.
 */
export function normalizeCfbdHistoricalGames(
  season: number,
  response: CollegeFootballDataResponse,
): CfbdNormalizedHistoricalGames {
  const rows: Array<typeof ncaafGameEvidenceTable.$inferInsert> = [], malformed: CfbdMalformedHistoricalGame[] = [];
  if (!Array.isArray(response.payload)) return { rows, malformed: [{ index: -1, reason: "CFBD games payload must be an array" }] };
  response.payload.forEach((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      malformed.push({ index, reason: "CFBD game row must be an object" }); return;
    }
    const game = value as CfbdGame;
    const providerEventId = asText(game.id), homeId = asText(game.homeId), awayId = asText(game.awayId);
    const kickoffAt = asDate(game.startDate);
    if (!providerEventId || !homeId || !awayId || !kickoffAt) {
      malformed.push({ index, reason: "CFBD game row requires id, homeId, awayId, and valid startDate" }); return;
    }
    const completed = game.completed === true;
    const homeScore = asNumber(game.homePoints), awayScore = asNumber(game.awayPoints);
    const classifications = {
      seasonType: asText(game.seasonType), conferenceGame: game.conferenceGame === true,
      startTimeTbd: game.startTimeTbd === true, completed,
      ingestion: "retrospective_aggregate_not_pregame",
    };
    const payload = { game, classifications };
    rows.push({
      provider: CFBD_PROVIDER, providerEventId, providerObservedAt: response.providerObservedAt,
      capturedAt: response.capturedAt, modeledAsOf: response.capturedAt, season,
      week: asNumber(game.week), kickoffAt, gameStatus: completed ? "final" : "scheduled",
      homeScore: completed ? homeScore : null, awayScore: completed ? awayScore : null,
      venueId: asText(game.venueId), venueName: asText(game.venue),
      homeConferenceId: asText(game.homeConference), awayConferenceId: asText(game.awayConference),
      homeProviderTeamId: homeId, awayProviderTeamId: awayId,
      homeTeamName: asText(game.homeTeam), awayTeamName: asText(game.awayTeam),
      neutralSite: game.neutralSite === true, evidenceStatus: "retrospective_observed",
      missingFields: [], missingReasons: { chronology: "Season aggregate captured retrospectively; not pregame evidence" },
      payload, payloadHash: cfbdPayloadHash(payload),
    });
  });
  return { rows, malformed };
}

/**
 * Append-only raw evidence plus idempotent normalized game rows. Both database
 * unique indexes include payload hashes; no update/upsert mutates evidence.
 */
export async function appendCfbdHistoricalEvidence(
  input: { season: number; response: CollegeFootballDataResponse; database?: typeof db },
) {
  const database = input.database ?? db;
  const { season, response } = input;
  const raw = await database.insert(ncaafCollegeFootballDataEvidenceTable).values({
    provider: CFBD_PROVIDER, endpoint: response.endpoint, requestIdentity: response.requestIdentity,
    season, week: null, capturedAt: response.capturedAt, modeledAsOf: response.capturedAt,
    providerObservedAt: response.providerObservedAt, payloadHash: response.payloadHash, payload: response.payload,
    evidenceState: "retrospective_observed", missingFields: [],
    missingReasons: { chronology: "Historical aggregate capture; not pregame evidence" },
  }).onConflictDoNothing().returning({ id: ncaafCollegeFootballDataEvidenceTable.id });
  const normalized = response.endpoint === "games"
    ? normalizeCfbdHistoricalGames(season, response)
    : { rows: [], malformed: [] as CfbdMalformedHistoricalGame[] };
  let gamesInserted = 0;
  for (let offset = 0; offset < normalized.rows.length; offset += HISTORICAL_GAME_INSERT_BATCH_SIZE) {
    const inserted = await database.insert(ncaafGameEvidenceTable)
      .values(normalized.rows.slice(offset, offset + HISTORICAL_GAME_INSERT_BATCH_SIZE))
      .onConflictDoNothing().returning({ id: ncaafGameEvidenceTable.id });
    gamesInserted += inserted.length;
  }
  return { rawInserted: raw.length, gamesInserted, malformed: normalized.malformed };
}