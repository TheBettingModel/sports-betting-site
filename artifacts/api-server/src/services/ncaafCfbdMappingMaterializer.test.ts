import { describe, expect, it } from "vitest";
import { decideCfbdTeamMapping } from "./ncaafCfbdIdentity";
import {
  cfbdTeamIdentitiesFromGames,
  reuseTrustedCrossSeasonTeamMapping,
  trustedCrossSeasonTeamMappings,
} from "./ncaafCfbdMappingMaterializer";

const trusted = {
  cfbdTeamId: "333",
  canonicalProvider: "espn",
  canonicalTeamId: "333",
  school: "Alabama",
  classification: "FBS",
};

describe("NCAAF CFBD mapping materializer", () => {
  it("reuses a corroborated equal provider ID across seasons with exact school identity", () => {
    const team = { id: "333", school: "Alabama", classification: "FBS" };
    const original = decideCfbdTeamMapping(team, []);
    expect(reuseTrustedCrossSeasonTeamMapping(team, original, trusted)).toMatchObject({
      state: "MAPPED",
      canonicalProvider: "espn",
      canonicalTeamId: "333",
      mappingMethod: "EXACT_PROVIDER_ID",
    });
  });

  it("fails closed for school, classification, or provider-ID conflicts", () => {
    const original = decideCfbdTeamMapping({ id: "333", school: "Miami" }, []);
    expect(reuseTrustedCrossSeasonTeamMapping(
      { id: "333", school: "Miami" },
      original,
      trusted,
    ).state).toBe("UNMAPPED");
    expect(reuseTrustedCrossSeasonTeamMapping(
      { id: "333", school: "Alabama", classification: "FCS" },
      original,
      trusted,
    ).state).toBe("UNMAPPED");
    expect(reuseTrustedCrossSeasonTeamMapping(
      { id: "333", school: "Alabama" },
      original,
      trusted,
    ).state).toBe("UNMAPPED");
    expect(reuseTrustedCrossSeasonTeamMapping(
      { id: "333", school: "Alabama", classification: "FBS" },
      original,
      { ...trusted, classification: null },
    ).state).toBe("UNMAPPED");
    expect(reuseTrustedCrossSeasonTeamMapping(
      { id: "333", school: "Alabama", classification: "FBS" },
      original,
      { ...trusted, canonicalTeamId: "999" },
    ).state).toBe("UNMAPPED");
  });

  it("builds trust from persisted mapping and team-ledger classification evidence", () => {
    const mappings = trustedCrossSeasonTeamMappings(
      [{ cfbdTeamId: "333", canonicalProvider: "espn", canonicalTeamId: "333", evidence: { school: "Alabama" } }],
      [{
        id: 1, season: 2026, endpoint: "teams", cfbdTeamId: "333",
        providerEffectiveAt: null, capturedAt: new Date(), payload: { school: "Alabama", classification: "fbs" },
      }],
    );
    expect(mappings.get("333")).toMatchObject({ school: "alabama", classification: "FBS" });
    const conflict = trustedCrossSeasonTeamMappings(
      [{ cfbdTeamId: "333", canonicalProvider: "espn", canonicalTeamId: "333", evidence: { school: "Alabama" } }],
      [
        { id: 1, season: 2025, endpoint: "teams", cfbdTeamId: "333", providerEffectiveAt: null, capturedAt: new Date(), payload: { school: "Alabama", classification: "fbs" } },
        { id: 2, season: 2026, endpoint: "teams", cfbdTeamId: "333", providerEffectiveAt: null, capturedAt: new Date(), payload: { school: "Alabama", classification: "fcs" } },
      ],
    );
    expect(conflict.has("333")).toBe(false);
  });

  it("derives exact historical classification from persisted CFBD game payloads", () => {
    const teams = cfbdTeamIdentitiesFromGames([{
      id: 1, provider: "college_football_data", providerEventId: "401", season: 2024,
      capturedAt: new Date(), kickoffAt: new Date(), homeProviderTeamId: "333",
      awayProviderTeamId: "57", homeTeamName: "Alabama", awayTeamName: "Florida",
      neutralSite: false,
      payload: { game: { homeClassification: "fbs", awayClassification: "fbs" } },
    }]);
    expect(teams).toEqual([
      { id: "333", school: "Alabama", classification: "fbs" },
      { id: "57", school: "Florida", classification: "fbs" },
    ]);
  });
});