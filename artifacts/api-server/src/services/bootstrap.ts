import { eq } from "drizzle-orm";
import {
  db,
  marketsTable,
  modelVersionsTable,
  sportsbooksTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

const SPORTS = ["NFL", "NBA", "MLB", "NHL", "WNBA", "Soccer", "UFC"] as const;

const SEED_MARKETS = [
  { slug: "moneyline", name: "Moneyline" },
  { slug: "spread", name: "Spread" },
  { slug: "total", name: "Total (Over/Under)" },
  { slug: "nrfi", name: "No Run First Inning" },
  { slug: "yrfi", name: "Yes Run First Inning" },
  { slug: "f5-moneyline", name: "First 5 Innings Moneyline" },
  { slug: "f5-total", name: "First 5 Innings Total" },
  { slug: "soccer-3way", name: "Soccer 3-Way Moneyline" },
];

export interface BootstrapIds {
  espnSportsbookId: number;
  marketIds: Record<string, number>;
  modelVersionIds: Record<string, number>; // sport → production modelVersion id
}

let _cache: BootstrapIds | null = null;

/**
 * Returns seeded reference IDs (markets, sportsbook, model versions).
 * Seeds missing rows on first call; results are cached in-process.
 */
export async function getBootstrapIds(): Promise<BootstrapIds> {
  if (_cache) return _cache;
  _cache = await runBootstrap();
  return _cache;
}

/** Invalidate cache (e.g. after a new model version is promoted). */
export function invalidateBootstrapCache(): void {
  _cache = null;
}

async function runBootstrap(): Promise<BootstrapIds> {
  // ── Sportsbook ────────────────────────────────────────────────────────────
  await db
    .insert(sportsbooksTable)
    .values({ slug: "espn", name: "ESPN (Consensus)", isSharp: false })
    .onConflictDoNothing();

  // ── Markets ───────────────────────────────────────────────────────────────
  for (const m of SEED_MARKETS) {
    await db
      .insert(marketsTable)
      .values({ slug: m.slug, name: m.name })
      .onConflictDoNothing();
  }

  // ── Model versions: one production entry per sport ────────────────────────
  for (const sport of SPORTS) {
    await db
      .insert(modelVersionsTable)
      .values({
        modelId: `tbm-${sport.toLowerCase()}-moneyline-v1`,
        sport,
        market: "moneyline",
        status: "production",
        notes: "Initial record-based win-probability model",
      })
      .onConflictDoNothing();
  }

  // ── Fetch IDs ─────────────────────────────────────────────────────────────
  const [espnBook] = await db
    .select()
    .from(sportsbooksTable)
    .where(eq(sportsbooksTable.slug, "espn"));

  if (!espnBook) throw new Error("Bootstrap: ESPN sportsbook not found after insert");

  const markets = await db.select().from(marketsTable);
  const marketIds: Record<string, number> = Object.fromEntries(
    markets.map((m) => [m.slug, m.id]),
  );

  const versions = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.status, "production"));
  const modelVersionIds: Record<string, number> = Object.fromEntries(
    versions.map((v) => [v.sport, v.id]),
  );

  logger.info(
    { markets: markets.length, modelVersions: versions.length },
    "Bootstrap complete",
  );

  return { espnSportsbookId: espnBook.id, marketIds, modelVersionIds };
}
