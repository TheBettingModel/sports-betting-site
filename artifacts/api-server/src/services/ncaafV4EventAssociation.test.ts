import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  snapshots: [] as any[], evidence: [] as any[], games: [] as any[], markets: [] as any[],
  inserted: [] as { table: string; rows: any[] }[],
}));
vi.mock("@workspace/db", async (original) => {
  const schema = await original<typeof import("@workspace/db")>();
  return { ...schema, db: {
    select: (fields?: unknown) => ({ from: (table: unknown) => ({ where: async () => {
      if (table === schema.ncaafGameEvidenceTable) return fields ? fixture.evidence : [];
      if (table === schema.gamesTable) return fixture.games;
      if (table === schema.ncaafMarketObservationsTable) return fixture.markets;
      if (table === schema.ncaafV4GameDayPredictionsTable) return fixture.inserted
        .filter(entry => entry.table === "predictions").flatMap(entry => entry.rows)
        .map((row, index) => ({ id: index + 1, predictionId: row.predictionId }));
      return [];
    } }) }),
    insert: (table: unknown) => ({ values: (rows: any[]) => ({ onConflictDoNothing: async () => {
      fixture.inserted.push({ table: table === schema.ncaafV4GameDayPredictionsTable ? "predictions" : "markets", rows });
    } }) }),
  } };
});
vi.mock("./ncaafLiveSnapshots", () => ({ latestNcaafPregameSnapshotsQuery: async () => fixture.snapshots }));
vi.mock("./ncaafV42026FeatureBridge", async (original) => ({
  ...await original<typeof import("./ncaafV42026FeatureBridge")>(),
  buildNcaafV42026FeatureBridge: (args: any) => {
    const inputs = args.snapshots.map((snapshot: any) => ({
      stableGameId: `${snapshot.targetProvider}:${snapshot.targetEventId}`, season: 2026, week: 6,
      kickoffAt: snapshot.kickoffAt.toISOString(), featureCutoff: snapshot.dataCutoffAt.toISOString(),
      checksum: `snapshot-${snapshot.id}`, sourceAudit: { snapshotId: snapshot.id, targetProvider: snapshot.targetProvider, targetEventId: snapshot.targetEventId },
      features: { home: { seasonToDate: { games: 3, offensePointsPerGame: 30, defensePointsAllowedPerGame: 20 }, priorSeason: { offensePointsPerGame: 28, defensePointsAllowedPerGame: 23 } },
        away: { seasonToDate: { games: 3, offensePointsPerGame: 24, defensePointsAllowedPerGame: 25 }, priorSeason: { offensePointsPerGame: 25, defensePointsAllowedPerGame: 26 } },
        elo: { difference: 50 }, context: { homeField: true } },
    }));
    return { inputs, predictions: inputs.map((input: any, index: number) => ({
      gameId: input.stableGameId, snapshotId: args.snapshots[index].id, espnGameId: args.snapshots[index].targetEventId,
      cfbdHomeTeamId: args.snapshots[index].homeProviderTeamId, cfbdAwayTeamId: args.snapshots[index].awayProviderTeamId, predictionTimestamp: args.assessedAt.toISOString(),
    })), exclusions: [], audit: { snapshotsSeen: args.snapshots.length } };
  },
}));
import { clearNcaafV4GameDayCaches, getNcaafV4ProjectionBoard } from "./ncaafV4GameDay";
import { toSubscriberNcaafV4Board } from "../routes/ncaaf-v4";

