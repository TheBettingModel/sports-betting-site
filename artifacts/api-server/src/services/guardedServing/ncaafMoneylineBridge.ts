import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import {
  db, marketsTable, modelVersionsTable, oddsSnapshotsTable, sportsbooksTable,
  gamesTable,
} from "@workspace/db";
import {
  ACTIONABLE_ODDS_CACHE_MAX_AGE_MS, displayBookName, getOddsForGameWithStatus, isValidAmericanOdds,
  type BookmakerLine, type GameOdds,
} from "../oddsApi";
import type { NcaafCandidateOutput } from "./ncaafCandidateExecutor";
import { getCurrentNcaafCandidateIdentity } from "./candidateRegistry";

export const NCAAF_MONEYLINE_BRIDGE_VERSION = "ncaaf-moneyline-bridge-v1";

export type NcaafMarketObservation = Readonly<{
  snapshotId: number;
  sportsbookId: number | null;
  sportsbook: string | null;
  source: string;
  providerEventId: string | null;
  selection: "home" | "away";
  price: number;
  capturedAt: string;
}>;

export type NcaafMoneylineBridge = Readonly<{
  persisted: false;
  bridgeVersion: typeof NCAAF_MONEYLINE_BRIDGE_VERSION;
  modelVersionId: number | null;
  market: NcaafMarketObservation | null;
  selection: "home" | "away";
  modelProbability: number;
  impliedProbability: number | null;
  edge: number | null;
  marketFresh: boolean;
  risk: { status: "UNAVAILABLE"; reason: "NO_COMPATIBLE_VALIDATED_NCAAF_RISK_POLICY" };
  finalRating: { status: "BLOCKED"; reason: "RISK_POLICY_OUTPUT_UNAVAILABLE" };
  pod: { status: "BLOCKED"; reason: "RISK_POLICY_OUTPUT_UNAVAILABLE" };
  publication: {
    ready: false;
    approval: { ready: false; reason: "NEXTGEN_NOT_APPROVED" };
    technicalReadiness: { ready: false; reasons: readonly string[] };
  };
  blockers: readonly string[];
}>;

export function americanImpliedProbability(price: number): number | null {
  if (!isValidAmericanOdds(price)) return null;
  return price < 0 ? Math.abs(price) / (Math.abs(price) + 100) : 100 / (price + 100);
}

/** Selects a complete two-sided quote from one named bookmaker, never consensus. */
export function selectExactNcaafBook(game: GameOdds): BookmakerLine | null {
  const complete = game.bookmakerOdds.filter(book =>
    isValidAmericanOdds(book.homeOdds) && isValidAmericanOdds(book.awayOdds)
    && typeof book.book === "string" && book.book.length > 0,
  );
  if (!complete.length) return null;
  return complete.find(book => book.book === "pinnacle")
    ?? [...complete].sort((a, b) => a.book.localeCompare(b.book))[0]!;
}

export function validProviderObservation(lastUpdate: string | undefined, now: Date): Date | null {
  const observed = new Date(lastUpdate ?? "");
  return Number.isFinite(observed.getTime()) && observed <= now
    && now.getTime() - observed.getTime() <= ACTIONABLE_ODDS_CACHE_MAX_AGE_MS ? observed : null;
}

/** Requires both sides to share sportsbook, source, provider event, and capture time. */
export function selectCompleteNcaafMarketPair(
  rows: readonly NcaafMarketObservation[], selection: "home" | "away",
): NcaafMarketObservation | null {
  const groups = new Map<string, NcaafMarketObservation[]>();
  for (const row of rows) {
    if (!isValidAmericanOdds(row.price) || row.sportsbookId == null
      || !row.sportsbook?.trim() || !row.source.trim() || !row.providerEventId?.trim()) continue;
    const key = [row.sportsbookId, row.source, row.providerEventId, row.capturedAt].join("|");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()]
    .filter(group => group.filter(row => row.selection === "home").length === 1
      && group.filter(row => row.selection === "away").length === 1)
    .flat().filter(row => row.selection === selection)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0] ?? null;
}

type GovernedNcaafCandidateRow = {
  modelId: string; sport: string; market: string; status: string;
  approvedAt: Date | null; deployedAt: Date | null;
  candidateModelVersion: string | null; candidateArtifactId: string | null;
  candidateArtifactHash: string | null; candidateConfigurationHash: string | null;
  candidateParameterHash: string | null; candidateInputContractVersion: string | null;
};

