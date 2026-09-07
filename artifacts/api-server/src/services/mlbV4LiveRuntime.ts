import { and, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import {
  db, mlbPregameStarterEvidenceSnapshotsTable, mlbV4CollectionRunsTable, mlbV4CollectionRunEventsTable,
  mlbV4GameDiscoveriesTable, mlbV4StarterStatesTable, mlbV4TeamStatesTable,
  mlbV4ContextStatesTable, mlbV4PregameFeaturesTable, mlbV4GameOutcomesTable,
  mlbV4StarterOutcomesTable, mlbV4BullpenOutcomesTable, mlbV4EvidencePairsTable,
  mlbHistoricalPitcherAppearancesTable, mlbHistoricalTeamGameRowsTable, mlbHistoricalOutcomesTable, mlbHistoricalBullpenOutcomesTable,
  mlbLeagueRunEnvironmentTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import {
  buildGameOutcome, buildReadiness, classifyStarterAgreement, freezePregameFeatureSnapshot,
  materializeStarterPitState, materializeTeamOffensePitState, materializeBullpenPitState,
  materializeLeagueEnvironmentPitState, MLB_V4_INPUT_SCHEMA,
  MLB_V4_COLLECTOR_VERSION, MLB_V4_CONTEXT_VERSION, MLB_V4_LIVE_VERSION,
  MLB_V4_STARTER_STATE_VERSION, MLB_V4_TEAM_STATE_VERSION,
  normalizeMlbTeamSide, pairFeatureOutcome, runBoundedMlbV4Collection, selectLatestBullpenPitVersions,
  type CollectionRunResult, type Discovery, type LiveCollectionRepository,
  type ReadinessCounts,
} from "./mlbV4LiveFoundation";
import { MLB_STARTER_EVIDENCE_224C_VERSION, officialScheduleUrl, type StarterEvidenceRow } from "./mlbStarterEvidence224C";

const repository: LiveCollectionRepository = {
  async appendRunEvent(event) {
    await db.insert(mlbV4CollectionRunEventsTable).values({
      ...event, detail: event.detail,
    }).onConflictDoNothing();
  },
  async appendRun(result) {
    await db.insert(mlbV4CollectionRunsTable).values({
      runId: result.runId, logicalRunId: result.logicalRunId, retryOfRunId: result.retryOfRunId,
      collectorName: "mlb-v4-live-evidence", collectorVersion: MLB_V4_COLLECTOR_VERSION,
      startedAt: result.startedAt, completedAt: result.completedAt, executionDate: result.executionDate,
      timezone: "America/New_York", source: "MLB_STATS_API", requestCount: result.requestCount,
      scheduledGamesDiscovered: result.discoveries.length, gamesProcessed: result.discoveries.length,
      starterSlotsExpected: result.counters.expected, starterSlotsObserved: result.counters.observed,
      starterSlotsInserted: result.counters.inserted, starterSlotsUnchanged: result.counters.unchanged,
      starterSlotsRejected: result.counters.rejected, sourceErrors: result.counters.sourceErrors,
      timeouts: result.counters.timeouts, rateLimitEvents: result.counters.rateLimits,
      status: result.status, errorSummary: result.errorSummary, artifactHash: result.artifactHash,
    }).onConflictDoNothing();
  },
  async appendDiscoveries(rows: Discovery[], startedEventId: string) {
    if (!rows.length) return 0;
    const inserted = await db.insert(mlbV4GameDiscoveriesTable).values(rows.map((row) => ({
      discoveryId: row.discoveryId, runId: row.runId, collectionEventId: startedEventId, gameId: row.gameId, gameDate: row.gameDate,
      scheduledFirstPitch: row.scheduledFirstPitch, homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId,
      gameStatus: row.gameStatus, discoveredAt: row.discoveredAt, source: row.source,
      sourceRecordId: row.sourceRecordId, rawPayloadHash: row.rawPayloadHash,
      eligibleForPregameCapture: row.eligibleForPregameCapture, reasonNotEligible: row.reasonNotEligible,
      artifactHash: row.artifactHash,
    }))).onConflictDoNothing().returning({ id: mlbV4GameDiscoveriesTable.discoveryId });
    return inserted.length;
  },
  async appendStarterRows(runId: string, rows: StarterEvidenceRow[]) {
    if (!rows.length) return { inserted: 0, unchanged: 0 };
    const gameIds = [...new Set(rows.map((row) => row.officialGameId))];
    const existing = await db.select({
      officialGameId: mlbPregameStarterEvidenceSnapshotsTable.officialGameId,
      evidenceStateHash: mlbPregameStarterEvidenceSnapshotsTable.evidenceStateHash,
    }).from(mlbPregameStarterEvidenceSnapshotsTable).where(and(
      eq(mlbPregameStarterEvidenceSnapshotsTable.schemaVersion, MLB_STARTER_EVIDENCE_224C_VERSION),
      inArray(mlbPregameStarterEvidenceSnapshotsTable.officialGameId, gameIds),
    ));
    const hashes = new Set(existing.map((r) => `${r.officialGameId}:${r.evidenceStateHash}`));
    const fresh = rows.filter((row) => !hashes.has(`${row.officialGameId}:${row.evidenceStateHash}`));
    const inserted = fresh.length ? await db.insert(mlbPregameStarterEvidenceSnapshotsTable)
      .values(fresh.map((row) => ({
        ...row,
        daysRest: row.daysRest == null ? null : Number(row.daysRest),
        collectionRunId: runId,
      }))).onConflictDoNothing()
      .returning({ id: mlbPregameStarterEvidenceSnapshotsTable.id }) : [];
    return { inserted: inserted.length, unchanged: rows.length - fresh.length };
  },
};

const easternDate = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** Scheduler entry point: MLB-only collection, bounded retries, then all safe downstream stages. */
export async function runScheduledMlbV4EvidenceCollection(now = new Date()): Promise<CollectionRunResult> {
  const date = easternDate(now);
  const logicalRunId = deterministicLogicalRunId(date, now);
  const result = await runBoundedMlbV4Collection({
    date, logicalRunId, now: () => new Date(),
    client: {
      async get(requestDate) {
        const response = await fetch(officialScheduleUrl(requestDate), { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`MLB Stats API ${response.status}${response.status === 429 ? " rate-limit" : ""}`);
        const payload = await response.json() as { dates?: Array<{ games?: never[] }> };
        return { games: (payload.dates ?? []).flatMap((bucket) => bucket.games ?? []) };
      },
    },
    repository, captureWindowOnly: true,
  });
  logger[result.status === "FAILED" ? "warn" : "info"]({
    event: "mlb_v4_collection_run", runId: result.runId, logicalRunId,
    status: result.status, counters: result.counters, artifactHash: result.artifactHash,
  }, "MLB V4 evidence collection attempt complete");
  if (result.status !== "FAILED") {
    try {
      const downstream = await materializeAndPairMlbV4Evidence();
      await repository.appendRunEvent({
        eventId: deterministicHash({ runId: result.runId, type: "DOWNSTREAM_COMPLETED" }), runId: result.runId,
        logicalRunId, retryOfRunId: result.retryOfRunId, eventType: "DOWNSTREAM_COMPLETED", occurredAt: new Date(),
        detail: downstream, artifactHash: deterministicHash({ runId: result.runId, downstream }),
      });
      logger.info({ event: "mlb_v4_downstream_cycle", ...downstream }, "MLB V4 evidence downstream cycle complete");
    } catch (error) {
      const detail = { error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000) };
      await repository.appendRunEvent({
        eventId: deterministicHash({ runId: result.runId, type: "DOWNSTREAM_FAILED" }), runId: result.runId,
        logicalRunId, retryOfRunId: result.retryOfRunId, eventType: "DOWNSTREAM_FAILED", occurredAt: new Date(),
        detail, artifactHash: deterministicHash({ runId: result.runId, detail }),
      });
      logger.warn({ event: "mlb_v4_downstream_cycle_failed", ...detail }, "MLB V4 downstream cycle failed");
    }
  }
  return result;
}

function deterministicLogicalRunId(date: string, now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `mlb-v4:${date}:${hour}:${minute}`;
}

/**
 * Materializes only persisted, strictly pregame starter evidence. The historical
 * foundation is read-only; each #232 result is a new append-only fact. This is
 * intentionally idempotent through semantic unique indexes.
 */
export async function materializeAndPairMlbV4Evidence(): Promise<Record<string, number>> {
  const snapshots = await db.select().from(mlbPregameStarterEvidenceSnapshotsTable)
    .where(and(eq(mlbPregameStarterEvidenceSnapshotsTable.schemaVersion, MLB_STARTER_EVIDENCE_224C_VERSION),
      eq(mlbPregameStarterEvidenceSnapshotsTable.pitSafe, true),
      inArray(mlbPregameStarterEvidenceSnapshotsTable.starterState,
        ["CONFIRMED_PREGAME", "PROBABLE_PREGAME", "PROJECTED_PREGAME"])))
    .orderBy(desc(mlbPregameStarterEvidenceSnapshotsTable.observedAt));
  const latest = new Map<string, typeof snapshots[number]>();
  for (const row of snapshots) {
    const key = `${row.officialGameId}:${row.officialTeamId}`;
    if (!latest.has(key) && row.observedAt < row.featureCutoff && row.officialPlayerId) latest.set(key, row);
  }
  let starterStates = 0; let teamStates = 0; let features = 0;
  type RuntimeComponent = { id: string; hash: string; features: unknown; sampleSizes: unknown; missingness: unknown; sourceCutoff: Date | null };
  const componentByGameSide = new Map<string, { starter?: RuntimeComponent; offense?: RuntimeComponent; bullpen?: RuntimeComponent }>();
  for (const snapshot of latest.values()) {
    const normalizedSnapshotSide = normalizeMlbTeamSide(snapshot.teamSide);
    if (!normalizedSnapshotSide) continue;
    const appearances = await db.select().from(mlbHistoricalPitcherAppearancesTable)
      .where(and(eq(mlbHistoricalPitcherAppearancesTable.providerPitcherId, snapshot.officialPlayerId!),
        lt(mlbHistoricalPitcherAppearancesTable.appearanceCompletionTime, snapshot.observedAt),
        lt(mlbHistoricalPitcherAppearancesTable.createdAt, snapshot.observedAt)))
      .orderBy(mlbHistoricalPitcherAppearancesTable.appearanceCompletionTime);
    const state = materializeStarterPitState({
      starterSnapshotId: snapshot.id, gameId: snapshot.officialGameId, teamId: snapshot.officialTeamId,
      pitcherId: snapshot.officialPlayerId!, featureCutoff: snapshot.observedAt,
      appearances: appearances.map((a) => ({
        canonicalGameId: a.canonicalGameId, completedAt: a.appearanceCompletionTime, recordedAt: a.createdAt,
        gameDate: a.appearanceCompletionTime.toISOString().slice(0, 10),
        starter: a.starterFlagActual, innings: a.inningsPitched, battersFaced: a.battersFaced,
        pitchCount: a.pitchCount, earnedRuns: a.earnedRuns, hits: a.hitsAllowed, walks: a.walks,
        strikeouts: a.strikeouts, homeRuns: a.homeRunsAllowed,
      })),
    });
    const inserted = await db.insert(mlbV4StarterStatesTable).values(state).onConflictDoNothing()
      .returning({ id: mlbV4StarterStatesTable.stateId });
    starterStates += inserted.length;

    // Aggregate only completed, outcome-backed team games strictly before cutoff.
    const teamRows = await db.select({
      canonicalGameId: mlbHistoricalTeamGameRowsTable.canonicalGameId,
      completedAt: mlbHistoricalOutcomesTable.completionTime, homeRuns: mlbHistoricalOutcomesTable.homeRuns,
      awayRuns: mlbHistoricalOutcomesTable.awayRuns, teamSide: mlbHistoricalTeamGameRowsTable.teamSide,
      teamRecordedAt: mlbHistoricalTeamGameRowsTable.createdAt,
      outcomeRecordedAt: mlbHistoricalOutcomesTable.createdAt,
    }).from(mlbHistoricalTeamGameRowsTable).innerJoin(mlbHistoricalOutcomesTable,
      eq(mlbHistoricalTeamGameRowsTable.canonicalGameId, mlbHistoricalOutcomesTable.canonicalGameId))
      .where(and(eq(mlbHistoricalTeamGameRowsTable.canonicalTeamId, `mlb-team:${snapshot.officialTeamId}`),
        lt(mlbHistoricalOutcomesTable.completionTime, snapshot.observedAt),
        lt(mlbHistoricalTeamGameRowsTable.createdAt, snapshot.observedAt),
        lt(mlbHistoricalOutcomesTable.createdAt, snapshot.observedAt)));
    const bullpenRows = await db.select().from(mlbHistoricalBullpenOutcomesTable)
      .where(and(eq(mlbHistoricalBullpenOutcomesTable.canonicalTeamId, `mlb-team:${snapshot.officialTeamId}`),
        lt(mlbHistoricalBullpenOutcomesTable.gameCompletionTime, snapshot.observedAt),
        lt(mlbHistoricalBullpenOutcomesTable.createdAt, snapshot.observedAt)));
    const orderedTeamRows = [...teamRows].sort((a, b) =>
      a.completedAt!.getTime() - b.completedAt!.getTime()
      || a.teamRecordedAt.getTime() - b.teamRecordedAt.getTime()
      || a.outcomeRecordedAt.getTime() - b.outcomeRecordedAt.getTime());
    const dedupedTeamRows = [...new Map(orderedTeamRows.map((row) => [row.canonicalGameId, row])).values()];
    const offenseAggregate = materializeTeamOffensePitState({ cutoff: snapshot.observedAt, rows: dedupedTeamRows.filter((r) => r.completedAt)
      .flatMap((r) => {
        const side = normalizeMlbTeamSide(r.teamSide);
        return side ? [{ completedAt: r.completedAt!,
        recordedAt: r.teamRecordedAt > r.outcomeRecordedAt ? r.teamRecordedAt : r.outcomeRecordedAt,
        runs: side === "HOME" ? r.homeRuns : r.awayRuns, home: side === "HOME" }] : [];
      }) });
    const bullpenSelection = selectLatestBullpenPitVersions(snapshot.observedAt, bullpenRows.map((row) => ({
      canonicalGameId: row.canonicalGameId,
      canonicalTeamId: row.canonicalTeamId,
      completedAt: row.gameCompletionTime,
      recordedAt: row.createdAt,
      sourceHash: row.outcomeChecksum,
      value: row,
    })));
    const dedupedBullpenRows = bullpenSelection.rows.map((row) => row.value);
    const bullpenAggregate = materializeBullpenPitState({ cutoff: snapshot.observedAt, rows: dedupedBullpenRows.map((r) => ({
      completedAt: r.gameCompletionTime, recordedAt: r.createdAt, innings: r.bullpenInnings,
      pitches: r.bullpenPitchCount, relievers: r.relieversUsed, earnedRuns: r.bullpenEarnedRuns,
    })) });
    const makeTeamState = (kind: "OFFENSE" | "BULLPEN") => {
      const aggregate = kind === "OFFENSE" ? offenseAggregate : bullpenAggregate;
      const missingness: Record<string, unknown> = {
        ...aggregate.missingness,
        ...(kind === "BULLPEN" && bullpenSelection.conflicts.length ? {
          sourceConflict: true,
          conflictingCanonicalGameTeams: bullpenSelection.conflicts,
        } : {}),
      };
      const base = {
        gameId: snapshot.officialGameId, teamId: snapshot.officialTeamId, stateKind: kind, teamSide: normalizedSnapshotSide,
        appliesToOffenseTeamId: snapshot.officialOpponentTeamId ?? "",
        featureCutoff: snapshot.observedAt, sourceCutoff: aggregate.sourceCutoff, stateSchemaVersion: MLB_V4_TEAM_STATE_VERSION,
        features: aggregate.features, sampleSizes: aggregate.sampleSizes, missingness,
      };
      const artifactHash = deterministicHash(base);
      return { stateId: deterministicHash({ ...base, artifactHash }), ...base, artifactHash };
    };
    const offense = makeTeamState("OFFENSE");
    const bullpen = makeTeamState("BULLPEN");
    for (const row of [offense, bullpen]) {
      const insertedTeam = await db.insert(mlbV4TeamStatesTable).values(row).onConflictDoNothing()
        .returning({ id: mlbV4TeamStatesTable.stateId });
      teamStates += insertedTeam.length;
    }
    const component = (row: { stateId: string; artifactHash: string; features: unknown; sampleSizes: unknown; missingness: unknown; sourceCutoff: Date | null }): RuntimeComponent =>
      ({ id: row.stateId, hash: row.artifactHash, features: row.features, sampleSizes: row.sampleSizes, missingness: row.missingness, sourceCutoff: row.sourceCutoff });
    componentByGameSide.set(`${snapshot.officialGameId}:${normalizedSnapshotSide}`, {
      starter: component(state), offense: component(offense), bullpen: component(bullpen),
    });
  }
  const games = new Map<string, { home?: typeof latest extends Map<string, infer V> ? V : never; away?: typeof latest extends Map<string, infer V> ? V : never }>();
  const sideConflicts = new Set<string>();
  for (const snapshot of latest.values()) {
    const entry = games.get(snapshot.officialGameId) ?? {};
    const side = normalizeMlbTeamSide(snapshot.teamSide);
    if (!side) continue;
    if (side === "HOME") {
      if (entry.home && entry.home.officialTeamId !== snapshot.officialTeamId) sideConflicts.add(snapshot.officialGameId);
      entry.home = snapshot;
    } else {
      if (entry.away && entry.away.officialTeamId !== snapshot.officialTeamId) sideConflicts.add(snapshot.officialGameId);
      entry.away = snapshot;
    }
    games.set(snapshot.officialGameId, entry);
  }
  for (const [gameId, sides] of games) {
    if (sideConflicts.has(gameId)) continue;
    if (!sides.home || !sides.away) continue;
    const home = componentByGameSide.get(`${gameId}:HOME`)!;
    const away = componentByGameSide.get(`${gameId}:AWAY`)!;
    const cutoff = sides.home.observedAt > sides.away.observedAt ? sides.home.observedAt : sides.away.observedAt;
    const scheduledFirstPitch = sides.home.scheduledFirstPitch < sides.away.scheduledFirstPitch
      ? sides.home.scheduledFirstPitch
      : sides.away.scheduledFirstPitch;
    if (!(cutoff < scheduledFirstPitch)) continue;
    const leagueRows = await db.select({
      canonicalGameId: mlbHistoricalOutcomesTable.canonicalGameId,
      completedAt: mlbHistoricalOutcomesTable.completionTime,
      recordedAt: mlbHistoricalOutcomesTable.createdAt,
      homeRuns: mlbHistoricalOutcomesTable.homeRuns,
      awayRuns: mlbHistoricalOutcomesTable.awayRuns,
    }).from(mlbHistoricalOutcomesTable)
      .where(and(
        lt(mlbHistoricalOutcomesTable.completionTime, cutoff),
        lt(mlbHistoricalOutcomesTable.createdAt, cutoff),
      ));
    const leagueAggregate = materializeLeagueEnvironmentPitState({
      cutoff,
      rows: leagueRows.filter((row) => row.completedAt != null).map((row) => ({
        ...row,
        completedAt: row.completedAt!,
      })),
    });
    const leagueEligible = leagueAggregate.features.seasonRunsPerTeamGame != null;
    const contextBase = {
      gameId, featureCutoff: cutoff, sourceCutoff: leagueAggregate.sourceCutoff, schemaVersion: MLB_V4_CONTEXT_VERSION,
       league: leagueEligible ? { season: cutoff.getUTCFullYear(), ...leagueAggregate.features }
          : { availability: "UNAVAILABLE_NO_TARGET_SEASON_COMPLETED_GAMES",
            season: cutoff.getUTCFullYear() },
      home: { homeTeamId: sides.home.officialTeamId, awayTeamId: sides.away.officialTeamId },
      park: { availability: "UNAVAILABLE" }, sampleSizes: leagueAggregate.sampleSizes,
      missingness: { ...leagueAggregate.missingness, league: !leagueEligible, park: true },
    };
    const artifactHash = deterministicHash(contextBase);
    const context = { stateId: deterministicHash({ gameId, artifactHash }), ...contextBase, artifactHash };
    await db.insert(mlbV4ContextStatesTable).values(context).onConflictDoNothing();
    // Baseline can use explicitly available (even low-sample) historical state,
    // but never labels absent team mapping as eligible.
    const validTeamState = (c: typeof home) => c.offense!.features
      && !(c.offense!.missingness as { noEligibleCompletedGames?: boolean }).noEligibleCompletedGames
      && !(c.bullpen!.missingness as { noEligibleBullpenGames?: boolean }).noEligibleBullpenGames
      && !(c.bullpen!.missingness as { sourceConflict?: boolean }).sourceConflict;
    const feature = freezePregameFeatureSnapshot({
      gameId, scheduledFirstPitch, featureCutoff: cutoff,
      homeOffense: validTeamState(home) ? home.offense : undefined, awayOffense: validTeamState(away) ? away.offense : undefined,
      homeStarter: home.starter, awayStarter: away.starter, homeBullpen: validTeamState(home) ? home.bullpen : undefined,
      awayBullpen: validTeamState(away) ? away.bullpen : undefined,
      // Explicitly unavailable league means no baseline claim until an actual
      // PIT aggregate adapter is available.
      league: leagueEligible ? { id: context.stateId, hash: context.artifactHash, features: context.league, sampleSizes: context.sampleSizes, missingness: {}, sourceCutoff: context.sourceCutoff } : undefined,
      homeContext: { id: context.stateId, hash: context.artifactHash, features: context.home, sampleSizes: {}, missingness: {}, sourceCutoff: null },
    });
    const insertedFeature = await db.insert(mlbV4PregameFeaturesTable).values(feature).onConflictDoNothing()
      .returning({ id: mlbV4PregameFeaturesTable.snapshotId });
    features += insertedFeature.length;
  }
  const outcomes = await ingestOfficialFinalsAndPair();
  return { starterStates, teamStates, features, ...outcomes };
}

const deterministicHash = (value: unknown) => {
  // Kept local to avoid widening the runtime's provider surface.
  const { createHash } = requireNodeCrypto();
  return createHash("sha256").update(JSON.stringify(value, (_k, v) => v instanceof Date ? v.toISOString() : v)).digest("hex");
};
function requireNodeCrypto(): typeof import("node:crypto") {
  // ESM-safe static dependency is represented through this small indirection for
  // deterministic serialization in the DB adapter.
  return cryptoModule;
}
import * as cryptoModule from "node:crypto";

/**
 * Final collection is deliberately separate from pregame evidence. It queries
 * only discovered games and appends finals/pairs; it never changes a feature.
 * Boxscore detail is deferred when unavailable instead of invented.
 */
async function ingestOfficialFinalsAndPair(): Promise<{ outcomes: number; pairs: number; starterOutcomes: number; bullpenOutcomes: number }> {
  const features = await db.select().from(mlbV4PregameFeaturesTable)
    .where(and(eq(mlbV4PregameFeaturesTable.pitSafe, true),
      eq(mlbV4PregameFeaturesTable.schemaVersion, MLB_V4_INPUT_SCHEMA)));
  const discoveryRows = await db.select().from(mlbV4GameDiscoveriesTable)
    .orderBy(desc(mlbV4GameDiscoveriesTable.discoveredAt));
  const latestDiscoveryByGame = new Map<string, typeof discoveryRows[number]>();
  for (const row of discoveryRows) if (!latestDiscoveryByGame.has(row.gameId)) latestDiscoveryByGame.set(row.gameId, row);
  const officialFeedByGame = new Map<string, { gameData?: { status?: { detailedState?: string } }; liveData?: { linescore?: { teams?: { home?: { runs?: number }; away?: { runs?: number } } }; boxscore?: unknown } }>();
  let outcomes = 0; let pairs = 0; let starterOutcomes = 0; let bullpenOutcomes = 0;
  for (const feature of features) {
    const pairAlready = await db.select({ id: mlbV4EvidencePairsTable.pairId }).from(mlbV4EvidencePairsTable)
      .where(eq(mlbV4EvidencePairsTable.featureSnapshotId, feature.snapshotId)).limit(1);
    if (pairAlready.length) continue;
    const latestDiscovery = latestDiscoveryByGame.get(feature.gameId);
    if (!latestDiscovery || !["Final", "Game Over", "Completed Early"].includes(latestDiscovery.gameStatus)) continue;
    const existing = await db.select().from(mlbV4GameOutcomesTable)
      .where(eq(mlbV4GameOutcomesTable.gameId, feature.gameId)).limit(1);
    let outcome = existing[0] as unknown as ReturnType<typeof buildGameOutcome> | undefined;
    let payload = officialFeedByGame.get(feature.gameId);
    if (!payload) {
      const response = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${feature.gameId}/feed/live`, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) continue;
      payload = await response.json() as typeof payload;
      if (!payload) continue;
      officialFeedByGame.set(feature.gameId, payload);
    }
    if (!payload) continue;
    if (!outcome) {
      const status = payload.gameData?.status?.detailedState ?? "";
      const homeRuns = payload.liveData?.linescore?.teams?.home?.runs;
      const awayRuns = payload.liveData?.linescore?.teams?.away?.runs;
      if (!Number.isInteger(homeRuns) || !Number.isInteger(awayRuns) || !["Final", "Game Over", "Completed Early"].includes(status)) continue;
      const built = buildGameOutcome({ gameId: feature.gameId, finalStatus: status, homeRuns: homeRuns!, awayRuns: awayRuns!,
        completedAt: new Date(), source: "MLB_STATS_API", rawPayload: payload });
      const inserted = await db.insert(mlbV4GameOutcomesTable).values(built).onConflictDoNothing()
        .returning({ id: mlbV4GameOutcomesTable.outcomeId });
      outcomes += inserted.length;
      outcome = built;
    }
    const latestStarterSnapshots = await db.select({
      teamSide: mlbPregameStarterEvidenceSnapshotsTable.teamSide,
      officialTeamId: mlbPregameStarterEvidenceSnapshotsTable.officialTeamId,
      officialPlayerId: mlbPregameStarterEvidenceSnapshotsTable.officialPlayerId,
      observedAt: mlbPregameStarterEvidenceSnapshotsTable.observedAt,
    }).from(mlbPregameStarterEvidenceSnapshotsTable)
      .where(and(eq(mlbPregameStarterEvidenceSnapshotsTable.officialGameId, feature.gameId),
        eq(mlbPregameStarterEvidenceSnapshotsTable.schemaVersion, MLB_STARTER_EVIDENCE_224C_VERSION),
        eq(mlbPregameStarterEvidenceSnapshotsTable.pitSafe, true),
        lte(mlbPregameStarterEvidenceSnapshotsTable.observedAt, feature.featureCutoff)))
      .orderBy(desc(mlbPregameStarterEvidenceSnapshotsTable.observedAt));
    const latestByTeamId = new Map<string, string | null>();
    for (const snapshot of latestStarterSnapshots) {
      if (!latestByTeamId.has(snapshot.officialTeamId)) {
        latestByTeamId.set(snapshot.officialTeamId, snapshot.officialPlayerId);
      }
    }
    const teamIdsBySide = Object.fromEntries(
      latestStarterSnapshots.flatMap((snapshot) => {
        const side = normalizeMlbTeamSide(snapshot.teamSide);
        return side ? [[side.toLowerCase(), snapshot.officialTeamId]] : [];
      }),
    );
    const performance = officialPitchingOutcomes(feature.gameId, payload.liveData?.boxscore, payload, teamIdsBySide);
    for (const row of performance.starters) {
      const teamId = String(row.teamId);
      const agreement = classifyStarterAgreement(latestByTeamId.get(teamId) ?? null, String(row.actualStarterId));
      row.agreement = agreement;
      const { outcomeId: _outcomeId, artifactHash: _artifactHash, ...outcomeBody } = row;
      const artifactHash = deterministicHash(outcomeBody);
      row.artifactHash = artifactHash;
      row.outcomeId = deterministicHash({ gameId: feature.gameId, teamId, artifactHash });
      performance.agreement[teamId] = agreement;
    }
    for (const row of performance.starters) {
      const inserted = await db.insert(mlbV4StarterOutcomesTable).values(row as never).onConflictDoNothing()
        .returning({ id: mlbV4StarterOutcomesTable.outcomeId });
      starterOutcomes += inserted.length;
    }
    for (const row of performance.bullpens) {
      const inserted = await db.insert(mlbV4BullpenOutcomesTable).values(row as never).onConflictDoNothing()
        .returning({ id: mlbV4BullpenOutcomesTable.outcomeId });
      bullpenOutcomes += inserted.length;
    }
    const pairExisting = await db.select({ id: mlbV4EvidencePairsTable.pairId }).from(mlbV4EvidencePairsTable)
      .where(and(eq(mlbV4EvidencePairsTable.featureSnapshotId, feature.snapshotId), eq(mlbV4EvidencePairsTable.gameOutcomeId, outcome.outcomeId))).limit(1);
    if (pairExisting.length) continue;
    const paired = pairFeatureOutcome({ feature: feature as unknown as ReturnType<typeof freezePregameFeatureSnapshot>, outcome,
      starterOutcomeIds: performance.starters.map((r) => String(r.outcomeId)), bullpenOutcomeIds: performance.bullpens.map((r) => String(r.outcomeId)),
      starterAgreement: performance.agreement });
    const insertedPair = await db.insert(mlbV4EvidencePairsTable).values(paired).onConflictDoNothing()
      .returning({ id: mlbV4EvidencePairsTable.pairId });
    pairs += insertedPair.length;
  }
  return { outcomes, pairs, starterOutcomes, bullpenOutcomes };
}

/** Parses only official final boxscore pitching actuality; it is never an input. */
function officialPitchingOutcomes(
  gameId: string,
  raw: unknown,
  payload: unknown,
  teamIdsBySide: Record<string, string>,
) {
  const boxscore = raw as { teams?: Record<string, { players?: Record<string, { person?: { id?: number; fullName?: string }; stats?: { pitching?: Record<string, unknown> } }> }> } | undefined;
  const starters: Array<Record<string, unknown>> = [];
  const bullpens: Array<Record<string, unknown>> = [];
  const agreement: Record<string, string> = {};
  for (const side of ["home", "away"] as const) {
    const players = Object.values(boxscore?.teams?.[side]?.players ?? {});
    const pitcherRows = players.map((player) => ({ player, stats: player.stats?.pitching ?? {} }))
      .filter(({ stats }) => Object.keys(stats).length > 0);
    const starter = pitcherRows.find(({ stats }) => Number(stats.gamesStarted ?? 0) > 0);
    if (starter?.player.person?.id != null) {
      const stats = starter.stats;
      const teamId = teamIdsBySide[side];
      if (!teamId) continue;
      const base = {
        gameId, teamId, actualStarterId: String(starter.player.person.id), actualStarterName: starter.player.person.fullName ?? null,
        innings: asNumber(stats.inningsPitched), battersFaced: asInteger(stats.battersFaced), pitchCount: asInteger(stats.pitchesThrown),
        runs: asInteger(stats.runs), earnedRuns: asInteger(stats.earnedRuns), hits: asInteger(stats.hits),
        walks: asInteger(stats.baseOnBalls), strikeouts: asInteger(stats.strikeOuts), homeRunsAllowed: asInteger(stats.homeRuns),
        agreement: "UNKNOWN", outcomeSource: "MLB_STATS_API", rawPayloadHash: deterministicHash({ gameId, side, player: starter.player.person.id, payload }),
      };
      const artifactHash = deterministicHash(base);
      starters.push({ outcomeId: deterministicHash({ gameId, side, artifactHash }), ...base, artifactHash });
      agreement[teamId] = "UNKNOWN";
    }
    const relievers = pitcherRows.filter(({ player }) => player.person?.id !== starter?.player.person?.id);
    if (relievers.length) {
      const total = (key: string) => {
        const values = relievers.map((r) => asNumber(r.stats[key]));
        return values.some((value) => value == null) ? null : values.reduce<number>((n, value) => n + value!, 0);
      };
      const teamId = teamIdsBySide[side];
      if (!teamId) continue;
      const base = {
        gameId, teamId, innings: total("inningsPitched"), runsAllowed: total("runs"),
        earnedRuns: total("earnedRuns"), hits: total("hits"), walks: total("baseOnBalls"),
        strikeouts: total("strikeOuts"), homeRuns: total("homeRuns"), outcomeSource: "MLB_STATS_API",
        rawPayloadHash: deterministicHash({ gameId, side, bullpen: relievers.map((r) => r.player.person?.id), payload }),
      };
      const artifactHash = deterministicHash(base);
      bullpens.push({ outcomeId: deterministicHash({ gameId, side, artifactHash }), ...base, artifactHash });
    }
  }
  return { starters, bullpens, agreement };
}
const asNumber = (value: unknown): number | null => typeof value === "number" ? value : typeof value === "string" && value !== "" && !Number.isNaN(Number(value)) ? Number(value) : null;
const asInteger = (value: unknown): number | null => {
  const numeric = asNumber(value);
  return numeric !== null && Number.isInteger(numeric) ? numeric : null;
};

const numeric = (value: unknown) => Number(value ?? 0);
export async function getMlbV4Readiness() {
  const query = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM mlb_v4_collection_runs r
        WHERE r.collector_version = ${MLB_V4_COLLECTOR_VERSION} AND EXISTS (
          SELECT 1 FROM mlb_v4_collection_run_events e
          WHERE e.run_id = r.run_id AND e.event_type = 'STARTED'
        )) collection_runs,
      (SELECT count(DISTINCT d.game_id) FROM mlb_v4_game_discoveries d
        INNER JOIN mlb_v4_collection_runs r
          ON r.run_id = d.run_id AND r.collector_version = ${MLB_V4_COLLECTOR_VERSION}
        INNER JOIN mlb_v4_collection_run_events e
          ON e.event_id = d.collection_event_id AND e.event_type = 'STARTED') scheduled_games,
      (SELECT count(DISTINCT official_game_id) FROM mlb_pregame_starter_evidence_snapshots WHERE schema_version=${MLB_STARTER_EVIDENCE_224C_VERSION}) captured_games,
      (SELECT count(*) FROM (SELECT official_game_id FROM mlb_pregame_starter_evidence_snapshots
         WHERE schema_version=${MLB_STARTER_EVIDENCE_224C_VERSION} AND pit_safe AND starter_state IN ('CONFIRMED_PREGAME','PROBABLE_PREGAME','PROJECTED_PREGAME')
        GROUP BY official_game_id HAVING count(DISTINCT official_team_id)=2) x) both_starter_games,
      (SELECT count(*) FROM mlb_v4_starter_pit_states WHERE state_schema_version=${MLB_V4_STARTER_STATE_VERSION}) starter_states,
      (SELECT count(*) FROM mlb_v4_pregame_feature_snapshots WHERE schema_version=${MLB_V4_INPUT_SCHEMA}) feature_snapshots,
      (SELECT count(*) FROM mlb_v4_pregame_feature_snapshots WHERE schema_version=${MLB_V4_INPUT_SCHEMA} AND baseline_core_eligible) baseline_snapshots,
      (SELECT count(*) FROM mlb_v4_pregame_feature_snapshots WHERE schema_version=${MLB_V4_INPUT_SCHEMA} AND starter_core_eligible) starter_core_snapshots,
      (SELECT count(*) FROM mlb_v4_evidence_pairs p
        INNER JOIN mlb_v4_pregame_feature_snapshots f ON f.snapshot_id = p.feature_snapshot_id
        WHERE f.schema_version=${MLB_V4_INPUT_SCHEMA}
          AND p.outcome_complete AND p.quality_status='COMPLETE') completed_pairs,
      (SELECT count(*) FROM mlb_v4_evidence_pairs p
        INNER JOIN mlb_v4_pregame_feature_snapshots f ON f.snapshot_id = p.feature_snapshot_id
        WHERE f.schema_version=${MLB_V4_INPUT_SCHEMA}
          AND p.starter_core_eligible AND p.outcome_complete AND p.quality_status='COMPLETE') starter_core_pairs,
       (SELECT count(DISTINCT official_team_id) FROM mlb_pregame_starter_evidence_snapshots WHERE schema_version=${MLB_STARTER_EVIDENCE_224C_VERSION} AND pit_safe) teams_represented,
       (SELECT count(DISTINCT official_player_id) FROM mlb_pregame_starter_evidence_snapshots WHERE schema_version=${MLB_STARTER_EVIDENCE_224C_VERSION} AND official_player_id IS NOT NULL) unique_starters,
      (SELECT count(*) FROM (SELECT official_player_id FROM mlb_pregame_starter_evidence_snapshots
         WHERE schema_version=${MLB_STARTER_EVIDENCE_224C_VERSION} AND official_player_id IS NOT NULL GROUP BY official_player_id HAVING count(DISTINCT official_game_id)>1) x) repeat_starters,
      (SELECT count(*) FROM mlb_v4_starter_pit_states
        WHERE state_schema_version=${MLB_V4_STARTER_STATE_VERSION} AND source_cutoff >= feature_cutoff)
        + (SELECT count(*) FROM mlb_v4_team_pit_states
          WHERE state_schema_version=${MLB_V4_TEAM_STATE_VERSION} AND source_cutoff >= feature_cutoff)
        + (SELECT count(*) FROM mlb_v4_context_states
          WHERE schema_version=${MLB_V4_CONTEXT_VERSION} AND source_cutoff >= feature_cutoff)
        + (SELECT count(*) FROM mlb_v4_pregame_feature_snapshots
          WHERE schema_version=${MLB_V4_INPUT_SCHEMA} AND feature_cutoff >= scheduled_first_pitch) pit_violations,
      (SELECT count(*) FROM mlb_v4_pregame_feature_snapshots
        WHERE schema_version=${MLB_V4_INPUT_SCHEMA}
          AND lower(features::text) ~ '"(odds|moneyline|sportsbook|market|price|line|edge|clv|units)"') market_leakage,
      (SELECT count(*) FROM mlb_v4_pregame_feature_snapshots
        WHERE schema_version=${MLB_V4_INPUT_SCHEMA}
          AND lower(features::text) ~ '"(homeruns|awayruns|finalscore|result|winner|runsallowed|earnedruns|actualstarter)"') target_leakage,
      (SELECT count(*) FROM mlb_v4_pregame_feature_snapshots
        WHERE schema_version=${MLB_V4_INPUT_SCHEMA}
          AND lower(features::text) ~ '"actualstarter"') actual_starter_leakage,
      (SELECT count(*) FROM mlb_v4_collection_runs r
        WHERE r.collector_version = ${MLB_V4_COLLECTOR_VERSION} AND r.status='FAILED' AND EXISTS (
          SELECT 1 FROM mlb_v4_collection_run_events e
          WHERE e.run_id = r.run_id AND e.event_type = 'STARTED'
        )) source_failures,
      (SELECT count(*) FROM mlb_v4_collection_run_events e
        INNER JOIN mlb_v4_collection_runs r
          ON r.run_id = e.run_id AND r.collector_version = ${MLB_V4_COLLECTOR_VERSION}
        WHERE e.event_type='DOWNSTREAM_COMPLETED') successful_lifecycle_cycles,
      (SELECT max(r.started_at)::text FROM mlb_v4_collection_runs r
        WHERE r.collector_version = ${MLB_V4_COLLECTOR_VERSION} AND EXISTS (
          SELECT 1 FROM mlb_v4_collection_run_events e
          WHERE e.run_id = r.run_id AND e.event_type = 'STARTED'
        )) last_attempt,
      (SELECT max(r.completed_at)::text FROM mlb_v4_collection_runs r
        WHERE r.collector_version = ${MLB_V4_COLLECTOR_VERSION}
          AND r.status IN ('SUCCEEDED','PARTIAL') AND EXISTS (
          SELECT 1 FROM mlb_v4_collection_run_events e
          WHERE e.run_id = r.run_id AND e.event_type = 'STARTED'
        )) last_successful_run,
      (SELECT r.artifact_hash FROM mlb_v4_collection_runs r
        WHERE r.collector_version = ${MLB_V4_COLLECTOR_VERSION} AND EXISTS (
          SELECT 1 FROM mlb_v4_collection_run_events e
          WHERE e.run_id = r.run_id AND e.event_type = 'STARTED'
        )
        ORDER BY r.completed_at DESC LIMIT 1) latest_artifact_hash
  `);
  const r = (query.rows[0] ?? {}) as Record<string, unknown>;
  const counts: ReadinessCounts = {
    collectionRuns: numeric(r.collection_runs), scheduledGames: numeric(r.scheduled_games),
    capturedGames: numeric(r.captured_games), bothStarterGames: numeric(r.both_starter_games),
    starterStates: numeric(r.starter_states), featureSnapshots: numeric(r.feature_snapshots),
    baselineSnapshots: numeric(r.baseline_snapshots),
    starterCoreSnapshots: numeric(r.starter_core_snapshots), completedPairs: numeric(r.completed_pairs),
    starterCorePairs: numeric(r.starter_core_pairs), teamsRepresented: numeric(r.teams_represented),
    uniqueStarters: numeric(r.unique_starters), repeatStarters: numeric(r.repeat_starters),
    pitViolations: numeric(r.pit_violations), marketLeakage: numeric(r.market_leakage),
    targetLeakage: numeric(r.target_leakage), actualStarterLeakage: numeric(r.actual_starter_leakage),
    sourceFailures: numeric(r.source_failures), successfulLifecycleCycles: numeric(r.successful_lifecycle_cycles),
    lastAttempt: r.last_attempt ? String(r.last_attempt) : null,
    lastSuccessfulRun: r.last_successful_run ? String(r.last_successful_run) : null,
    latestArtifactHash: r.latest_artifact_hash ? String(r.latest_artifact_hash) : null,
  };
  return buildReadiness(counts, new Date());
}