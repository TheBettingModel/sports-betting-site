import { describe, expect, it, vi } from "vitest";
import { runNflV4ProspectiveCollection } from "./nflV4Prospective";
import type { FullSlateCoverage } from "./v4FullSlate";

describe("NFL V4 prospective collection", () => {
  it("attempts the bounded upcoming slate and preserves shadow mode", async () => {
    const discover = vi.fn(async (_sport: string, date: string) =>
      date === "2026-09-10" ? [{
        gameId: "NFL-one", sport: "NFL" as const, eventStart: "2026-09-11T00:00:00.000Z",
        homeParticipantId: "1", awayParticipantId: "2", homeParticipantName: "Home",
        awayParticipantName: "Away", eligibility: "ELIGIBLE" as const, failureReason: null,
      }] : []);
    const coverage: FullSlateCoverage = {
      runId: "run", sport: "NFL", sportDate: "2026-09-10", scheduledEvents: 1,
      eligibleEvents: 1, forecastedEvents: 1, failedEvents: 0,
      forecastCoveragePct: 100, failures: [], forecasts: [],
    };
    const run = vi.fn(async () => coverage);
    const result = await runNflV4ProspectiveCollection({
      now: new Date("2026-09-07T12:00:00.000Z"), days: 8,
      discover: discover as never, run: run as never, ledger: {} as never,
    });
    expect(discover).toHaveBeenCalledTimes(8);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ sport: "NFL", mode: "SHADOW" }));
    expect(result).toMatchObject({ forecastsPersisted: 1, failedEvents: 0, coveragePct: 100 });
  });
});