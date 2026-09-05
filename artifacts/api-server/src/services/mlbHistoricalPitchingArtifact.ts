import { createHash } from "node:crypto";
import { stableHistoricalJson } from "./mlbHistoricalSource";

export const MLB_PITCHER_BULLPEN_RAW_SCHEMA_VERSION =
  "mlb-pitcher-bullpen-pit-v1";
export const MLB_PITCHER_BULLPEN_RAW_ARTIFACT_KEY =
  "mlb-historical-2023-2026-pitcher-bullpen-pit-v1";
export const MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION =
  "mlb-pitcher-bullpen-pit-v5";
export const MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY =
  "mlb-historical-2023-2026-pitcher-bullpen-pit-v5";
export const MLB_PITCHER_BULLPEN_BOXSCORE_ENDPOINT_VERSION =
  "mlb-statsapi-v1-game-boxscore-exact-v1";
export const MLB_PITCHER_BULLPEN_SPLIT_VERSION =
  "mlb-completion-chronology-split-2023-2026-v3";

export function mlbPitchingArtifactHash(value: unknown): string {
  return createHash("sha256").update(stableHistoricalJson(value)).digest("hex");
}

export function mlbPitReal(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value.toPrecision(6));
}

export function mlbBoxscoreSnapshotBinding(input: {
  canonicalGameId: string;
  providerGameId: string;
  endpoint: string;
  retrievedAt: string;
  rawBodyHash: string;
  byteLength: number;
}): { manifest: Record<string, unknown>; sourceManifestHash: string } {
  const manifest = {
    sourceVersion: MLB_PITCHER_BULLPEN_BOXSCORE_ENDPOINT_VERSION,
    provider: "MLB_STATS_API",
    ...input,
  };
  return { manifest, sourceManifestHash: mlbPitchingArtifactHash(manifest) };
}