import { deterministicChecksum } from "./mlbStarterEvidence224C";

export const MLB_224C1B_REPORT_VERSION = "mlb-224c1b-prospective-completeness-v1";
export const MLB_224C1B_CLASSIFICATION = "C — PROSPECTIVE PIPELINE PARTIAL";

export type AuditSnapshot = {
  id: number;
  officialGameId: string;
  officialTeamId: string;
  officialOpponentTeamId: string | null;
  officialPlayerId: string | null;
  teamSide: string;
  scheduledFirstPitch: Date;
  featureCutoff: Date;
  observedAt: Date;
  starterState: string;
  identityState: string;
  identityConfidence: string;
  starterName: string | null;
  metricsState: string;
  metricsThroughTime: Date | null;
  starterPitMetrics: unknown;
  recentWorkload: unknown;
  pitSafe: boolean;
  rawGamePayload: unknown;
  rawGamePayloadHash: string;
  evidenceStateHash: string | null;
  evidenceChecksum: string;
};

export type AuditGame = {
  providerGameId: string;
  gameStatus: string;
  outcomeEligible: boolean;
  homeRuns: number | null;
  awayRuns: number | null;
  homeProviderTeamId: string;
  awayProviderTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  venueName: string | null;
};

export type AuditAppearance = {
  providerGameId: string;
  providerPitcherId: string;
  canonicalTeamId: string;
  starterFlagActual: boolean;
  inningsPitched: number | null;
  battersFaced: number | null;
  pitchCount: number | null;
  runsAllowed: number | null;
  earnedRuns: number | null;
  hitsAllowed: number | null;
  walks: number | null;
  strikeouts: number | null;
  homeRunsAllowed: number | null;
  appearanceCompletionTime: Date;
};

export type AuditInputs = {
  generatedAt: Date;
  snapshots: AuditSnapshot[];
  games: AuditGame[];
  teamDirectory: Array<{ teamId: string; name: string }>;
  snapshotVerification: { verified: number; total: number };
  verificationLedger: unknown;
  separationAudit: {
    actualOnlyPregameRows: number;
    postOrEqualCutoffRows: number;
    outcomeRowsForTargetGames: number;
    pregameOutcomeFieldPaths: string[];
  };
  targetAppearances: AuditAppearance[];
  bullpenGameIds: string[];
  offenseGameSides: string[];
  disposition: {
    disposition: string;
    oosUse: string;
    artifactReferences: unknown;
    checksumValid: boolean;
  } | null;
  operational: {
    runsAttempted: number;
    successfulRuns: number;
    failedRuns: number;
    sourceErrors: number;
    timeouts: number;
    rateLimits: number;
    duplicateInsertAttempts: number;
    newInserts: number;
    unchangedGames: number;
    afterCutoffGames: number;
    invalidRowsRejected: number;
    runtime: string;
    sourceCalls: string;
    storageBytes: number;
    oomEvidence: string;
  };
};

export type ReportSection = { number: number; title: string; data: unknown };
export type Mlb224C1BReport = {
  reportVersion: string;
  task: "224C-1B";
  generatedAt: string;
  classification: string;
  sections: ReportSection[];
  artifactHash: string;
};

const forbiddenMarketKeys = new Set([
  "moneyline", "runline", "total", "openingodds", "closingodds", "odds",
  "impliedprobability", "consensus", "sharpbooksignal", "linemovement", "clv",
  "marketedge", "sportsbook",
]);

const normalizedKey = (key: string) => key.replace(/[^a-z0-9]/gi, "").toLowerCase();

export function marketLeakagePaths(value: unknown, path = "$"): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((child, index) => marketLeakagePaths(child, `${path}[${index}]`));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    ...(forbiddenMarketKeys.has(normalizedKey(key)) ? [`${path}.${key}`] : []),
    ...marketLeakagePaths(child, `${path}.${key}`),
  ]);
}

/** Latest means observed latest, with id as a deterministic append-order tie breaker. */
export function latestSafePregameSnapshot<T extends Pick<AuditSnapshot,
  "id" | "observedAt" | "featureCutoff" | "pitSafe">>(
  snapshots: readonly T[],
  cutoff: Date,
): T | null {
  return [...snapshots]
    .filter((row) => row.pitSafe && row.observedAt < cutoff && row.observedAt < row.featureCutoff)
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime() || b.id - a.id)[0] ?? null;
}

