import { describe, expect, it, vi } from "vitest";
import { runScheduledV4ShadowProjectionCapture } from "./v4ShadowProjectionScheduler";
import type { FullSlateCoverage } from "./v4FullSlate";

function coverage(sport: "MLB" | "SOCCER", sportDate: string): FullSlateCoverage {
  return {
    runId: `${sport}-${sportDate}`,
    sport,
    sportDate,
    scheduledEvents: 2,
    eligibleEvents: 2,
    forecastedEvents: 1,
    failedEvents: 1,
    forecastCoveragePct: 50,
    failures: [{ gameId: `${sport}-missing`, reason: "INSUFFICIENT_PREGAME_EVIDENCE" }],
    forecasts: [],
  };
}

describe("scheduled V4 shadow projection capture", () => {
  it("captures each sport/date in shadow mode with one shared immutable ledger", async () => {
    const discover = vi.fn(async () => []);
    const run = vi.fn(async (input: { sport: "MLB" | "SOCCER"; sportDate: string }) =>
      coverage(input.sport, input.sportDate));
    const ledger = {} as never;

    const result = await runScheduledV4ShadowProjectionCapture({
      now: new Date("2026-09-09T22:00:00.000Z"),
      sports: ["MLB", "SOCCER"],
      dates: ["2026-09-09", "2026-09-10"],
      discover: discover as never,
      run: run as never,
      ledger,
    });

    expect(discover).toHaveBeenCalledTimes(4);
    expect(run).toHaveBeenCalledTimes(4);
    for (const call of run.mock.calls) {
      expect(call[0]).toMatchObject({ mode: "SHADOW", ledger });
    }
    expect(result).toMatchObject({
      scheduledEvents: 8,
      forecastedEvents: 4,
      failedEvents: 4,
      failedAttempts: 0,
    });
  });

  it("continues other sport/date attempts after an isolated failure", async () => {
    const discover = vi.fn(async (sport: string) => {
      if (sport === "SOCCER") throw new Error("provider unavailable");
      return [];
    });
    const run = vi.fn(async (input: { sport: "MLB"; sportDate: string }) =>
      coverage(input.sport, input.sportDate));

    const result = await runScheduledV4ShadowProjectionCapture({
      now: new Date("2026-09-09T22:00:00.000Z"),
      sports: ["SOCCER", "MLB"],
      dates: ["2026-09-09"],
      discover: discover as never,
      run: run as never,
      ledger: {} as never,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.failedAttempts).toBe(1);
    expect(result.attempts).toEqual([
      expect.objectContaining({ sport: "SOCCER", status: "failed" }),
      expect.objectContaining({ sport: "MLB", status: "completed" }),
    ]);
  });
});