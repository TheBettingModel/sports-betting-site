import { createHash } from "node:crypto";
import { NCAAF_V4_CANONICAL_BASELINE_D } from "../ncaafV4DistinctChallenger";
import {
  NCAAF_V4_EXPECTED_SCORE_ID, NCAAF_V4_FEATURE_SCHEMA_VERSION,
} from "../ncaafV4ExpectedScore";

/** Single immutable executable descriptor. This is identity evidence, not approval. */
export const NCAAF_V4_FROZEN_RUNTIME_VERSION = "predictFrozenNcaafV4-v1";
export const NCAAF_V4_EXECUTABLE_DESCRIPTOR = Object.freeze({
  sport: "NCAAF" as const,
  modelFamily: "expected-score-linear",
  modelId: NCAAF_V4_EXPECTED_SCORE_ID,
  modelVersion: "D-simple-expected-score-linear",
  artifactId: NCAAF_V4_EXPECTED_SCORE_ID,
  inputContractVersion: NCAAF_V4_FEATURE_SCHEMA_VERSION,
  configurationHash: NCAAF_V4_CANONICAL_BASELINE_D.configurationHash,
  parameterHash: NCAAF_V4_CANONICAL_BASELINE_D.parameterHash,
  runtimeVersion: NCAAF_V4_FROZEN_RUNTIME_VERSION,
});

export const NCAAF_V4_EXECUTABLE_ARTIFACT_HASH = createHash("sha256").update(JSON.stringify(
  NCAAF_V4_EXECUTABLE_DESCRIPTOR,
)).digest("hex");