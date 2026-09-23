import { desc, eq } from "drizzle-orm";
import { db, mlbV4ModelRegistryTable } from "@workspace/db";
import { MLB_CANDIDATE_ENGINE } from "./types";
import type { ExactArtifactIdentity } from "./types";
import { NCAAF_V4_EXECUTABLE_ARTIFACT_HASH, NCAAF_V4_EXECUTABLE_DESCRIPTOR } from "./ncaafArtifactDescriptor";

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
  return {
    sport: NCAAF_V4_EXECUTABLE_DESCRIPTOR.sport,
    market,
    modelFamily: NCAAF_V4_EXECUTABLE_DESCRIPTOR.modelFamily,
    modelId: NCAAF_V4_EXECUTABLE_DESCRIPTOR.modelId,
    modelVersion: NCAAF_V4_EXECUTABLE_DESCRIPTOR.modelVersion,
    artifactId: NCAAF_V4_EXECUTABLE_DESCRIPTOR.artifactId,
    artifactHash: NCAAF_V4_EXECUTABLE_ARTIFACT_HASH,
    inputContractVersion: NCAAF_V4_EXECUTABLE_DESCRIPTOR.inputContractVersion,
    configurationHash: NCAAF_V4_EXECUTABLE_DESCRIPTOR.configurationHash,
    parameterHash: NCAAF_V4_EXECUTABLE_DESCRIPTOR.parameterHash,
  };
}