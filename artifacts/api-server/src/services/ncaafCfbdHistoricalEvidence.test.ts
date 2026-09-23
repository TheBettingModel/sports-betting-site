import { describe, expect, it, vi } from "vitest";
import { CFBD_PROVIDER, cfbdPayloadHash, type CollegeFootballDataResponse } from "./collegeFootballData";
import { appendCfbdHistoricalEvidence, normalizeCfbdHistoricalGames } from "./ncaafCfbdHistoricalEvidence";

vi.mock("@workspace/db", () => ({
  db: {},
  ncaafCollegeFootballDataEvidenceTable: { id: "raw-id" },
  ncaafGameEvidenceTable: { id: "game-id" },
}));

function response(payload: unknown): CollegeFootballDataResponse {
  const capturedAt = new Date("2026-01-10T00:00:00Z");
  return { provider: CFBD_PROVIDER, endpoint: "games", requestIdentity: "games?year=2023", capturedAt, providerObservedAt: null,
    payload, payloadHash: cfbdPayloadHash(payload),
    transport: { status: 200, contentType: "json", byteLength: 1, requestStartedAt: capturedAt, requestFinishedAt: capturedAt, durationMs: 0, retryCount: 0, failureCategory: null } };
}
describe("CFBD historical DB evidence", () => {
  it("normalizes provider game shape with native IDs and honest retrospective chronology", () => {
    const result = normalizeCfbdHistoricalGames(2023, response([{ id: 99, homeId: 1, awayId: 2, startDate: "2023-09-01T00:00:00Z", completed: true, homePoints: 21, awayPoints: 7, week: 1, seasonType: "regular", neutralSite: true, venue: "Test" }]));
    expect(result.malformed).toEqual([]);
    expect(result.rows[0]).toMatchObject({ providerEventId: "99", homeProviderTeamId: "1", awayProviderTeamId: "2", gameStatus: "final", homeScore: 21, awayScore: 7, neutralSite: true, modeledAsOf: new Date("2026-01-10T00:00:00Z"), evidenceStatus: "retrospective_observed" });
    expect(result.rows[0].payload).toMatchObject({ classifications: { seasonType: "regular", ingestion: "retrospective_aggregate_not_pregame" } });
  });
  it("rejects malformed game rows without inventing stable IDs", () => {
    const result = normalizeCfbdHistoricalGames(2023, response([{ id: 1, homeId: 2 }, "bad"]));
    expect(result.rows).toHaveLength(0);
    expect(result.malformed).toHaveLength(2);
  });
  it("uses append-only conflict-safe raw and game inserts", async () => {
    const values = vi.fn(); const returning = vi.fn().mockResolvedValue([]);
    const database = { insert: vi.fn(() => ({ values: (...args: unknown[]) => { values(...args); return { onConflictDoNothing: () => ({ returning }) }; } })) };
    const output = await appendCfbdHistoricalEvidence({ season: 2023, response: response([{ id: 1, homeId: 2, awayId: 3, startDate: "2023-09-01T00:00:00Z" }]), database: database as never });
    expect(database.insert).toHaveBeenCalledTimes(2);
    expect(output).toMatchObject({ rawInserted: 0, gamesInserted: 0, malformed: [] });
  });
});