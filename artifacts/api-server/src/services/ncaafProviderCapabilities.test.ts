import { describe, expect, it } from "vitest";
import {
  NCAAF_CAPABILITY_STATES,
  NCAAF_PROVIDER_CAPABILITIES,
  getNcaafReadinessBlockers,
} from "./ncaafProviderCapabilities";

describe("NCAAF provider capability inventory", () => {
  it("records the scoreboard fields actually mapped by ESPN", () => {
    const fields = NCAAF_PROVIDER_CAPABILITIES
      .filter((entry) => entry.provider === "espn_scoreboard" && entry.state === "AVAILABLE_NOW")
      .map((entry) => entry.capability);
    expect(fields).toEqual(expect.arrayContaining([
      "schedule", "game_identity", "team_ids", "conferences", "venue",
      "neutral_site", "status", "scores",
    ]));
  });

  it("does not represent market evidence as football intelligence", () => {
    const markets = NCAAF_PROVIDER_CAPABILITIES.filter((entry) => entry.provider === "odds_api");
    expect(markets.every((entry) => entry.evidence.includes("market"))).toBe(true);
    expect(getNcaafReadinessBlockers(["player", "play_level_epa"]))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ capability: "player", state: "NOT_SUPPORTED" }),
        expect.objectContaining({ capability: "play_level_epa", state: "NOT_SUPPORTED" }),
      ]));
  });

  it("marks weather and historical PIT according to wired NCAAF behavior", () => {
    expect(getNcaafReadinessBlockers(["current_weather", "historical_point_in_time"]))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ provider: "open_meteo", capability: "current_weather", state: "REQUIRES_PROVIDER" }),
        expect.objectContaining({ capability: "historical_point_in_time", pointInTimeState: "NOT_SUPPORTED" }),
      ]));
    expect(NCAAF_CAPABILITY_STATES).toEqual([
      "AVAILABLE_NOW", "AVAILABLE_BUT_NOT_CAPTURED", "PARTIAL",
      "REQUIRES_PROVIDER", "NOT_SUPPORTED",
    ]);
  });
});