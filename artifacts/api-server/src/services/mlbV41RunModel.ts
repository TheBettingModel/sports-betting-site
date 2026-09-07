/**
 * #212 audit challenger.  This is deliberately a wrapper, not a fork of V4's
 * formula: the diagnosis did not establish a score-changing defect.  Calling
 * V4 is the only safe way to guarantee that this diagnostic identity remains
 * exactly output-equivalent while it exposes a separately labelled
 * decomposition and cannot enter production paths.
 */
import { createHash } from "node:crypto";
import type { FetchedGame } from "./espn";
import { computeMlbV4Forecast, type MlbV4Forecast, type MlbV4Input } from "./mlbV4Challenger";

export const MLB_V41_MODEL_ID = "tbm-mlb-moneyline-v4-1";
export const MLB_V41_FEATURE_SCHEMA_VERSION = "mlb-v4-1-audit-features-v1";
export const MLB_V41_RUN_MODEL_VERSION = "mlb-v4-1-output-equivalent-audit-v1";
export const MLB_V41_DISTRIBUTION_VERSION = "independent-poisson-v1";
export const MLB_V41_CALIBRATION_VERSION = "mlb-v4-1-calibration-unfitted-v1";
export const MLB_V41_CONFIGURATION_HASH = createHash("sha256").update(JSON.stringify({
  modelId: MLB_V41_MODEL_ID, featureSchemaVersion: MLB_V41_FEATURE_SCHEMA_VERSION,
  runModelVersion: MLB_V41_RUN_MODEL_VERSION, distributionVersion: MLB_V41_DISTRIBUTION_VERSION,
  calibrationVersion: MLB_V41_CALIBRATION_VERSION, behavior: "exact_v4_output_equivalence",
})).digest("hex");

export interface MlbV41RunDecomposition {
  baseExpectedRuns: number; offensiveAdjustment: number; opposingStarterAdjustment: number;
  opposingStarterExpectedInnings: number | null; opposingStarterExpectedRunsAllowed: number | null;
  bullpenAdjustment: number; parkAdjustment: number; weatherAdjustment: number;
  homeFieldAdjustment: number; lineupAdjustment: number; platoonAdjustment: number;
  restContextAdjustment: number; unsupportedFeatureAdjustment: number; finalExpectedRuns: number;
}
export interface MlbV41Forecast {
  model: {
    modelId: typeof MLB_V41_MODEL_ID; featureSchemaVersion: typeof MLB_V41_FEATURE_SCHEMA_VERSION;
    runModelVersion: typeof MLB_V41_RUN_MODEL_VERSION; distributionVersion: typeof MLB_V41_DISTRIBUTION_VERSION;
    calibrationVersion: typeof MLB_V41_CALIBRATION_VERSION; configurationHash: string;
    status: "UNVALIDATED"; cohort: "shadow"; shadowOnly: true; publishable: false;
  };
  expectedRuns: MlbV4Forecast["expectedRuns"];
  probability: MlbV4Forecast["probability"];
  decomposition: { away: MlbV41RunDecomposition; home: MlbV41RunDecomposition };
  sourceV4: { modelId: string; outputEquivalent: true };
  researchPolicy: {
    officialPick: false; officialUnits: 0; notifications: false;
    publicationStatus: "SHADOW_NOT_PUBLISHABLE";
    blockers: readonly ["unvalidated_shadow_model", "publication_hard_disabled"];
  };
}

function side(v4: MlbV4Forecast, key: "away" | "home"): MlbV41RunDecomposition {
  const run = (name: string) => v4.contributions[name]?.[key === "away" ? "awayRuns" : "homeRuns"] ?? 0;
  const starter = v4.contributions.startingPitcher?.details[
    key === "away" ? "awayStarterEstimate" : "homeStarterEstimate"
  ] as { innings?: unknown; rate?: unknown } | undefined;
  const innings = typeof starter?.innings === "number" ? starter.innings : null;
  const rate = typeof starter?.rate === "number" ? starter.rate : null;
  return {
    baseExpectedRuns: run("leagueRunEnvironment"),
    offensiveAdjustment: run("teamOffense"),
    opposingStarterAdjustment: run("startingPitcher"),
    opposingStarterExpectedInnings: innings,
    opposingStarterExpectedRunsAllowed: innings != null && rate != null ? rate * innings / 9 : null,
    bullpenAdjustment: run("bullpenAvailabilityFatigue"),
    parkAdjustment: run("park"), weatherAdjustment: run("weather"), homeFieldAdjustment: run("homeField"),
    lineupAdjustment: run("lineup") + run("batterVsPitcher"),
    platoonAdjustment: run("platoonMatchup"), restContextAdjustment: run("rest"),
    unsupportedFeatureAdjustment: 0,
    finalExpectedRuns: v4.expectedRuns[key],
  };
}

/** Pure read-only audit forecast. The optional timestamp is forwarded to V4. */
export function computeMlbV41Forecast(game: FetchedGame, input: MlbV4Input, createdAt?: Date): MlbV41Forecast {
  const v4 = computeMlbV4Forecast(game, input, createdAt);
  return {
    model: {
      modelId: MLB_V41_MODEL_ID, featureSchemaVersion: MLB_V41_FEATURE_SCHEMA_VERSION,
      runModelVersion: MLB_V41_RUN_MODEL_VERSION, distributionVersion: MLB_V41_DISTRIBUTION_VERSION,
      calibrationVersion: MLB_V41_CALIBRATION_VERSION, configurationHash: MLB_V41_CONFIGURATION_HASH,
      status: "UNVALIDATED", cohort: "shadow", shadowOnly: true, publishable: false,
    },
    expectedRuns: v4.expectedRuns, probability: v4.probability,
    decomposition: { away: side(v4, "away"), home: side(v4, "home") },
    sourceV4: { modelId: v4.model.modelId, outputEquivalent: true },
    researchPolicy: {
      officialPick: false, officialUnits: 0, notifications: false,
      publicationStatus: "SHADOW_NOT_PUBLISHABLE",
      blockers: ["unvalidated_shadow_model", "publication_hard_disabled"],
    },
  };
}