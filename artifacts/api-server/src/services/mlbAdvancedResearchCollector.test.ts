import { describe, expect, it } from "vitest";
import { isLiveForwardCollectionWindow, LIVE_FORWARD_ADVANCED_CANDIDATES, providerIds, removeNamesAndAttachMappings } from "./mlbAdvancedResearchCollector";

describe("MLB #214B live-forward collector boundaries", () => {
  const now = new Date("2026-09-03T18:00:00Z");
  it("targets exactly the six approved research candidates", () => {
    expect(LIVE_FORWARD_ADVANCED_CANDIDATES.map(([feature]) => feature)).toEqual([
      "starter_conventional", "probable_starter_identity", "lineup_identity_order",
      "bullpen_workload_availability", "park_run_factor", "weather_context",
    ]);
  });
  it("accepts only recent, PIT-safe, still-pregame final snapshots", () => {
    expect(isLiveForwardCollectionWindow(new Date("2026-09-03T17:00:00Z"), new Date("2026-09-03T17:55:00Z"), new Date("2026-09-03T19:00:00Z"), now)).toBe(true);
    expect(isLiveForwardCollectionWindow(new Date("2026-09-03T15:00:00Z"), new Date("2026-09-03T17:55:00Z"), new Date("2026-09-03T19:00:00Z"), now)).toBe(false);
    expect(isLiveForwardCollectionWindow(new Date("2026-09-03T17:00:00Z"), new Date("2026-09-03T19:00:00Z"), new Date("2026-09-03T19:00:00Z"), now)).toBe(false);
  });
  it("preserves provider IDs, removes names, and makes unmapped identity explicit", () => {
    const raw = { playerName: "Name Must Not Pass", playerId: "77", metrics: { value: 1 } };
    expect([...providerIds(raw)]).toEqual(["77"]);
    expect(removeNamesAndAttachMappings(raw, new Map())).toEqual({
      playerId: "77", metrics: { value: 1 }, canonicalPlayerId: null, identityState: "UNMAPPED",
    });
    expect(removeNamesAndAttachMappings(raw, new Map([["77", 12]]))).toMatchObject({ canonicalPlayerId: 12, identityState: "MAPPED" });
  });
});