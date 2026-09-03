import { describe, expect, it } from "vitest";
import {
  captureCollegeFootballDataEvidence,
  isWithinCfbdCaptureWindow,
  removeMarketShapedFields,
} from "./ncaafCollegeFootballDataEvidence";

const now = new Date("2026-09-15T12:00:00.000Z");
const response = {
  provider: "college_football_data" as const, endpoint: "games" as const,
  requestIdentity: "games?year=2026", capturedAt: now, providerObservedAt: null,
  payloadHash: "bulk", payload: [
    { id: 900, season: 2026, week: 3, startDate: "2026-09-14T18:00:00Z", homeId: 11, awayId: 22,
      homeTeam: "Home", awayTeam: "Away", homePoints: 24, awayPoints: 10, completed: true, odds: { spread: -3 } },
    { id: 901, season: 2026, week: 3, startDate: "2026-09-15T18:00:00Z", homeId: 33, awayId: 44,
      homeTeam: "Future", awayTeam: "Other", homePoints: 0, awayPoints: 0, completed: false },
    { id: 902, season: 2026, week: 1, startDate: "2026-08-01T18:00:00Z", homeId: 55, awayId: 66,
      homeTeam: "Old", awayTeam: "Old Other", homePoints: 7, awayPoints: 3, completed: true },
  ],
};

function fakeDatabase(writes: unknown[]) {
  return {
    insert: (table: unknown) => ({
      values: (value: unknown) => {
        writes.push({ table, value });
        return { onConflictDoNothing: () => ({ returning: async () => [{ id: 1 }] }) };
      },
    }),
  };
}

describe("CFBD bounded evidence capture", () => {
  it("uses a real date window and strips market-shaped compatible payload fields", () => {
    expect(isWithinCfbdCaptureWindow(response.payload[0]!, now)).toBe(true);
    expect(isWithinCfbdCaptureWindow(response.payload[2]!, now)).toBe(false);
    expect(removeMarketShapedFields(response.payload[0])).not.toHaveProperty("odds");
  });

  it("persists raw bulk evidence first and only materializes valid completed scores", async () => {
    const writes: unknown[] = [];
    const requestedWeeks: Array<number | undefined> = [];
    const result = await captureCollegeFootballDataEvidence({}, {
      now: () => now, database: fakeDatabase(writes) as never,
      requestGames: async (_season, week) => {
        requestedWeeks.push(week);
        return {
          ...response,
          transport: {
            status: 200, contentType: "json" as const, byteLength: 1,
            requestStartedAt: now, requestFinishedAt: now, durationMs: 1,
            retryCount: 0, failureCategory: null,
          },
        };
      },
    });
    expect(requestedWeeks).toEqual([undefined]);
    expect(result).toMatchObject({ rawRows: 1, games: 1, entities: 1, performances: 1 });
    expect((writes[0] as { value: { payload: unknown } }).value.payload).toEqual(response.payload);
    const compatible = writes.slice(1).flatMap((write) => {
      const value = (write as { value: Record<string, unknown> | Array<Record<string, unknown>> }).value;
      return Array.isArray(value) ? value : [value];
    });
    expect(compatible.some((row) => row.providerEventId === "900")).toBe(true);
    expect(compatible.some((row) => row.providerEventId === "ESPN-900")).toBe(false);
    expect(JSON.stringify(compatible)).not.toContain("\"odds\"");
  });
});