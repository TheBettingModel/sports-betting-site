import { describe, expect, it } from "vitest";
import { buildMlbHistoricalPitFoundation } from "./mlbHistoricalPitFoundation";
import type { HistoricalGameSourceRow } from "./mlbHistoricalSource";

function sourceGame(index: number, date: string, home = "1", away = "2"): HistoricalGameSourceRow {
  return {
    providerGameId: String(index),
    season: 2023,
    gameType: "R",
    gameDate: date,
    scheduledFirstPitch: `${date}T18:00:00Z`,
    actualStartTime: null,
    completionTime: null,
    home: { providerTeamId: home, name: `Team ${home}` },
    away: { providerTeamId: away, name: `Team ${away}` },
    venue: null,
    homeRuns: index % 7,
    awayRuns: (index + 2) % 6,
    inningsPlayed: 9,
    gameStatus: "F",
    detailedStatus: "Final",
    abstractStatus: "Final",
    gameNumber: 1,
    doubleheaderStatus: "N",
    postseason: false,
    neutralSite: false,
    suspended: false,
    resumed: false,
    chronologyState: "NORMAL_GAME_PROXY",
    probableStarters: { home: null, away: null },
    starterState: { home: "UNKNOWN", away: "UNKNOWN" },
    payloadHash: `hash-${index}`,
    raw: {},
  };
}

describe("MLB historical PIT foundation", () => {
  const games = Array.from({ length: 40 }, (_, i) => sourceGame(
    i + 1,
    new Date(Date.UTC(2023, 3, i + 1)).toISOString().slice(0, 10),
  ));

  it("is deterministic and never includes market fields", () => {
    const first = buildMlbHistoricalPitFoundation(games);
    const second = buildMlbHistoricalPitFoundation([...games].reverse());
    expect(first.checksum).toBe(second.checksum);
    expect(first.replayChecksum).toBe(second.replayChecksum);
    for (const row of first.rows) {
      expect(row.pitLineage.sportsbookFieldsPresent).toBe(false);
      expect(JSON.stringify({ core: row.coreFeatures, enhanced: row.enhancedFeatures }))
        .not.toMatch(/moneyline|sportsbook|closingLine|impliedProbability/);
    }
    expect(first.summary.marketLeakageViolations).toBe(0);
  });

  it("excludes the target and same-day games from prior outcomes", () => {
    const sameDay = sourceGame(41, "2023-04-30", "3", "4");
    const result = buildMlbHistoricalPitFoundation([...games, sameDay]);
    const row = result.rows.find((candidate) => candidate.providerGameId === "30" && candidate.teamSide === "home")!;
    expect(row.pitLineage.priorGameCount).toBe(29);
    expect(row.pitLineage.lastPriorGameId).toBe("mlb-game:29");
    expect(new Date(row.featureCutoff).getTime()).toBeLessThan(new Date(row.scheduledFirstPitch).getTime());
  });

  it("requires sufficient prior team and league history for core eligibility", () => {
    const result = buildMlbHistoricalPitFoundation(games);
    expect(result.rows[0].eligibilityState).toBe("EXCLUDED");
    expect(result.summary.coreEligibleGames).toBe(0);
    expect(result.summary.coreCandidateGames).toBeGreaterThan(0);
    expect(result.summary.enhancedEligibleGames).toBe(0);
  });

  it("never uses ambiguous resumed outcomes as prior features", () => {
    const resumed = {
      ...sourceGame(100, "2023-03-31"),
      resumed: true,
      chronologyState: "AMBIGUOUS" as const,
    };
    const result = buildMlbHistoricalPitFoundation([resumed, ...games]);
    const aprilTwo = result.rows.find((row) => row.providerGameId === "2" && row.teamSide === "home")!;
    expect(aprilTwo.pitLineage.priorGameCount).toBe(1);
    expect(result.exclusions.find((row) => row.providerGameId === "100")?.reasons)
      .toContain("AMBIGUOUS_CHRONOLOGY");
  });
});