const now = new Date("2026-10-03T17:45:44Z"), kickoffAt = new Date("2026-10-03T19:30:00Z");
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); clearNcaafV4GameDayCaches();
  fixture.inserted = [];
  const latest = { id: 2, schemaVersion: "test", season: 2026, week: 6, inputHash: "new", targetProvider: "espn", targetEventId: "401866431", homeProviderTeamId: "2050", awayProviderTeamId: "2649", kickoffAt, dataCutoffAt: new Date("2026-10-03T17:31:54Z") };
  fixture.snapshots = [{ ...latest, id: 1, inputHash: "old", targetEventId: "NCAAF-401866431", dataCutoffAt: new Date("2026-09-07T12:00:00Z") }, latest];
  fixture.evidence = [{ id: 10, provider: "espn", providerEventId: "NCAAF-401866431", homeProviderTeamId: "2050", awayProviderTeamId: "2649", kickoffAt, capturedAt: new Date("2026-10-03T17:00:00Z"), homeTeamName: "Ball State Cardinals", awayTeamName: "Toledo Rockets", neutralSite: false }];
  fixture.games = [{ id: "NCAAF-401866431", homeTeamId: "2050", awayTeamId: "2649", startsAt: kickoffAt, edge: 0 }];
  fixture.markets = ["Ball State Cardinals", "Toledo Rockets"].map(selection => ({
    id: selection.startsWith("Ball") ? 11 : 12, gameEvidenceId: 10, marketKey: "h2h", selection, price: -110, line: null,
    bookmakerProviderId: "book", bookmakerName: "Book", capturedAt: new Date("2026-10-03T17:40:00Z"),
    isMatchedToGame: true, marketIdentityStatus: "matched_exact",
    payload: { event: { sport_key: "americanfootball_ncaaf", commence_time: kickoffAt.toISOString(), home_team: "Ball State Cardinals", away_team: "Toledo Rockets" }, identity: { gameNeutralSite: false } },
  }));
  fixture.markets.push({ ...fixture.markets[0], id: 13, marketKey: "spreads", line: -3 },
    { ...fixture.markets[0], id: 14, marketKey: "totals", selection: "Over", line: 48 });
});
afterEach(() => vi.useRealTimers());

describe("NCAAF board event association and append-only persistence", () => {
  it("returns one newest alias forecast with verified names, markets and public canonical persistence", async () => {
    const result = await getNcaafV4ProjectionBoard("2026-10-03", now);
    expect(result.board).toHaveLength(1);
    const row = result.board[0];
    expect(row.gameId).toBe("espn:401866431");
    expect(row.homeTeam).toBe("Ball State Cardinals");
    expect(row.awayTeam).toBe("Toledo Rockets");
    expect(row.model.featureCutoff).toBe("2026-10-03T17:31:54.000Z");
    expect(row.market.moneyline?.homeOdds).toBe(-110);
    expect(row.market.moneyline?.awayOdds).toBe(-110);
    expect(toSubscriberNcaafV4Board(result).board).toHaveLength(1);
    const saved = fixture.inserted.find(entry => entry.table === "predictions")!.rows;
    expect(saved).toHaveLength(1);
    expect(saved[0].canonicalGameId).toBe("NCAAF-401866431");
    expect(saved[0].gameId).toBe("espn:401866431");
    expect(saved[0].sourceAudit.targetEventId).toBe("401866431");
    expect(saved[0].homeTeamId).toBe("2050");
    expect(saved[0].awayTeamId).toBe("2649");
    expect(fixture.inserted.find(entry => entry.table === "markets")?.rows).toHaveLength(4);
    expect(fixture.snapshots[0].targetEventId).toBe("NCAAF-401866431");
  });
  it("retains a numerical outlook but does not attach or persist conflicting public fixture metadata", async () => {
    fixture.games[0].startsAt = new Date("2026-10-03T15:00:00Z");
    const result = await getNcaafV4ProjectionBoard("2026-10-03", now);
    expect(result.board).toHaveLength(1);
    expect(Number.isFinite(result.board[0].model.expectedHomePoints)).toBe(true);
    expect(result.board[0].homeTeam).toBeNull();
    expect(result.board[0].awayTeam).toBeNull();
    expect(result.board[0].market.moneyline).toBeNull();
    expect(result.audit.identityConflicts).toEqual([{ gameId: "espn:401866431", reason: "PUBLIC_GAME_KICKOFF_CONFLICT" }]);
    expect(fixture.inserted).toHaveLength(0);
  });
  it("never uses old alias names or markets when newest ordered team IDs conflict", async () => {
    fixture.snapshots[1].homeProviderTeamId = "2649"; fixture.snapshots[1].awayProviderTeamId = "2050";
    const result = await getNcaafV4ProjectionBoard("2026-10-03", now);
    expect(result.board).toHaveLength(1);
    expect(result.audit.identityConflicts[0].reason).toBe("EVIDENCE_ORDERED_TEAM_CONFLICT");
    expect(result.board[0].homeTeam).toBeNull();
    expect(result.board[0].market.moneyline).toBeNull();
    expect(fixture.inserted).toHaveLength(0);
  });
});