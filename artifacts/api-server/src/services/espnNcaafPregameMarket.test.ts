import { describe, expect, it } from "vitest";
import { parseEspnNcaafPregameMarket } from "./espnNcaafPregameMarket";

describe("ESPN NCAAF pregame market", () => {
  it("parses the home-side spread and total after validating team identity", () => {
    const market = parseEspnNcaafPregameMarket({
      pickcenter: [{
        provider: { name: "DraftKings" },
        spread: 20.5,
        overUnder: 55.5,
        homeTeamOdds: { teamId: "154" },
        awayTeamOdds: { teamId: "2390" },
      }],
    }, "154", "2390");

    expect(market).toEqual({
      homeSpread: 20.5,
      total: 55.5,
      provider: "DraftKings",
    });
  });

  it("rejects a market attached to different participants", () => {
    expect(parseEspnNcaafPregameMarket({
      pickcenter: [{
        spread: -57.5,
        overUnder: 67.5,
        homeTeamOdds: { teamId: "wrong" },
        awayTeamOdds: { teamId: "2502" },
      }],
    }, "2483", "2502")).toBeNull();
  });
});