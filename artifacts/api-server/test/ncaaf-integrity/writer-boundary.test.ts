import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// These source-boundary checks deliberately do not import application services
// or connect to a database. The separate local PostgreSQL suite tests the
// actual reconciler, row locks, narrow grants and transactional persistence.
const source = (path: string) => readFileSync(new URL(`../../src/${path}`, import.meta.url), "utf8");

describe("NCAA final writer entrypoint boundaries", () => {
  it("routes discovery finals through the NCAA reconciler, not the bulk fixture upsert", () => {
    const text = source("services/v4FullSlate.ts");
    expect(text).toContain('uniqueProviderGames.filter(game => game.sport !== "NCAAF" || game.status !== "final")');
    expect(text).toContain("await persistNcaafFetchedFinal(game, async (tx, pending)");
    expect(text).toContain('setWhere: sport === "NCAAF" ? ne(gamesTable.status, "final") : undefined');
    expect(text).toContain('providerGames.filter(game => game.sport === "NCAAF" && game.status === "final")');
    expect(text).toContain("conflictingNcaafFinalIds(ncaaFinals)");
  });
  it("exits the legacy snapshot score-only writer before any NCAA database access", () => {
    const text = source("services/snapshot.ts").split("async function writeGameResult")[1]!;
    const guard = text.indexOf('if (game.sport === "NCAAF")');
    const writer = text.indexOf("await persistNcaafFetchedFinal(game)");
    const legacy = text.indexOf("await db");
    expect(guard).toBeGreaterThan(0);
    expect(writer).toBeGreaterThan(guard);
    expect(legacy).toBeGreaterThan(writer);
    expect(text.slice(writer, legacy)).toContain("return;");
  });
  it("keeps the refresh path's final-state guard and NCAA reconciler", () => {
    const text = source("routes/games.ts");
    expect(text).toContain('game.sport === "NCAAF" ? ne(gamesTable.status, "final")');
    expect(text).toContain("await persistNcaafFetchedFinal(game, writeFixture");
  });
  it("excludes NCAA from generic result backfill and reconciles source-backed observations", () => {
    const text = source("services/grading-runner.ts");
    expect(text).toContain('.filter(g => g.sport !== "NCAAF")');
    expect(text).toContain("await persistNcaafFetchedFinal(observation");
    expect(text).toContain('ncaaDateRequests++ >= 8');
  });
});