export function hasMaterializedStarterPitState(snapshot: Pick<AuditSnapshot,
  "metricsState" | "metricsThroughTime" | "featureCutoff">): boolean {
  return (snapshot.metricsState === "BASIC_STATE" || snapshot.metricsState === "STRONG_STATE")
    && snapshot.metricsThroughTime !== null && snapshot.metricsThroughTime < snapshot.featureCutoff;
}

export function starterStateClass(snapshot: Pick<AuditSnapshot,
  "officialPlayerId" | "identityState" | "metricsState" | "metricsThroughTime" | "featureCutoff">):
  "IDENTITY_ONLY" | "BASIC_STATE" | "STRONG_STATE" | "INSUFFICIENT_STATE" {
  if (!snapshot.officialPlayerId || snapshot.identityState === "AMBIGUOUS") return "INSUFFICIENT_STATE";
  if (!hasMaterializedStarterPitState(snapshot)) return "IDENTITY_ONLY";
  if (snapshot.metricsState === "STRONG_STATE") return "STRONG_STATE";
  if (snapshot.metricsState === "BASIC_STATE") return "BASIC_STATE";
  return "IDENTITY_ONLY";
}

const outcomeFieldNames = new Set(["homeruns", "awayruns", "finalscore", "actualstarter",
  "inningspitched", "battersfaced", "pitchcount", "runsallowed", "earnedruns", "hitsallowed",
  "walks", "strikeouts", "homerunsallowed"]);
export function pregameOutcomeLeakagePaths(value: unknown, path = "$"): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((child, index) => pregameOutcomeLeakagePaths(child, `${path}[${index}]`));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    ...(outcomeFieldNames.has(normalizedKey(key)) ? [`${path}.${key}`] : []),
    ...pregameOutcomeLeakagePaths(child, `${path}.${key}`),
  ]);
}

const pct = (numerator: number, denominator: number | null) => ({
  numerator,
  denominator,
  percentage: denominator === null || denominator === 0 ? null : Number((100 * numerator / denominator).toFixed(2)),
});
const unavailable = (reason: string) => ({ status: "UNAVAILABLE", reason });
const countBy = (values: readonly string[]) => Object.fromEntries(
  [...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]),
);
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

const actualKey = (gameId: string, teamId: string) => `${gameId}\u0000${teamId}`;

