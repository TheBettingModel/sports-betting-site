import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computePitcherAdvantage,
  getProbablePitchers,
  makePitcherGameKey,
  resolveProbablePitcherMatch,
  type PitcherStats,
} from "./mlbPitchers";

function pitcher(overrides: Partial<PitcherStats>): PitcherStats {
  return {
    name: "Starter",
    playerId: 1,
    pitchHand: "R",
    seasonEra: 3.5,
    seasonWhip: 1.15,
    fip: 3.5,
    kPct: 0.25,
    bbPct: 0.08,
    kMinusBbPct: 0.17,
    recentEra: 3.5,
    recentIpAvg: 6,
    seasonIp: 80,
    seasonBattersFaced: 320,
    recentPitchCountAvg: 92,
    recentStartCount: 3,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MLB starter reliability", () => {
  it("uses the three most recent starts when the MLB game log is oldest first", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-08-25T12:00:00.000Z"));
    const date = "2099-08-25";
    const start = "2099-08-25T23:10:00.000Z";
    const seasonStat = {
      era: "3.95",
      whip: "1.10",
      inningsPitched: "139.0",
      strikeOuts: 160,
      battersFaced: 540,
      homeRuns: 12,
      baseOnBalls: 30,
      numberOfPitches: 95,
    };
    const chronologicalLog = [
      { date: "2099-03-26", stat: { ...seasonStat, era: "67.50", inningsPitched: "0.2" } },
      { date: "2099-04-01", stat: { ...seasonStat, era: "9.53", inningsPitched: "5.0" } },
      { date: "2099-04-07", stat: { ...seasonStat, era: "5.25", inningsPitched: "6.1" } },
      { date: "2099-08-05", stat: { ...seasonStat, era: "3.96", inningsPitched: "5.0" } },
      { date: "2099-08-11", stat: { ...seasonStat, era: "3.88", inningsPitched: "5.0" } },
      { date: "2099-08-19", stat: { ...seasonStat, era: "3.95", inningsPitched: "4.1" } },
    ];

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/schedule?")) {
        return new Response(JSON.stringify({
          dates: [{ games: [{
            gameDate: start,
            season: "2099",
            teams: {
              home: { team: { id: 111 }, probablePitcher: { id: 1, fullName: "Home Starter" } },
              away: { team: { id: 110 }, probablePitcher: { id: 2, fullName: "Away Starter" } },
            },
          }] }],
        }));
      }
      if (url.includes("/people?personIds=")) {
        return new Response(JSON.stringify({
          people: [{ id: 1, pitchHand: { code: "R" } }, { id: 2, pitchHand: { code: "L" } }],
        }));
      }
      const pitcherId = Number(url.match(/\/people\/(\d+)\/stats/)?.[1]);
      return new Response(JSON.stringify({
        stats: [
          { type: { displayName: "season" }, splits: [{ stat: seasonStat, player: { id: pitcherId } }] },
          {
            type: { displayName: "gameLog" },
            splits: chronologicalLog.map((split) => ({ ...split, player: { id: pitcherId } })),
          },
        ],
      }));
    }));

    const starters = await getProbablePitchers("BOS", "BAL", date, start);

    // The latest three cumulative ERAs are 3.96, 3.88, and 3.95. The old
    // oldest-first selection would have incorrectly produced 27.43 instead.
    expect(starters.home?.recentEra).toBeCloseTo((3.96 + 3.88 + 3.95) / 3, 6);
    expect(starters.home?.seasonEra).toBe(3.95);
  });

  it("shrinks the same skill gap when either starter has a thin workload sample", () => {
    const established = computePitcherAdvantage({
      home: pitcher({ fip: 2.8, recentEra: 2.9, kMinusBbPct: 0.23 }),
      away: pitcher({ fip: 4.8, recentEra: 4.9, kMinusBbPct: 0.10 }),
    });
    const thinSample = computePitcherAdvantage({
      home: pitcher({
        fip: 2.8,
        recentEra: 2.9,
        kMinusBbPct: 0.23,
        seasonIp: 4,
        seasonBattersFaced: 16,
        recentPitchCountAvg: 58,
        recentStartCount: 1,
      }),
      away: pitcher({ fip: 4.8, recentEra: 4.9, kMinusBbPct: 0.10 }),
    });

    expect(established).toBeGreaterThan(0);
    expect(thinSample).toBeGreaterThan(0);
    expect(thinSample).toBeLessThan(established);
  });

  it("excludes a pitcher with a malformed official stat instead of using league-average defaults", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-08-26T12:00:00.000Z"));
    const date = "2099-08-26";
    const start = "2099-08-26T23:10:00.000Z";
    const completeStat = {
      era: "3.50", whip: "1.15", inningsPitched: "80.0", strikeOuts: 90,
      battersFaced: 320, homeRuns: 10, baseOnBalls: 25, numberOfPitches: 90,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/schedule?")) {
        return new Response(JSON.stringify({ dates: [{ games: [{
          gameDate: start, season: "2099",
          teams: {
            home: { team: { id: 111 }, probablePitcher: { id: 1, fullName: "Home Starter" } },
            away: { team: { id: 110 }, probablePitcher: { id: 2, fullName: "Away Starter" } },
          },
        }] }] }));
      }
      if (url.includes("/people?personIds=")) {
        return new Response(JSON.stringify({ people: [] }));
      }
      const pitcherId = Number(url.match(/\/people\/(\d+)\/stats/)?.[1]);
      const stat = pitcherId === 1 ? { ...completeStat, era: "not-a-number" } : completeStat;
      return new Response(JSON.stringify({
        stats: [
          { type: { displayName: "season" }, splits: [{ stat, player: { id: pitcherId } }] },
          { type: { displayName: "gameLog" }, splits: [{ date: "2099-08-20", stat: completeStat, player: { id: pitcherId } }] },
        ],
      }));
    }));

    const starters = await getProbablePitchers("BOS", "BAL", date, start);

    expect(starters.home).toBeNull();
    expect(starters.away?.seasonEra).toBe(3.5);
    expect(starters.qualityReasons).toContain("home_starter_stats_malformed_or_incomplete");
    expect(computePitcherAdvantage(starters)).toBe(0);
  });

  it("excludes a pitcher when MLB returns game-log stats for a different player identity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-08-27T12:00:00.000Z"));
    const date = "2099-08-27";
    const start = "2099-08-27T23:10:00.000Z";
    const completeStat = {
      era: "3.50", whip: "1.15", inningsPitched: "80.0", strikeOuts: 90,
      battersFaced: 320, homeRuns: 10, baseOnBalls: 25, numberOfPitches: 90,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/schedule?")) {
        return new Response(JSON.stringify({ dates: [{ games: [{
          gameDate: start, season: "2099",
          teams: {
            home: { team: { id: 111 }, probablePitcher: { id: 1, fullName: "Home Starter" } },
            away: { team: { id: 110 }, probablePitcher: { id: 2, fullName: "Away Starter" } },
          },
        }] }] }));
      }
      if (url.includes("/people?personIds=")) {
        return new Response(JSON.stringify({ people: [] }));
      }
      const pitcherId = Number(url.match(/\/people\/(\d+)\/stats/)?.[1]);
      return new Response(JSON.stringify({
        stats: [
          {
            type: { displayName: "season" },
            splits: [{ stat: completeStat, player: { id: pitcherId } }],
          },
          {
            type: { displayName: "gameLog" },
            splits: [{ date: "2099-08-20", stat: completeStat, player: { id: pitcherId === 1 ? 999 : pitcherId } }],
          },
        ],
      }));
    }));

    const starters = await getProbablePitchers("BOS", "BAL", date, start);

    expect(starters.home).toBeNull();
    expect(starters.away?.seasonEra).toBe(3.5);
    expect(starters.qualityReasons).toContain("home_starter_stats_identity_mismatch");
  });

  it("marks a failed individual stats request unavailable instead of manufacturing average stats", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-08-28T12:00:00.000Z"));
    const date = "2099-08-28";
    const start = "2099-08-28T23:10:00.000Z";
    const completeStat = {
      era: "3.50", whip: "1.15", inningsPitched: "80.0", strikeOuts: 90,
      battersFaced: 320, homeRuns: 10, baseOnBalls: 25, numberOfPitches: 90,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/schedule?")) {
        return new Response(JSON.stringify({ dates: [{ games: [{
          gameDate: start, season: "2099",
          teams: {
            home: { team: { id: 111 }, probablePitcher: { id: 1, fullName: "Home Starter" } },
            away: { team: { id: 110 }, probablePitcher: { id: 2, fullName: "Away Starter" } },
          },
        }] }] }));
      }
      if (url.includes("/people?personIds=")) {
        return new Response(JSON.stringify({ people: [] }));
      }
      const pitcherId = Number(url.match(/\/people\/(\d+)\/stats/)?.[1]);
      if (pitcherId === 1) return new Response("upstream unavailable", { status: 503 });
      return new Response(JSON.stringify({
        stats: [
          { type: { displayName: "season" }, splits: [{ stat: completeStat, player: { id: pitcherId } }] },
          { type: { displayName: "gameLog" }, splits: [{ date: "2099-08-20", stat: completeStat, player: { id: pitcherId } }] },
        ],
      }));
    }));

    const starters = await getProbablePitchers("BOS", "BAL", date, start);

    expect(starters.home).toBeNull();
    expect(starters.away?.seasonEra).toBe(3.5);
    expect(starters.qualityReasons).toContain("home_starter_stats_fetch_failed");
    expect(computePitcherAdvantage(starters)).toBe(0);
  });

  it("limits concurrent pitcher-stat validation without blocking complete games", async () => {
    const date = "2099-08-29";
    const starts = ["20:00", "21:00", "22:00", "23:00"];
    const completeStat = {
      era: "3.50", whip: "1.15", inningsPitched: "80.0", strikeOuts: 90,
      battersFaced: 320, homeRuns: 10, baseOnBalls: 25, numberOfPitches: 90,
    };
    let activeStatRequests = 0;
    let maxConcurrentStatRequests = 0;

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/schedule?")) {
        return new Response(JSON.stringify({
          dates: [{
            games: starts.map((time, index) => ({
              gameDate: `2099-08-29T${time}:00.000Z`,
              season: "2099",
              teams: {
                home: {
                  team: { id: 111 },
                  probablePitcher: { id: 100 + index * 2, fullName: `Home Starter ${index}` },
                },
                away: {
                  team: { id: 110 },
                  probablePitcher: { id: 101 + index * 2, fullName: `Away Starter ${index}` },
                },
              },
            })),
          }],
        }));
      }
      if (url.includes("/people?personIds=")) {
        return new Response(JSON.stringify({ people: [] }));
      }

      const pitcherId = Number(url.match(/\/people\/(\d+)\/stats/)?.[1]);
      activeStatRequests++;
      maxConcurrentStatRequests = Math.max(maxConcurrentStatRequests, activeStatRequests);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeStatRequests--;
      return new Response(JSON.stringify({
        stats: [
          { type: { displayName: "season" }, splits: [{ stat: completeStat, player: { id: pitcherId } }] },
          { type: { displayName: "gameLog" }, splits: [{ date: "2099-08-28", stat: completeStat, player: { id: pitcherId } }] },
        ],
      }));
    }));

    const starters = await getProbablePitchers(
      "BOS",
      "BAL",
      date,
      "2099-08-29T20:00:00.000Z",
    );

    expect(maxConcurrentStatRequests).toBe(4);
    expect(starters.home?.name).toBe("Home Starter 0");
    expect(starters.away?.name).toBe("Away Starter 0");
  });

  it("matches a unique same-team game when provider start times drift slightly", () => {
    const actualStart = "2026-08-23T23:10:00.000Z";
    const schedule = new Map([
      [makePitcherGameKey("BOS", "BAL", actualStart)!, {
        home: pitcher({ name: "Home Starter" }),
        away: pitcher({ name: "Away Starter" }),
      }],
    ]);

    const match = resolveProbablePitcherMatch(
      schedule,
      "BOS",
      "BAL",
      "2026-08-23T23:40:00.000Z",
    );

    expect(match.matchType).toBe("time_tolerance");
    expect(match.starters?.home?.name).toBe("Home Starter");
    expect(match.starters?.away?.name).toBe("Away Starter");
  });

  it("refuses an ambiguous doubleheader match instead of assigning the wrong starters", () => {
    const early = "2026-08-23T17:00:00.000Z";
    const late = "2026-08-23T19:00:00.000Z";
    const schedule = new Map([
      [makePitcherGameKey("BOS", "BAL", early)!, {
        home: pitcher({ name: "Early Home" }),
        away: pitcher({ name: "Early Away" }),
      }],
      [makePitcherGameKey("BOS", "BAL", late)!, {
        home: pitcher({ name: "Late Home" }),
        away: pitcher({ name: "Late Away" }),
      }],
    ]);

    const match = resolveProbablePitcherMatch(
      schedule,
      "BOS",
      "BAL",
      "2026-08-23T18:00:00.000Z",
    );

    expect(match.matchType).toBe("ambiguous");
    expect(match.starters).toBeNull();
  });

  it("refuses a non-equidistant doubleheader fallback instead of choosing the nearest game", () => {
    const first = "2026-08-23T17:00:00.000Z";
    const second = "2026-08-23T18:30:00.000Z";
    const schedule = new Map([
      [makePitcherGameKey("BOS", "BAL", first)!, {
        home: pitcher({ name: "First Home" }),
        away: pitcher({ name: "First Away" }),
      }],
      [makePitcherGameKey("BOS", "BAL", second)!, {
        home: pitcher({ name: "Second Home" }),
        away: pitcher({ name: "Second Away" }),
      }],
    ]);

    const match = resolveProbablePitcherMatch(
      schedule,
      "BOS",
      "BAL",
      "2026-08-23T17:45:00.000Z",
    );

    expect(match.matchType).toBe("ambiguous");
    expect(match.starters).toBeNull();
  });

  it("retains a matched game with missing starters so the normal short retry policy can refresh it", () => {
    const start = "2026-08-23T23:10:00.000Z";
    const schedule = new Map([
      [makePitcherGameKey("BOS", "BAL", start)!, {
        home: pitcher({ name: "Confirmed Home" }),
        away: null,
      }],
    ]);

    const match = resolveProbablePitcherMatch(schedule, "BOS", "BAL", start);

    expect(match.matchType).toBe("exact");
    expect(match.starters?.home?.name).toBe("Confirmed Home");
    expect(match.starters?.away).toBeNull();
  });

  it("retries incomplete official schedule data before first pitch and uses newly published starters", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-07-04T12:00:00.000Z"));
    const date = "2099-07-04";
    const start = "2099-07-04T23:10:00.000Z";
    let scheduleCalls = 0;
    const completeStat = {
      era: "3.50",
      whip: "1.15",
      inningsPitched: "80.0",
      strikeOuts: 90,
      battersFaced: 320,
      homeRuns: 10,
      baseOnBalls: 25,
      numberOfPitches: 90,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/schedule?")) {
        scheduleCalls++;
        const hasPublishedStarters = scheduleCalls > 1;
        return new Response(JSON.stringify({
          dates: [
            { games: [] },
            { games: [{
              gameDate: start,
              season: "2099",
              teams: {
                home: {
                  team: { id: 111 },
                  ...(hasPublishedStarters ? { probablePitcher: { id: 1, fullName: "Home Starter" } } : {}),
                },
                away: {
                  team: { id: 110 },
                  probablePitcher: { id: 2, fullName: "Away Starter" },
                },
              },
            }] },
          ],
        }));
      }
      if (url.includes("/people?personIds=")) {
        return new Response(JSON.stringify({
          people: [{ id: 1, pitchHand: { code: "R" } }, { id: 2, pitchHand: { code: "L" } }],
        }));
      }
      const pitcherId = Number(url.match(/\/people\/(\d+)\/stats/)?.[1]);
      return new Response(JSON.stringify({
        stats: [
          { type: { displayName: "season" }, splits: [{ stat: completeStat, player: { id: pitcherId } }] },
          { type: { displayName: "gameLog" }, splits: [{ date: "2099-07-03", stat: completeStat, player: { id: pitcherId } }] },
        ],
      }));
    }));

    const initiallyMissing = await getProbablePitchers("BOS", "BAL", date, start);
    expect(initiallyMissing.home).toBeNull();
    expect(initiallyMissing.away?.name).toBe("Away Starter");

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1);
    const refreshed = await getProbablePitchers("BOS", "BAL", date, start);

    expect(scheduleCalls).toBe(2);
    expect(refreshed.home?.name).toBe("Home Starter");
    expect(refreshed.away?.name).toBe("Away Starter");
  });
});