/** Pure fail-closed check used before an idempotent reference-data update. */
export function validateNcaafCandidateRegistryRow(row: GovernedNcaafCandidateRow): void {
  const identity = getCurrentNcaafCandidateIdentity();
  if (row.modelId !== identity.modelId || row.sport !== "NCAAF" || row.market !== "expected-score"
    || row.status !== "challenger" || row.approvedAt != null || row.deployedAt != null) {
    throw new Error("NCAAF candidate registry row is not a non-approved expected-score challenger");
  }
  const expected: Record<string, string> = {
    candidateModelVersion: identity.modelVersion, candidateArtifactId: identity.artifactId,
    candidateArtifactHash: identity.artifactHash, candidateConfigurationHash: identity.configurationHash ?? "",
    candidateParameterHash: identity.parameterHash ?? "", candidateInputContractVersion: identity.inputContractVersion,
  };
  for (const [field, value] of Object.entries(expected)) {
    const actual = row[field as keyof GovernedNcaafCandidateRow];
    if (actual != null && actual !== value) throw new Error(`NCAAF candidate registry identity conflict: ${field}`);
  }
}

/**
 * Reference-data registration only: it neither creates an approval event nor
 * changes any incumbent row.  Existing metadata is filled only when null.
 */
export async function registerExactNcaafCandidateModelVersion(): Promise<number> {
  const identity = getCurrentNcaafCandidateIdentity();
  const values = {
    modelId: identity.modelId, sport: "NCAAF", market: "expected-score", status: "challenger",
    notes: "Frozen NCAAF expected-score challenger; identity registration is not approval",
    candidateModelVersion: identity.modelVersion, candidateArtifactId: identity.artifactId,
    candidateArtifactHash: identity.artifactHash, candidateConfigurationHash: identity.configurationHash ?? "",
    candidateParameterHash: identity.parameterHash ?? "", candidateInputContractVersion: identity.inputContractVersion,
  } as const;
  return db.transaction(async tx => {
    await tx.insert(modelVersionsTable).values(values).onConflictDoNothing();
    const [row] = await tx.select().from(modelVersionsTable)
      .where(eq(modelVersionsTable.modelId, identity.modelId)).limit(1);
    if (!row) throw new Error("NCAAF candidate registry row missing after idempotent registration");
    validateNcaafCandidateRegistryRow(row);
    const missing = Object.fromEntries(Object.entries(values)
      .filter(([key]) => key.startsWith("candidate") && row[key as keyof typeof row] == null)
      .map(([key, value]) => [key, value]));
    if (Object.keys(missing).length) {
      await tx.update(modelVersionsTable).set(missing).where(and(
        eq(modelVersionsTable.id, row.id), eq(modelVersionsTable.status, "challenger"),
        isNull(modelVersionsTable.approvedAt), isNull(modelVersionsTable.deployedAt),
        or(isNull(modelVersionsTable.candidateModelVersion), eq(modelVersionsTable.candidateModelVersion, values.candidateModelVersion)),
        or(isNull(modelVersionsTable.candidateArtifactId), eq(modelVersionsTable.candidateArtifactId, values.candidateArtifactId)),
        or(isNull(modelVersionsTable.candidateArtifactHash), eq(modelVersionsTable.candidateArtifactHash, values.candidateArtifactHash)),
        or(isNull(modelVersionsTable.candidateConfigurationHash), eq(modelVersionsTable.candidateConfigurationHash, values.candidateConfigurationHash)),
        or(isNull(modelVersionsTable.candidateParameterHash), eq(modelVersionsTable.candidateParameterHash, values.candidateParameterHash)),
        or(isNull(modelVersionsTable.candidateInputContractVersion), eq(modelVersionsTable.candidateInputContractVersion, values.candidateInputContractVersion)),
      ));
    }
    const [verified] = await tx.select().from(modelVersionsTable)
      .where(eq(modelVersionsTable.id, row.id)).limit(1);
    if (!verified) throw new Error("NCAAF candidate registry row vanished during registration");
    validateNcaafCandidateRegistryRow(verified);
    return verified.id;
  });
}

