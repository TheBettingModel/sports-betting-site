import { describe, expect, it, vi } from "vitest";
import {
  ESPN_NCAAF_SUMMARY_ENDPOINT,
  EspnNcaafSummaryError,
  fetchEspnNcaafSummary,
  normalizeEspnNcaafSummary,
} from "./espnNcaafSummary";

const completedSummary = {
  header: { id: "401", competitions: [{ id: "401", date: "2025-09-06T16:00Z", status: { type: { completed: true } } }] },
  boxscore: {
    teams: [{ homeAway: "away", team: { id: "1", displayName: "Away" }, statistics: [
      { name: "totalYards", displayValue: "228" }, { name: "netPassingYards", displayValue: "165" },
      { name: "rushingYards", displayValue: "63" }, { name: "turnovers", displayValue: "2" },
      { name: "completionAttempts", displayValue: "11/25" }, { name: "thirdDownEff", displayValue: "2-14" },
      { name: "totalPenaltiesYards", displayValue: "4-36" }, { name: "possessionTime", displayValue: "29:57" },
    ] }],
    players: [{ team: { id: "1" }, statistics: [{ name: "passing", keys: [
      "completions/passingAttempts", "passingYards", "passingTouchdowns", "interceptions",
    ], athletes: [{ athlete: { id: "9", displayName: "A QB" }, stats: ["11/25", "165", "1", "2"] }] }] }],
  },
  drives: { previous: [{ id: "d1", team: { id: "1" }, description: "9 plays, 75 yards", result: "Touchdown",
    start: { period: { number: 1 }, clock: { displayValue: "15:00" } }, end: { period: { number: 1 }, clock: { displayValue: "10:00" } },
    timeElapsed: { displayValue: "5:00" }, plays: 9, yards: 75, isScore: true }] },
  // These market-shaped fields must remain ignored.
  pickcenter: [{ details: "not consumed" }], odds: [{ overUnder: 99 }], predictor: { homeTeam: {} },
};

describe("ESPN NCAAF completed-game summary adapter", () => {
  it("parses observed team boxscore pairs without treating them as markets", () => {
    const payload = normalizeEspnNcaafSummary(completedSummary, new Date("2025-09-07T00:00:00Z"));
    expect(payload.teams[0]).toMatchObject({
      providerTeamId: "1", totalYards: 228, netPassingYards: 165, rushingYards: 63, turnovers: 2,
      completionAttempts: { made: 11, attempted: 25 }, thirdDown: { made: 2, attempted: 14 },
      penalties: { made: 4, attempted: 36 }, possessionSeconds: 1797,
    });
    expect(JSON.stringify(payload)).not.toMatch(/pickcenter|predictor|overUnder/);
    expect(payload.sourceEndpoint).toBe(ESPN_NCAAF_SUMMARY_ENDPOINT);
    expect(payload.payloadHash).toHaveLength(64);
  });

  it("retains drive metadata and quarterback identity/performance", () => {
    const payload = normalizeEspnNcaafSummary(completedSummary);
    expect(payload.drives[0]).toMatchObject({ providerDriveId: "d1", providerTeamId: "1", result: "Touchdown", plays: 9, yards: 75, isScore: true });
    expect(payload.quarterbacks[0]).toMatchObject({
      providerPlayerId: "9", providerTeamId: "1", displayName: "A QB", completions: 11, attempts: 25,
      passingYards: 165, passingTouchdowns: 1, interceptions: 2,
    });
  });

  it("preserves absent fields as null and records reasons", () => {
    const response = structuredClone(completedSummary);
    response.boxscore.teams[0]!.statistics = [{ name: "totalYards", displayValue: "--" }];
    response.boxscore.players = [];
    response.drives.previous = [];
    const payload = normalizeEspnNcaafSummary(response);
    expect(payload.teams[0]!.netPassingYards).toBeNull();
    expect(payload.teams[0]!.completionAttempts).toEqual({ made: null, attempted: null });
    expect(payload.teams[0]!.missingReasons.netPassingYards).toMatch(/omitted/);
    expect(payload.missingFields).toEqual(expect.arrayContaining(["drives", "players"]));
  });

  it("uses the endpoint with a timeout and structured HTTP errors", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(completedSummary), { status: 200 }));
    await expect(fetchEspnNcaafSummary("401", { fetchFn, timeoutMs: 20 })).resolves.toMatchObject({ providerEventId: "401" });
    expect(fetchFn.mock.calls[0]![0]).toBe(`${ESPN_NCAAF_SUMMARY_ENDPOINT}?event=401`);
    await expect(fetchEspnNcaafSummary("bad", { fetchFn })).rejects.toMatchObject({ code: "INVALID_EVENT_ID" });
    await expect(fetchEspnNcaafSummary("401", { fetchFn: vi.fn().mockResolvedValue(new Response(null, { status: 503 })) }))
      .rejects.toBeInstanceOf(EspnNcaafSummaryError);
  });
});