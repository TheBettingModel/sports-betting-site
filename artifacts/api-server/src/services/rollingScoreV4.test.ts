import { describe, expect, it } from "vitest";
import {
  materializeRollingScoreTraining,
  predictRollingScoreV4,
  trainRollingScoreV4,
  type CompletedScoreGame,
} from "./rollingScoreV4";

function fixtures(): CompletedScoreGame[] {
  const teams = ["a", "b", "c", "d", "e", "f"];
  return Array.from({ length: 90 }, (_, index) => {
    const start = new Date(Date.UTC(2025, 0, index + 1, 18));
    const home = teams[index % teams.length]!;
    const away = teams[(index * 5 + 1) % teams.length]!;
    return {
      gameId: `g${index}`, sport: "NFL", homeTeamId: home, awayTeamId: away,
      eventStart: start.toISOString(),
      completedAt: new Date(start.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      homeScore: 20 + (index % 14), awayScore: 17 + ((index * 3) % 14),
    };
  });
}

describe("rolling score V4 core", () => {
  it("materializes only from strictly earlier completed games", () => {
    const rows = materializeRollingScoreTraining("NFL", fixtures());
    expect(rows.length).toBeGreaterThan(40);
    for (const row of rows) {
      expect(row.sourceEvidenceTimes.every((time) => time < row.eventStart)).toBe(true);
      expect(row.dataCutoff).toBe(row.sourceEvidenceTimes.at(-1));
    }
  });

  it("trains an exact frozen shadow artifact deterministically", () => {
    const rows = materializeRollingScoreTraining("NFL", fixtures());
    const a = trainRollingScoreV4("NFL", rows, "2026-09-07T00:00:00.000Z");
    const b = trainRollingScoreV4("NFL", rows, "2026-09-07T00:00:00.000Z");
    expect(a).toEqual(b);
    expect(a.artifactHash).toHaveLength(64);
    expect(a.parameterHash).toHaveLength(64);
    expect(a.approvalState).toBe("SHADOW");
    expect(a.modelId).toContain("nfl-v4");
  });

  it("produces valid score and binary probability output", () => {
    const rows = materializeRollingScoreTraining("NFL", fixtures());
    const artifact = trainRollingScoreV4("NFL", rows, "2026-09-07T00:00:00.000Z");
    const prediction = predictRollingScoreV4(artifact, rows.at(-1)!);
    expect(prediction.home).toBeGreaterThanOrEqual(0);
    expect(prediction.away).toBeGreaterThanOrEqual(0);
    expect(prediction.homeProbability).toBeGreaterThan(0);
    expect(prediction.homeProbability).toBeLessThan(1);
  });
});