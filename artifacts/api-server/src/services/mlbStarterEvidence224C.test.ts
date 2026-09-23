import { describe, expect, it } from "vitest";
import {
  buildStarterEvidence,
  collectProspectiveOfficialMlbStarterEvidence,
  deterministicChecksum,
  failed224CResearchDisposition,
  MLB_STARTER_EVIDENCE_STATES,
  officialScheduleUrl,
  type StarterEvidenceRow,
} from "./mlbStarterEvidence224C";
import { MLB_HISTORICAL_APPEND_ONLY_TABLES } from "./mlbHistoricalAppendOnly";

const now = new Date("2026-04-10T12:00:00.000Z");
const game = (id: number, date = "2026-04-10T18:00:00Z", home: unknown = { id: 11, fullName: "Home" }) => ({
  gamePk: id, gameDate: date,
  teams: { home: { team: { id: 1 }, probablePitcher: home }, away: { team: { id: 2 } } },
});

describe("MLB #224C prospective starter evidence", () => {
  it("uses official IDs, creates both slots including UNKNOWN, and contains no market fields", () => {
    const rows = buildStarterEvidence(game(1), now);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.teamSide, row.officialTeamId, row.starterState]))
      .toEqual([["HOME", "1", "PROBABLE_PREGAME"], ["AWAY", "2", "UNKNOWN"]]);
    expect(rows.every((row) => row.pitSafe && row.featureCutoff.getTime() === row.scheduledFirstPitch.getTime())).toBe(true);
    expect(rows[0]).toMatchObject({
      sourceRecordId: "1:1:HOME",
      sourceTimestamp: null,
      effectiveAt: null,
      tbmGameId: null,
      officialOpponentTeamId: "2",
      metricsState: "IDENTITY_ONLY",
      metricsThroughTime: null,
      starterPitMetrics: {},
      recentWorkload: {},
      sampleSizes: {},
      identityProvenance: { strategy: "OFFICIAL_STABLE_IDS", nameOnly: false },
    });
    expect(JSON.stringify(rows)).not.toMatch(/odds|market|sportsbook/i);
  });

  it("enforces the strict first-pitch cutoff and ignores actual-only fields", () => {
    expect(buildStarterEvidence(game(1, now.toISOString()), now)).toEqual([]);
    const actualOnly = {
      gamePk: 2, gameDate: "2026-04-10T18:00:00Z",
      teams: {
        home: { team: { id: 1 }, startingPitcher: { id: 99 } },
        away: { team: { id: 2 } },
      },
    };
    expect(buildStarterEvidence(actualOnly, now)[0]?.starterState).toBe("UNKNOWN");
  });

  it("marks malformed identity ambiguous and hashes deterministically", () => {
    const rows = buildStarterEvidence(game(1, undefined, { fullName: "No Id" }), now);
    expect(rows[0]).toMatchObject({ starterState: "AMBIGUOUS", identityState: "AMBIGUOUS", pitSafe: true });
    expect(deterministicChecksum({ b: 1, a: 2 })).toBe(deterministicChecksum({ a: 2, b: 1 }));
  });

  it("keeps identity stable through name changes, trades, rookies, and doubleheader legs", () => {
    const traded = buildStarterEvidence(game(10, undefined, { id: 700001, fullName: "Name Before Trade" }), now);
    const renamed = buildStarterEvidence(game(10, undefined, { id: 700001, fullName: "Name After Trade" }), now);
    const rookie = buildStarterEvidence(game(11, undefined, { id: 799999, fullName: "Rookie" }), now);
    expect(traded[0]?.officialPlayerId).toBe(renamed[0]?.officialPlayerId);
    expect(traded[0]?.evidenceStateHash).not.toBe(renamed[0]?.evidenceStateHash);
    expect(rookie[0]).toMatchObject({ officialGameId: "11", officialPlayerId: "799999" });
    expect(traded[0]?.officialGameId).not.toBe(rookie[0]?.officialGameId);
  });

  it("defines every required evidence state without collapsing actual-only into pregame", () => {
    expect(MLB_STARTER_EVIDENCE_STATES).toEqual([
      "CONFIRMED_PREGAME", "PROJECTED_PREGAME", "PROBABLE_PREGAME",
      "ACTUAL_ONLY", "UNKNOWN", "AMBIGUOUS", "MISSED_PREGAME_CAPTURE",
    ]);
    expect(MLB_STARTER_EVIDENCE_STATES.indexOf("ACTUAL_ONLY"))
      .not.toBe(MLB_STARTER_EVIDENCE_STATES.indexOf("CONFIRMED_PREGAME"));
  });

  it("makes one schedule call, handles doubleheaders, no-ops unchanged payloads, and appends changes", async () => {
    let calls = 0; const stored = new Set<string>(); const appended: StarterEvidenceRow[][] = [];
    const collect = (games: ReturnType<typeof game>[]) => collectProspectiveOfficialMlbStarterEvidence("2026-04-10", {
      now,
      client: { async getSchedule(url) { calls++; expect(url).toBe(officialScheduleUrl("2026-04-10")); return { dates: [{ games }] }; } },
      repository: {
        async existingStateHashes() { return stored; },
        async append(rows) {
          appended.push([...rows]);
          rows.forEach((r) => stored.add(`${r.officialGameId}:${r.evidenceStateHash}`));
          return rows.length;
        },
      },
    });
    expect((await collect([game(1), game(2)])).inserted).toBe(4);
    expect((await collect([game(1), game(2)])).inserted).toBe(0);
    expect((await collect([game(1, undefined, { id: 88, fullName: "Changed" }), game(2)])).inserted).toBe(2);
    expect(calls).toBe(3);
  });

  it("rejects historical requests rather than calling a retrospective API", async () => {
    await expect(collectProspectiveOfficialMlbStarterEvidence("2026-04-09", {
      now, client: { async getSchedule() { throw new Error("must not call"); } },
      repository: { async existingStateHashes() { return new Set(); }, async append() { return 0; } },
    })).rejects.toThrow(/current\/future UTC dates only/);
  });

  it("timestamps response receipt and skips a game when a slow call crosses first pitch", async () => {
    const times = [
      new Date("2026-04-10T12:00:00.000Z"),
      new Date("2026-04-10T18:00:00.001Z"),
    ];
    const result = await collectProspectiveOfficialMlbStarterEvidence("2026-04-10", {
      clock: () => times.shift()!,
      client: { async getSchedule() { return { dates: [{ games: [game(1)] }] }; } },
      repository: {
        async existingStateHashes() { return new Set(); },
        async append(rows) { return rows.length; },
      },
    });
    expect(result).toEqual({
      requestedDate: "2026-04-10", inserted: 0,
      skippedUnchangedGames: 0, skippedAfterCutoffGames: 1,
    });
  });

  it("lists the two new evidence ledgers in append-only guard protection", () => {
    expect(MLB_HISTORICAL_APPEND_ONLY_TABLES).toEqual(expect.arrayContaining([
      "mlb_pregame_starter_evidence_snapshots",
      "mlb_research_experiment_disposition_ledger",
    ]));
    expect(failed224CResearchDisposition(now, { priorArtifact: "read-only" })).toMatchObject({
      experimentId: "MLB_224C", experimentVersion: "v3",
      disposition: "RESEARCH_FAILED_NOT_COMPETITIVE",
      oosUse: "HISTORICAL_BENCHMARK_ONLY",
    });
  });
});