/**
 * Makes only arithmetic derivations from an exact executor output and an
 * observed selected-side moneyline.  It deliberately has no persistence path
 * and exposes no synthetic risk, rating, or recommendation values.
 */
export function buildExactNcaafMoneylineBridge(input: {
  output: NcaafCandidateOutput;
  modelVersionId: number | null;
  market: NcaafMarketObservation | null;
  now?: Date;
}): NcaafMoneylineBridge {
  const now = input.now ?? new Date();
  const selection = input.output.homeWinProbability >= .5 ? "home" as const : "away" as const;
  const modelProbability = selection === "home"
    ? input.output.homeWinProbability : input.output.awayWinProbability;
  const capturedAt = input.market ? new Date(input.market.capturedAt) : null;
  const marketFresh = Boolean(input.market && capturedAt && Number.isFinite(capturedAt.getTime())
    && capturedAt <= now && now.getTime() - capturedAt.getTime() <= ACTIONABLE_ODDS_CACHE_MAX_AGE_MS);
  const impliedProbability = marketFresh && input.market ? americanImpliedProbability(input.market.price) : null;
  const blockers = [...new Set([
    ...(input.modelVersionId == null ? ["EXACT_MODEL_VERSION_FOREIGN_KEY_UNRESOLVED"] : []),
    ...(!input.market ? ["EXACT_SELECTED_SIDE_MARKET_UNAVAILABLE"] : []),
    ...(input.market && !marketFresh ? ["MARKET_SNAPSHOT_STALE_OR_INVALID"] : []),
    ...(input.market && input.market.selection !== selection ? ["MARKET_SELECTION_MISMATCH"] : []),
    ...(impliedProbability == null ? ["MARKET_ODDS_IMPLIED_EDGE_UNAVAILABLE"] : []),
    "NO_COMPATIBLE_VALIDATED_NCAAF_RISK_POLICY",
    "UNIVERSAL_RATING_AND_POD_UNAVAILABLE",
    "NEXTGEN_NOT_APPROVED",
  ])];
  const usable = input.market?.selection === selection && impliedProbability != null;
  return Object.freeze({
    persisted: false, bridgeVersion: NCAAF_MONEYLINE_BRIDGE_VERSION,
    modelVersionId: input.modelVersionId, market: input.market, selection, modelProbability,
    impliedProbability: usable ? impliedProbability : null,
    // TBM reports edge in percentage points, rounded to one decimal; probabilities remain decimals.
    edge: usable ? Math.round((modelProbability - impliedProbability) * 1000) / 10 : null,
    marketFresh,
    risk: { status: "UNAVAILABLE" as const, reason: "NO_COMPATIBLE_VALIDATED_NCAAF_RISK_POLICY" as const },
    finalRating: { status: "BLOCKED" as const, reason: "RISK_POLICY_OUTPUT_UNAVAILABLE" as const },
    pod: { status: "BLOCKED" as const, reason: "RISK_POLICY_OUTPUT_UNAVAILABLE" as const },
    publication: {
      ready: false as const,
      approval: { ready: false as const, reason: "NEXTGEN_NOT_APPROVED" as const },
      technicalReadiness: {
        ready: false as const,
        reasons: Object.freeze([
          "NO_COMPATIBLE_VALIDATED_NCAAF_RISK_POLICY",
          "UNIVERSAL_RATING_AND_POD_UNAVAILABLE",
        ]),
      },
    },
    blockers: Object.freeze(blockers),
  });
}

/** Resolves the candidate FK only when every governed immutable field agrees. */
export async function resolveExactNcaafModelVersionId(): Promise<number | null> {
  const identity = getCurrentNcaafCandidateIdentity();
  const [row] = await db.select({ id: modelVersionsTable.id }).from(modelVersionsTable).where(and(
    eq(modelVersionsTable.modelId, identity.modelId),
    eq(modelVersionsTable.sport, "NCAAF"),
    // The governed forecast artifact is correctly registered as expected-score;
    // moneyline is an executor-supported consumption market, not a second model.
    eq(modelVersionsTable.market, "expected-score"),
    eq(modelVersionsTable.status, "challenger"),
    isNull(modelVersionsTable.approvedAt),
    isNull(modelVersionsTable.deployedAt),
    eq(modelVersionsTable.candidateModelVersion, identity.modelVersion),
    eq(modelVersionsTable.candidateArtifactId, identity.artifactId),
    eq(modelVersionsTable.candidateArtifactHash, identity.artifactHash),
    eq(modelVersionsTable.candidateConfigurationHash, identity.configurationHash ?? ""),
    eq(modelVersionsTable.candidateParameterHash, identity.parameterHash ?? ""),
    eq(modelVersionsTable.candidateInputContractVersion, identity.inputContractVersion),
  )).limit(1);
  return row?.id ?? null;
}

