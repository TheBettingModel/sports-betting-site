import { describe, expect, it } from "vitest";
import { WNBA_TEAM_LOCATIONS } from "./wnbaContext";
import { getActiveWnbaSeason } from "./teamStats";

describe("WNBA context constants", () => {
  it("uses prior season before the summer league window and documented locations", () => {
    expect(getActiveWnbaSeason(new Date("2026-02-01T00:00:00Z"))).toBe(2025);
    expect(WNBA_TEAM_LOCATIONS["17"]).toMatchObject({ city: "Las Vegas, NV", timeZone: "America/Los_Angeles" });
  });
});