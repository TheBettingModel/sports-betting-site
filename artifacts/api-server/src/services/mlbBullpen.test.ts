import { describe, expect, it } from "vitest";
import { parseMlbBoxscorePitching } from "./mlbBullpen";

describe("MLB boxscore pitching parser", () => {
  it("keeps the first pitcher as starter and aggregates later pitchers separately", () => {
    const parsed = parseMlbBoxscorePitching({
      pitchers: [10, 11],
      players: {
        ID10: { person: { id: 10, fullName: "Starter" }, stats: { pitching: { inningsPitched: "5.2", numberOfPitches: 90, runs: 3 } } },
        ID11: { person: { id: 11, fullName: "Reliever" }, stats: { pitching: { inningsPitched: "1.1", numberOfPitches: 20, runs: 0 } } },
      },
    });
    expect(parsed.starter?.inningsPitched).toBeCloseTo(5 + 2 / 3);
    expect(parsed.bullpen).toHaveLength(1);
    expect(parsed.bullpen[0]?.name).toBe("Reliever");
  });
});