/** Finds one fresh, open, authentic selected-side snapshot without mixing books. */
export async function resolveFreshNcaafMoneylineMarket(
  gameId: string, selection: "home" | "away", now = new Date(),
): Promise<NcaafMarketObservation | null> {
  const rows = await db.select({
    snapshotId: oddsSnapshotsTable.id, sportsbookId: oddsSnapshotsTable.sportsbookId,
    sportsbook: sportsbooksTable.name, source: oddsSnapshotsTable.source,
    selection: oddsSnapshotsTable.selection, price: oddsSnapshotsTable.price,
    capturedAt: oddsSnapshotsTable.capturedAt, providerEventId: oddsSnapshotsTable.providerEventId,
  }).from(oddsSnapshotsTable)
    .innerJoin(marketsTable, eq(oddsSnapshotsTable.marketId, marketsTable.id))
    .leftJoin(sportsbooksTable, eq(oddsSnapshotsTable.sportsbookId, sportsbooksTable.id))
    .where(and(eq(oddsSnapshotsTable.gameId, gameId), eq(marketsTable.slug, "moneyline"),
      eq(oddsSnapshotsTable.isAvailable, true),
      eq(oddsSnapshotsTable.isStale, false), eq(oddsSnapshotsTable.marketStatus, "open"),
      gte(oddsSnapshotsTable.capturedAt, new Date(now.getTime() - ACTIONABLE_ODDS_CACHE_MAX_AGE_MS)),
    )).orderBy(desc(oddsSnapshotsTable.capturedAt));
  const observations = rows.filter(row => row.capturedAt <= now).map(row => Object.freeze({
    snapshotId: row.snapshotId, sportsbookId: row.sportsbookId, sportsbook: row.sportsbook,
    source: row.source, providerEventId: row.providerEventId,
    selection: row.selection === "home" ? "home" as const : row.selection === "away" ? "away" as const : null,
    price: row.price, capturedAt: row.capturedAt.toISOString(),
  })).filter((row): row is NcaafMarketObservation => row.selection !== null);
  return selectCompleteNcaafMarketPair(observations, selection);
}

