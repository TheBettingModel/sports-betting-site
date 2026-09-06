import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db, mlbV4ModelRegistryTable } from "@workspace/db";
import { MLB_CANDIDATE_ENGINE } from "./types";
import type { ExactArtifactIdentity } from "./types";
import {
  NCAAF_V4_EXPECTED_SCORE_ID,
  NCAAF_V4_FEATURE_SCHEMA_VERSION,
} from "../ncaafV4ExpectedScore";
import { NCAAF_V4_CANONICAL_BASELINE_D } from "../ncaafV4DistinctChallenger";

export async function getCurrentMlbCandidateIdentity(): Promise<ExactArtifactIdentity | null> {
  const [row] = await db.select().from(mlbV4ModelRegistryTable)
    .where(eq(mlbV4ModelRegistryTable.modelId, MLB_CANDIDATE_ENGINE))
    .orderBy(desc(mlbV4ModelRegistryTable.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    sport: "MLB",
    market: "moneyline",
    modelFamily: row.family,
    modelId: row.modelId,
    modelVersion: row.version,
    artifactId: row.registryId,
    artifactHash: row.modelHash,
    inputContractVersion: row.featureSchema,
    parameterHash: row.parameterHash,
  };
}

export function getCurrentNcaafCandidateIdentity(market = "moneyline"): ExactArtifactIdentity {
  const configurationHash = NCAAF_V4_CANONICAL_BASELINE_D.configurationHash;
  const parameterHash = NCAAF_V4_CANONICAL_BASELINE_D.parameterHash;
  return {
    sport: "NCAAF",
    market,
    modelFamily: "expected-score-linear",
    modelId: NCAAF_V4_EXPECTED_SCORE_ID,
    modelVersion: "D-simple-expected-score-linear",
    artifactId: NCAAF_V4_EXPECTED_SCORE_ID,
    artifactHash: createHash("sha256").update(`${configurationHash}:${parameterHash}`).digest("hex"),
    inputContractVersion: NCAAF_V4_FEATURE_SCHEMA_VERSION,
    configurationHash,
    parameterHash,
  };
}