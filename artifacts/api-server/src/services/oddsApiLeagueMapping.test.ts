import { describe, expect, it } from "vitest";
import { resolveOddsApiKey } from "./oddsApi";
describe("existing Soccer slate sportsbook sources", () => {
  it.each([
    ["MLS", "soccer_usa_mls"], ["Eredivisie", "soccer_netherlands_eredivisie"],
    ["Süper Lig", "soccer_turkey_super_league"], ["EPL", "soccer_epl"],
    ["La Liga", "soccer_spain_la_liga"], ["Bundesliga", "soccer_germany_bundesliga"],
    ["Serie A", "soccer_italy_serie_a"], ["Ligue 1", "soccer_france_ligue_one"],
    ["UCL", "soccer_uefa_champs_league"],
  ])("resolves the working schedule's %s label without an MLS fallback", (league, key) => {
    expect(resolveOddsApiKey("Soccer", league)).toBe(key);
  });
  it("fails closed for unknown leagues", () => expect(resolveOddsApiKey("Soccer", "Unknown")).toBeNull());
});