async function persistExactOddsApiNcaafMarket(input: {
  gameId: string; selection: "home" | "away"; kickoffAt: string; now: Date;
}): Promise<NcaafMarketObservation | null> {
  const [game] = await db.select({
    homeTeamName: gamesTable.homeTeamName, awayTeamName: gamesTable.awayTeamName,
  }).from(gamesTable).where(eq(gamesTable.id, input.gameId)).limit(1);
  if (!game) return null;
  const lookup = await getOddsForGameWithStatus(
    "NCAAF", null, game.homeTeamName, game.awayTeamName, input.kickoffAt,
  );
  if (lookup.marketBlockedByProviderStart || !lookup.odds
    || new Date(lookup.odds.commenceTime).getTime() !== new Date(input.kickoffAt).getTime()
    || !lookup.odds.providerEventId) return null;
  const odds = lookup.odds;
  const providerEventId: string = odds.providerEventId!;
  const book = selectExactNcaafBook(odds);
  // Validate against retrieval completion rather than the dry-run start time:
  // a provider may publish an update while the executor is running.
  const capturedAt = validProviderObservation(book?.lastUpdate, new Date());
  if (!book || !capturedAt) return null;
  const [market] = await db.select({ id: marketsTable.id }).from(marketsTable)
    .where(eq(marketsTable.slug, "moneyline")).limit(1);
  if (!market) throw new Error("NCAAF Odds API capture requires moneyline reference market");
  const selectedPrice = input.selection === "home" ? book.homeOdds : book.awayOdds;
  // Capture both contemporaneous sides from exactly one named book. This is
  // market evidence only; no prediction or publication record is written.
  const rows = [
    { selection: "home", price: book.homeOdds },
    { selection: "away", price: book.awayOdds },
  ] as const;
  return db.transaction(async tx => {
    const sharp = book.book === "pinnacle" || book.book === "circasports";
    await tx.insert(sportsbooksTable).values({
      slug: book.book, name: displayBookName(book.book), isSharp: sharp,
    }).onConflictDoNothing();
    const [sportsbook] = await tx.select({ id: sportsbooksTable.id, name: sportsbooksTable.name })
      .from(sportsbooksTable).where(eq(sportsbooksTable.slug, book.book)).limit(1);
    if (!sportsbook) throw new Error("NCAAF Odds API capture could not resolve sportsbook identity");
    const existing = await tx.select({
      selection: oddsSnapshotsTable.selection,
      price: oddsSnapshotsTable.price,
    })
      .from(oddsSnapshotsTable).where(and(
        eq(oddsSnapshotsTable.gameId, input.gameId), eq(oddsSnapshotsTable.source, "odds-api"),
        eq(oddsSnapshotsTable.providerEventId, providerEventId),
        eq(oddsSnapshotsTable.sportsbookId, sportsbook.id),
        eq(oddsSnapshotsTable.marketId, market.id),
        eq(oddsSnapshotsTable.capturedAt, capturedAt),
      ));
    for (const existingRow of existing) {
      const expected = rows.find(row => row.selection === existingRow.selection);
      if (!expected || expected.price !== existingRow.price) {
        throw new Error("NCAAF Odds API capture conflicts with existing exact market evidence");
      }
    }
    const missingRows = rows.filter(row =>
      !existing.some(existingRow => existingRow.selection === row.selection)
    );
    if (missingRows.length) {
      await tx.insert(oddsSnapshotsTable).values(missingRows.map(row => ({
        gameId: input.gameId, sportsbookId: sportsbook.id, marketId: market.id,
        selection: row.selection, price: row.price, line: null, capturedAt,
        source: "odds-api", providerEventId,
        marketStatus: "open", isAvailable: true, isStale: false, isBestAvailable: false,
      }))).onConflictDoNothing();
    }
    const [selected] = await tx.select({
      snapshotId: oddsSnapshotsTable.id, capturedAt: oddsSnapshotsTable.capturedAt,
    }).from(oddsSnapshotsTable).where(and(
      eq(oddsSnapshotsTable.gameId, input.gameId), eq(oddsSnapshotsTable.source, "odds-api"),
      eq(oddsSnapshotsTable.providerEventId, providerEventId),
      eq(oddsSnapshotsTable.sportsbookId, sportsbook.id),
      eq(oddsSnapshotsTable.marketId, market.id),
      eq(oddsSnapshotsTable.selection, input.selection),
      eq(oddsSnapshotsTable.price, selectedPrice), eq(oddsSnapshotsTable.capturedAt, capturedAt),
    )).orderBy(desc(oddsSnapshotsTable.id)).limit(1);
    return selected ? Object.freeze({
      snapshotId: selected.snapshotId, sportsbookId: sportsbook.id, sportsbook: sportsbook.name,
      source: "odds-api", providerEventId,
      selection: input.selection, price: selectedPrice, capturedAt: selected.capturedAt.toISOString(),
    }) : null;
  });
}

export async function resolveNcaafMoneylineBridge(
  output: NcaafCandidateOutput, now = new Date(), kickoffAt?: string,
): Promise<NcaafMoneylineBridge> {
  const selection = output.homeWinProbability >= .5 ? "home" as const : "away" as const;
  const gameId = output.gameId.includes(":") ? output.gameId.slice(output.gameId.lastIndexOf(":") + 1) : output.gameId;
  const [modelVersionId, persistedMarket] = await Promise.all([
    resolveExactNcaafModelVersionId(), resolveFreshNcaafMoneylineMarket(gameId, selection, now),
  ]);
  const market = persistedMarket ?? (kickoffAt
    ? await persistExactOddsApiNcaafMarket({ gameId, selection, kickoffAt, now })
    : null);
  const completedAt = new Date();
  const evaluatedAt = completedAt > now ? completedAt : now;
  return buildExactNcaafMoneylineBridge({ output, modelVersionId, market, now: evaluatedAt });
}