import { describe, expect, it, vi } from "vitest";
import {
  NCAAF_V2_CORE_BACKFILL_SEASONS,
  parseNcaafV2CoreBackfillCursor,
  runNcaafV2CoreBackfill,
} from "./ncaafV2CoreBackfill";
import { NCAAF_V2_TRAINING_CURSOR_VERSION } from "./ncaafV2TrainingMaterializer";

describe("NCAAF v2 core backfill", () => {
  it("is dry-run safe and validates resumable cursors", async () => {
    const output = await runNcaafV2CoreBackfill({ dryRun: true });
    expect(output).toMatchObject({ manualOnly: true, dryRun: true, seasons: [2023, 2024, 2025] });
    expect(() => parseNcaafV2CoreBackfillCursor({ offset: 0 })).toThrow(/cursor/);
    expect(parseNcaafV2CoreBackfillCursor({ version: NCAAF_V2_TRAINING_CURSOR_VERSION, offset: 3 })).toEqual({
      version: NCAAF_V2_TRAINING_CURSOR_VERSION, offset: 3,
    });
  });

  it("requests and appends each season sequentially before bounded materialization", async () => {
    const calls: string[] = [];
    const request = vi.fn(async (_endpoint: "games", query: { year: number }) => {
      calls.push(`request:${query.year}`);
      return { endpoint: "games", requestIdentity: String(query.year) } as never;
    });
    const append = vi.fn(async ({ season }: { season: number }) => {
      calls.push(`append:${season}`);
      return { rawInserted: 1, gamesInserted: 2, malformed: [] };
    });
    const materialize = vi.fn(async () => ({
      attempted: 1, inserted: 1, alreadyMaterialized: 0, totalEligible: 1,
      nextCursor: null, audit: { checksum: "audit" },
    })) as never;
    const result = await runNcaafV2CoreBackfill({}, { client: { request }, append: append as never, materialize });
    expect(calls).toEqual(NCAAF_V2_CORE_BACKFILL_SEASONS.flatMap((season) => [`request:${season}`, `append:${season}`]));
    expect(result).toMatchObject({ cfbd: { requested: 3, rawInserted: 3, gamesInserted: 6 }, materialization: { invocations: 1 } });
  });
});