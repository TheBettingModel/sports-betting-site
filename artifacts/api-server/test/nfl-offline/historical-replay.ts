import type { NflHistoricalGame, NflV4Artifact } from "../../src/services/nflV4";
import { createNflV4Engine } from "virtual:nfl-legacy-history";
import { createNflV4Engine as createVerifiedReplay } from "virtual:nfl-verified-replay";
import { timestamp, providerId } from "../../src/services/nflHistoricalResultNormalization";
import type { NflBundleReport } from "../../src/services/nflHistoricalBundle";

/** Test-runner-only replay. The virtual module is an in-memory, reviewable
 * availability patch to the SAME engine source; no copied model equations.
 * Neither engine.collectEvidence nor any forecast ledger is ever invoked.
 */
export async function compareNflHistoricalReplay(input: {
  artifact: NflV4Artifact;
  event: { id: string; homeTeamId: string; awayTeamId: string; startsAt: string };
  legacyHistory: readonly NflHistoricalGame[];
  bundle: NflBundleReport;
  now: string;
}) {
  if (process.env.NFL_OFFLINE_ONLY !== "true" || process.env.NODE_ENV !== "test") {
    throw new Error("GUARDED_OFFLINE_RUNNER_REQUIRED");
  }
  if (input.bundle.status !== "READY_FOR_OFFLINE_REPLAY") throw new Error("BUNDLE_NOT_READY");
  const now = timestamp(input.now), target = timestamp(input.event.startsAt);
  if (!now || !target || now >= target || !providerId(input.event.id)
    || !providerId(input.event.homeTeamId) || !providerId(input.event.awayTeamId)
    || input.event.homeTeamId === input.event.awayTeamId) throw new Error("INVALID_REPLAY_CONTEXT");
  if (input.bundle.artifactHash !== input.artifact.artifactHash
    || input.bundle.frozenSeedBoundary !== timestamp(input.artifact.historySeed.asOf)
    || input.bundle.targetKickoff !== target) throw new Error("REPLAY_BUNDLE_BINDING_MISMATCH");
  const asOf = timestamp(input.bundle.verificationAsOf);
  if (!asOf || asOf > now) throw new Error("BUNDLE_NOT_AVAILABLE_AT_REPLAY_TIME");
  const until = timestamp(input.bundle.validUntil);
  if (!until || now >= until) throw new Error("REPLAY_BUNDLE_STALE");
  const before = JSON.stringify(input.artifact);
  const event = { ...input.event, startsAt: new Date(target) };
  const legacy = createNflV4Engine(input.artifact), verified = createVerifiedReplay(input.artifact);
  const rawHistory = (history: readonly NflHistoricalGame[]) => history.map(h => {
    const start = timestamp(h.eventStart), available = timestamp(h.completedAt);
    if (!start || !available || start <= input.artifact.historySeed.asOf || start >= target
      || available > now || !providerId(h.gameId) || !providerId(h.homeTeamId) || !providerId(h.awayTeamId)
      || h.homeTeamId === h.awayTeamId || !Number.isInteger(h.homeScore) || !Number.isInteger(h.awayScore)
      || h.homeScore < 0 || h.awayScore < 0) throw new Error("INVALID_REPLAY_HISTORY");
    return { id: h.gameId, homeTeamId: h.homeTeamId, awayTeamId: h.awayTeamId,
      startsAt: new Date(start), homeScore: h.homeScore, awayScore: h.awayScore,
      verifiedEvidenceAvailableAt: available };
  }).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));
  const legacyInput = await legacy.materializeInput({ event, history: rawHistory(input.legacyHistory) }, new Date(now));
  const verifiedInput = await verified.materializeInput({ event, history: rawHistory(input.bundle.history) }, new Date(now));
  legacy.validateInput(legacyInput); verified.validateInput(verifiedInput);
  const legacyOutput = await legacy.predict(legacyInput), verifiedOutput = await verified.predict(verifiedInput);
  const finite = (value: unknown): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("NONFINITE_REPLAY_OUTPUT");
    return value;
  };
  if (JSON.stringify(input.artifact) !== before) throw new Error("FROZEN_ARTIFACT_MUTATED");
  return {
    label: "OFFLINE_COMPARISON_NOT_HISTORICAL_PERFORMANCE" as const,
    artifactHash: input.artifact.artifactHash,
    legacy: { input: legacyInput, output: legacyOutput },
    verified: { input: verifiedInput, output: verifiedOutput },
    delta: {
      expectedHomeScore: finite(verifiedOutput.expectedHomeScore) - finite(legacyOutput.expectedHomeScore),
      expectedAwayScore: finite(verifiedOutput.expectedAwayScore) - finite(legacyOutput.expectedAwayScore),
      homeWinProbability: finite(verifiedOutput.homeWinProbability) - finite(legacyOutput.homeWinProbability),
    },
    persistenceAuthorized: false as const, productionActivationAuthorized: false as const,
  };
}