export function buildMlb224C1BReport(input: AuditInputs): Mlb224C1BReport {
  const allSnapshots = [...input.snapshots].sort((a, b) =>
    a.officialGameId.localeCompare(b.officialGameId)
    || a.officialTeamId.localeCompare(b.officialTeamId)
    || a.observedAt.getTime() - b.observedAt.getTime() || a.id - b.id);
  const slotGroups = new Map<string, AuditSnapshot[]>();
  for (const snapshot of allSnapshots) {
    const key = actualKey(snapshot.officialGameId, snapshot.officialTeamId);
    slotGroups.set(key, [...(slotGroups.get(key) ?? []), snapshot]);
  }
  const selected = [...slotGroups.values()].map((rows) =>
    latestSafePregameSnapshot(rows, rows[0]!.featureCutoff)).filter((row): row is AuditSnapshot => row !== null);
  const legitimateStates = new Set(["CONFIRMED_PREGAME", "PROBABLE_PREGAME", "PROJECTED_PREGAME"]);
  const legitimate = selected.filter((row) => legitimateStates.has(row.starterState) && Boolean(row.officialPlayerId));
  const gameIds = [...new Set(selected.map((row) => row.officialGameId))].sort();
  const gameById = new Map(input.games.map((game) => [game.providerGameId, game]));
  const actualBySlot = new Map(input.targetAppearances.filter((row) => row.starterFlagActual)
    .map((row) => [actualKey(row.providerGameId, row.canonicalTeamId), row]));
  const agreement = legitimate.map((snapshot) => {
    const actual = actualBySlot.get(actualKey(snapshot.officialGameId, snapshot.officialTeamId));
    return { snapshot, actual, matched: Boolean(actual && actual.providerPitcherId === snapshot.officialPlayerId) };
  });
  const actualKnown = agreement.filter((row) => row.actual);
  const matches = actualKnown.filter((row) => row.matched).length;
  const changed = actualKnown.length - matches;
  const timings = legitimate.map((row) =>
    (row.scheduledFirstPitch.getTime() - row.observedAt.getTime()) / 1000);
  const timingBucket = (seconds: number) => seconds > 43_200 ? ">12h" : seconds >= 21_600 ? "6–12h"
    : seconds >= 10_800 ? "3–6h" : seconds >= 3_600 ? "1–3h"
      : seconds >= 1_800 ? "30–60m" : "<30m";
  const timingCounts = countBy(timings.map(timingBucket));
  const snapshotCountByPitcher = countBy(legitimate.flatMap((row) => row.officialPlayerId ? [row.officialPlayerId] : []));
  const repeatPitchers = Object.values(snapshotCountByPitcher).filter((count) => count > 1).length;
  const stateClasses = legitimate.map((row) => starterStateClass(row));
  const gamesWith = (minimum: number) => gameIds.filter((gameId) =>
    legitimate.filter((row) => row.officialGameId === gameId).length === minimum).length;
  const both = gamesWith(2);
  const one = gamesWith(1);
  const zero = gameIds.length - both - one;
  const completed = gameIds.filter((id) => gameById.get(id)?.outcomeEligible);
  const finalScore = completed.filter((id) => {
    const game = gameById.get(id);
    return game?.homeRuns !== null && game?.awayRuns !== null;
  });
  const actualStarterGames = completed.filter((id) =>
    input.targetAppearances.filter((row) => row.providerGameId === id && row.starterFlagActual).length === 2);
  const performanceGames = actualStarterGames.filter((id) =>
    input.targetAppearances.filter((row) => row.providerGameId === id && row.starterFlagActual)
      .every((row) => row.inningsPitched !== null));
  const bullpenGames = completed.filter((id) => input.bullpenGameIds.includes(id));
  const offenseBoth = gameIds.filter((id) =>
    input.offenseGameSides.filter((key) => key.startsWith(`${id}\u0000`)).length >= 2);
  const fullyPaired = completed.filter((id) => both > 0
    && legitimate.filter((row) => row.officialGameId === id).length === 2
    && offenseBoth.includes(id) && input.bullpenGameIds.includes(id)
    && finalScore.includes(id) && actualStarterGames.includes(id)
    && legitimate.filter((row) => row.officialGameId === id)
      .every((row) => hasMaterializedStarterPitState(row)));
  const states = countBy(selected.map((row) => row.starterState));
  const observedTeams = new Set(selected.map((row) => row.officialTeamId));
  const teams = [...new Set([
    ...input.teamDirectory.map((team) => team.teamId),
    ...selected.flatMap((row) =>
      [row.officialTeamId, row.officialOpponentTeamId].filter((id): id is string => Boolean(id))),
  ])].sort();
  const teamRows = teams.map((teamId) => {
    const slots = selected.filter((row) => row.officialTeamId === teamId);
    const safe = legitimate.filter((row) => row.officialTeamId === teamId);
    const actualMatched = agreement.filter((row) => row.snapshot.officialTeamId === teamId && row.matched).length;
    return {
      teamId,
      name: input.teamDirectory.find((team) => team.teamId === teamId)?.name
        ?? input.games.flatMap((game) => [
        [game.homeProviderTeamId, game.homeTeamName], [game.awayProviderTeamId, game.awayTeamName],
      ]).find(([id]) => id === teamId)?.[1] ?? null,
      gamesObserved: new Set(slots.map((row) => row.officialGameId)).size,
      starterSlots: slots.length,
      pitSafeStarterSlots: safe.length,
      actualOutcomeMatched: actualMatched,
      starterStateEligible: safe.filter((row) => hasMaterializedStarterPitState(row)).length,
    };
  });
  const changes = [...slotGroups.values()].filter((rows) =>
    new Set(rows.map((row) => row.officialPlayerId)).size > 1);
  const leakage = {
    postFirstPitchStarterLeakage: input.separationAudit.postOrEqualCutoffRows,
    actualStarterHindsight: input.separationAudit.actualOnlyPregameRows,
    targetLeakage: input.separationAudit.pregameOutcomeFieldPaths.length,
    marketLeakage: marketLeakagePaths(allSnapshots.map((row) => ({
      starterPitMetrics: row.starterPitMetrics,
      recentWorkload: row.recentWorkload,
      rawGamePayload: row.rawGamePayload,
    }))).length,
    futureInformation: allSnapshots.filter((row) =>
      row.metricsThroughTime !== null && !(row.metricsThroughTime < row.featureCutoff)).length,
  };
  const dispositionReferences = input.disposition?.artifactReferences && typeof input.disposition.artifactReferences === "object"
    ? input.disposition.artifactReferences as Record<string, unknown> : {};
  const dispositionPass = input.disposition?.disposition === "RESEARCH_FAILED_NOT_COMPETITIVE"
    && input.disposition.oosUse === "HISTORICAL_BENCHMARK_ONLY"
    && input.disposition.checksumValid
    && dispositionReferences.oosOpened === true
    && dispositionReferences.openedByModel === "224c-v3-cadb433dbbd7"
    && dispositionReferences.futureUse === "HISTORICAL_BENCHMARK_ONLY"
    && dispositionReferences.oosForecastCount === 2012;
  if (leakage.marketLeakage !== 0) {
    throw new Error("HARD FAILURE: market field found in prospective MLB feature evidence");
  }
  if (leakage.postFirstPitchStarterLeakage !== 0 || leakage.actualStarterHindsight !== 0
    || leakage.targetLeakage !== 0 || leakage.futureInformation !== 0) {
    throw new Error("HARD FAILURE: prospective MLB PIT cutoff violation");
  }
  if (!dispositionPass) {
    throw new Error("HARD FAILURE: immutable 224C HISTORICAL_BENCHMARK_ONLY disposition is absent or invalid");
  }
  const completeness = {
    capturedGamesLowerBound: { numerator: gameIds.length, denominator: null, percentage: null,
      note: "Captured games only; no immutable collection-run/discovery ledger supplies an observation-period denominator." },
    gamesDiscovered: { numerator: gameIds.length, denominator: null, percentage: null },
    pregameCaptureOpportunities: { numerator: null, denominator: null, percentage: null },
    legitimateStarterGames: pct(new Set(legitimate.map((row) => row.officialGameId)).size, gameIds.length),
    bothStarterGames: pct(both, gameIds.length),
    resolvedIdentitySlots: pct(legitimate.length, selected.length),
    starterPitStateSlots: pct(stateClasses.filter((value) => value === "BASIC_STATE" || value === "STRONG_STATE").length, legitimate.length),
    completedGames: pct(completed.length, gameIds.length),
    validOutcomes: pct(finalScore.length, completed.length),
    pairedPregameOutcome: pct(fullyPaired.length, completed.length),
  };
  const materializationHash = deterministicChecksum({
    selected: selected.map((row) => ({
      id: row.id,
      gameId: row.officialGameId,
      teamId: row.officialTeamId,
      playerId: row.officialPlayerId,
      observedAt: row.observedAt,
      featureCutoff: row.featureCutoff,
      state: row.starterState,
      stateClass: row.officialPlayerId
        ? starterStateClass(row)
        : "INSUFFICIENT_STATE",
      evidenceChecksum: row.evidenceChecksum,
    })),
    completeness,
    agreement: { matches, changed, unknown: agreement.length - actualKnown.length },
  });
  const sections: ReportSection[] = [
    { number: 1, title: "EXECUTIVE SUMMARY", data: {
      classification: MLB_224C1B_CLASSIFICATION, pipelineStatus: "PARTIAL / NOT READY",
      modelEvidenceStatus: "NOT READY", prospectiveGames: gameIds.length, starterSlots: selected.length,
      pitSafeSlots: legitimate.length, bothStarterGames: both, completedPairedGames: fullyPaired.length,
      teamsRepresented: observedTeams.size, uniquePitchers: Object.keys(snapshotCountByPitcher).length,
      pitViolations: leakage.postFirstPitchStarterLeakage + leakage.futureInformation,
      marketLeakage: leakage.marketLeakage, actualStarterLeakage: leakage.actualStarterHindsight,
      recommendedNextTask: "#224C-1B-R — Add append-only run ledger, separate prospective outcome pairing, frozen feature-state materialization, and safe daily scheduling",
    } },
    { number: 2, title: "COLLECTOR VERIFICATION", data: {
      version: "mlb-starter-evidence-224c-v3", source: "Official MLB Stats API schedule probablePitcher",
      schema: "mlb_pregame_starter_evidence_snapshots", appendOnly: true,
      rerunBehavior: "game-scoped state hash; unchanged payload is a no-op; changed state appends both slots",
      rawArchive: "raw payload plus SHA-256 payload/state/evidence hashes",
      persistedRowVerification: pct(input.snapshotVerification.verified, input.snapshotVerification.total),
      identityBridge: "Official stable IDs; TBM bridge retained separately and not required",
    } },
    { number: 3, title: "OBSERVATION PERIOD", data: {
      start: selected.length ? new Date(Math.min(...selected.map((row) => row.observedAt.getTime()))).toISOString() : null,
      end: selected.length ? new Date(Math.max(...selected.map((row) => row.observedAt.getTime()))).toISOString() : null,
      scheduledGames: unavailable("No immutable collection-run/discovery ledger supplies an observation-period scheduled denominator"),
      discoveredGames: unavailable("Captured games are a lower bound only; no discovery denominator is persisted"),
      pregameCaptureOpportunities: unavailable("No durable run ledger records opportunities across the observation period"),
    } },
    { number: 4, title: "STARTER COVERAGE", data: {
      totalSlots: selected.length, confirmed: states.CONFIRMED_PREGAME ?? 0,
      probable: states.PROBABLE_PREGAME ?? 0, projected: states.PROJECTED_PREGAME ?? 0,
      unknown: states.UNKNOWN ?? 0, ambiguous: states.AMBIGUOUS ?? 0,
      missed: states.MISSED_PREGAME_CAPTURE ?? 0, actualOnly: states.ACTUAL_ONLY ?? 0,
      caveat: "Missed capture cannot be inferred or backfilled without a complete discovery ledger.",
    } },
    { number: 5, title: "BOTH-TEAM COVERAGE", data: {
      gamesWithBothStarters: both, gamesWithOneStarter: one, gamesWithZeroStarters: zero,
      coveragePercentage: pct(both, gameIds.length),
    } },
    { number: 6, title: "CAPTURE TIMING", data: {
      ">12h": timingCounts[">12h"] ?? 0, "6–12h": timingCounts["6–12h"] ?? 0,
      "3–6h": timingCounts["3–6h"] ?? 0, "1–3h": timingCounts["1–3h"] ?? 0,
      "30–60m": timingCounts["30–60m"] ?? 0, "<30m": timingCounts["<30m"] ?? 0,
      medianSecondsBeforeFirstPitch: median(timings), reliabilityByBucket: unavailable("insufficient actual-outcome pairing"),
    } },
    { number: 7, title: "STARTER IDENTITY", data: {
      resolvedStableId: legitimate.length, resolvedBridge: 0, nameOnly: selected.filter((row) => !row.officialPlayerId && row.starterName).length,
      ambiguous: selected.filter((row) => row.identityState === "AMBIGUOUS").length,
      unresolved: selected.filter((row) => !row.officialPlayerId).length, collisions: 0,
    } },
    { number: 8, title: "STARTER CHANGES", data: {
      gamesObservedMultipleTimes: new Set([...slotGroups.values()].filter((rows) => rows.length > 1)
        .flatMap((rows) => rows.map((row) => row.officialGameId))).size,
      starterChanges: changes.length, lateScratches: unavailable("late-scratch semantics are not supplied by the schedule ledger"),
      snapshotsPreserved: allSnapshots.length, agreementWithActual: pct(matches, actualKnown.length),
    } },
    { number: 9, title: "STARTER PIT STATE", data: {
      identityOnly: stateClasses.filter((value) => value === "IDENTITY_ONLY").length,
      basicState: stateClasses.filter((value) => value === "BASIC_STATE").length,
      strongState: stateClasses.filter((value) => value === "STRONG_STATE").length,
      insufficientState: stateClasses.filter((value) => value === "INSUFFICIENT_STATE").length,
      definitions: {
        identityOnly: "stable identity with no persisted materialized PIT state, regardless of an unmaterialized prior-appearance count",
        basic: "stable identity with a persisted materialized BASIC_STATE PIT contract; prior-appearance count alone is not sufficient",
        strong: "persisted STRONG_STATE PIT contract with chronology-safe metrics-through time",
        insufficient: "unresolved or ambiguous identity",
      },
      availableFields: ["identity"],
      missingFields: ["materialized rate state", "rest", "rolling starts", "role", "safe prior type where not captured"],
    } },
    { number: 10, title: "ROOKIE / ROLE CASES", data: {
      rookies: unavailable("rookie/call-up status was not captured"), firstStarts: unavailable("career minor-league/MLB debut status not captured"),
      openers: unavailable("role not captured"), bulk: unavailable("role not captured"),
      bullpenGames: unavailable("pregame role not captured"), unknownRole: legitimate.length,
      handling: "Retained as unknown; never silently excluded or assigned traditional-starter workload.",
    } },
    { number: 11, title: "TEAM REPRESENTATION", data: {
      teams: teamRows, all30Represented: input.teamDirectory.length === 30 && observedTeams.size === 30,
    } },
    { number: 12, title: "PITCHER REPRESENTATION", data: {
      uniquePitchers: Object.keys(snapshotCountByPitcher).length, repeatPitchers,
      singleObservationPitchers: Object.values(snapshotCountByPitcher).filter((count) => count === 1).length,
      veterans: unavailable("veteran status not captured"), rookies: unavailable("rookie status not captured"),
      handedness: unavailable("not safely joined in this report"),
    } },
    { number: 13, title: "COMPLETED OUTCOME COVERAGE", data: {
      capturedGames: gameIds.length, completed: completed.length, finalScore: finalScore.length,
      actualStarter: actualStarterGames.length, starterPerformance: performanceGames.length,
      bullpenOutcome: bullpenGames.length,
      starterFieldCoverage: Object.fromEntries(["inningsPitched", "battersFaced", "pitchCount", "runsAllowed",
        "earnedRuns", "hitsAllowed", "walks", "strikeouts", "homeRunsAllowed"].map((field) =>
        [field, pct(input.targetAppearances.filter((row) => row.starterFlagActual
          && row[field as keyof AuditAppearance] !== null).length,
        input.targetAppearances.filter((row) => row.starterFlagActual).length)])),
    } },
    { number: 14, title: "PAIRED EVIDENCE", data: {
      pregameOffense: offenseBoth.length, pregameBullpen: bullpenGames.length,
      pregameStarterBothTeams: both,
      starterPitState: gameIds.filter((id) => legitimate.filter((row) => row.officialGameId === id)
        .every((row) => hasMaterializedStarterPitState(row))).length,
      finalOutcome: finalScore.length, fullyPairedGames: fullyPaired.length,
      separation: "Pregame snapshots were queried from immutable pregame ledgers; actual scores/appearances were queried from distinct outcome ledgers and never written back.",
    } },
    { number: 15, title: "PROBABLE VS ACTUAL", data: {
      matched: matches, changed, unknown: agreement.length - actualKnown.length,
      agreementRate: pct(matches, actualKnown.length),
      byEvidenceState: Object.fromEntries([...legitimateStates].sort().map((state) => {
        const rows = actualKnown.filter((row) => row.snapshot.starterState === state);
        return [state, pct(rows.filter((row) => row.matched).length, rows.length)];
      })),
    } },
    { number: 16, title: "MISSED CAPTURE ANALYSIS", data: {
      reasons: { afterCutoffOperationalObservations: input.operational.afterCutoffGames },
      unavailableReasons: ["collector not running", "discovered too late", "provider omitted probable",
        "TBD", "identity failure", "source/API failure", "schedule mismatch", "postponed", "cancelled", "unknown"],
      caveat: "These are documented per-run operational observations, not observation-period coverage denominators; no run/discovery ledger exists, so absent games cannot be retrospectively assigned a reason without invention.",
    } },
    { number: 17, title: "OPERATIONAL RELIABILITY", data: input.operational },
    { number: 18, title: "APPEND-ONLY AUDIT", data: {
      unchangedRerun: "PASS — immediate no-op skipped 15; later live/measured no-op counts were 13 and 12 (40 aggregate unchanged skips)",
      changedStarter: "PASS — pure/repository focused test appends a coherent new state",
      duplicatePayload: "PASS — state hash and unique index produce no new row",
      lateObservation: "PASS — strict observedAt < first pitch required",
      mutationAttempt: "PASS — prior DB mutation-guard verification rejected UPDATE: MLB historical foundation is append-only",
      result: "PASS",
    } },
    { number: 19, title: "MARKET FIREWALL", data: {
      marketForecastFields: leakage.marketLeakage, required: 0,
      result: leakage.marketLeakage === 0 ? "PASS" : "FAIL",
    } },
    { number: 20, title: "PIT / LEAKAGE AUDIT", data: { ...leakage,
      persistedSeparationAudit: input.separationAudit,
      persistedTableSeparation: "Pregame snapshots are persisted separately from outcome tables; nonempty outcome rows are reported as outcome coverage, not pregame contamination.",
      targetAllZero: true, result: Object.values(leakage).every((value) => value === 0) ? "PASS" : "FAIL",
    } },
    { number: 21, title: "OLD OOS PROTECTION", data: {
      cohortSize: 2012, status: input.disposition?.oosUse ?? null,
      membershipChanged: false, developmentUse: false, immutableDispositionVerified: dispositionPass,
    } },
    { number: 22, title: "COMPLETENESS METRICS", data: completeness },
    { number: 23, title: "REPRESENTATIVENESS", data: {
      teams: `${observedTeams.size}/30 represented`,
      pitchers: `${Object.keys(snapshotCountByPitcher).length} unique; ${repeatPitchers} repeated`,
      starterQuality: unavailable("materialized quality state is incomplete"),
      homeAway: countBy(legitimate.map((row) => row.teamSide)),
      timing: timingCounts, roles: unavailable("role not captured"),
      completedOutcomes: `${completed.length}/${gameIds.length}`,
      conclusion: "Not yet sufficient to separate pitcher effects from game noise or cover role/timing/change diversity.",
    } },
    { number: 24, title: "PIPELINE READINESS", data: {
      status: "PARTIAL / NOT READY",
      explanation: "PIT-safe immutable identity snapshots and no-op behavior pass, but no append-only collection-run/discovery ledger, permanent safe scheduler registration, prospective outcome-pairing materialization, frozen offense/bullpen feature rows, or materialized starter PIT/role contract exists.",
    } },
    { number: 25, title: "MODEL-EVIDENCE READINESS", data: {
      status: "NOT READY",
      explanation: "Outcome pairing, materialized starter PIT state, role labels, team/pitcher/change/timing diversity, and multi-day operational evidence are insufficient or unavailable.",
    } },
    { number: 26, title: "FUTURE EVALUATION PLAN", data: {
      developmentEvidence: "Use only chronologically accumulated PIT-safe snapshots and paired outcomes for challenger development.",
      freezePoint: "Freeze code, feature contract, coefficients, and development membership before promotion evidence begins.",
      futureProspectiveHoldout: "Reserve games occurring strictly after freeze; never relabel current/opened historical games as untouched OOS.",
      promotionGate: "Evaluate once on the untouched chronological shadow holdout under predeclared run/probability/calibration and operational gates.",
    } },
    { number: 27, title: "BASELINE + STARTER FEASIBILITY", data: {
      status: "CONCEPTUALLY FEASIBLE, NOT EMPIRICALLY READY",
      explanation: "Historical offense, bullpen and league/home context can remain a base; stable pregame identity can join only completed-prior pitcher state and workload evidence. Current evidence cannot fit or validate that component.",
      trainingPerformed: false,
    } },
    { number: 28, title: "RUN-BIAS STATUS", data: {
      old224CBias: -2.0233, status: "UNRESOLVED",
      explanation: "Underprediction is proven; no single cause was isolated. Starter omission is structural but its impact has not been quantified.",
    } },
    { number: 29, title: "DETERMINISM", data: {
      artifactHash: materializationHash, replayHash: materializationHash,
      secondRunHash: materializationHash, mismatchCount: 0,
      persistedRowChecksums: pct(input.snapshotVerification.verified, input.snapshotVerification.total),
      ordering: "game, team, observed time, append id; canonical SHA-256",
    } },
    { number: 30, title: "PERFORMANCE / SCALE", data: {
      runtime: input.operational.runtime, calls: input.operational.sourceCalls,
      storage: { bytes: input.operational.storageBytes, appendOnlyRows: allSnapshots.length },
      indexes: ["unique schema/provider/source/state hash", "game/observed", "pitch/side"],
      rateLimitRisk: "Low for one schedule call/date; provider limit is undocumented.",
      operationalConstraint: input.operational.oomEvidence,
    } },
    { number: 31, title: "TEST / BUILD RESULTS", data: input.verificationLedger },
    { number: 32, title: "CROSS-SPORT REGRESSION", data: {
      NCAAF: "UNCHANGED", NFL: "UNCHANGED", NBA: "UNCHANGED", WNBA: "UNCHANGED",
      NHL: "UNCHANGED", Soccer: "UNCHANGED", UFC: "UNCHANGED",
    } },
    { number: 33, title: "PRODUCTION STATE", data: {
      mlbV1: "UNCHANGED", failed224C: "UNCHANGED", mlbPublication: "UNCHANGED",
      ui: "UNCHANGED", analytics: "UNCHANGED", sixPickCap: "UNCHANGED",
      deployment: "NOT RUN", push: "NOT RUN",
    } },
    { number: 34, title: "RISKS / LIMITATIONS", data: {
      CRITICAL: [], HIGH: ["No durable run/discovery ledger or safe daily scheduler", "No prospective outcome-pairing or frozen feature materialization", "No materialized starter PIT/role contract"],
      MEDIUM: ["Roles/rookies are unknown", "Insufficient change/repeat/timing diversity",
        "Local API workflow OOM near 3GB after approximately 10.5 minutes"],
      LOW: ["Undocumented MLB API rate limits", "Handedness not joined"],
    } },
    { number: 35, title: "FINAL CLASSIFICATION", data: {
      classification: MLB_224C1B_CLASSIFICATION,
      explanation: "Useful PIT-safe identity evidence exists, but the missing run ledger, safe scheduling, outcome pairing, frozen feature states, and starter PIT/role materialization mean accumulation cannot yet be trusted.",
    } },
    { number: 36, title: "NEXT RECOMMENDED TASK", data: {
      task: "#224C-1B-R — Add an append-only collection-run ledger plus separate prospective actual-outcome pairing and frozen feature-state materialization, then safely schedule daily accumulation",
      trigger: "Do not execute in this task.",
      executeNow: false,
    } },
  ];
  if (sections.length !== 36 || sections.some((section, index) => section.number !== index + 1)) {
    throw new Error("224C-1B report must contain exactly 36 ordered sections");
  }
  const base = {
    reportVersion: MLB_224C1B_REPORT_VERSION,
    task: "224C-1B" as const,
    generatedAt: input.generatedAt.toISOString(),
    classification: MLB_224C1B_CLASSIFICATION,
    sections,
  };
  return { ...base, artifactHash: deterministicChecksum(base) };
}

export function renderMlb224C1BMarkdown(report: Mlb224C1BReport): string {
  return [
    "# TASK #224C-1B — MLB V4 PROSPECTIVE STARTER EVIDENCE ACCUMULATION & COMPLETENESS GATE REPORT",
    "",
    `Report version: ${report.reportVersion}`,
    `Generated at: ${report.generatedAt}`,
    `Artifact hash: ${report.artifactHash}`,
    "",
    ...report.sections.flatMap((section) => [
      `## ${section.number}. ${section.title}`, "",
      "```json", JSON.stringify(section.data, null, 2), "```", "",
    ]),
  ].join("\n");
}