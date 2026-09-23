import type { MlbModelMode, NcaafModelMode } from "./types";

const MLB_MODES = new Set<MlbModelMode>(["v1", "v4_guarded", "v4"]);
const NCAAF_MODES = new Set<NcaafModelMode>(["legacy", "nextgen_guarded", "nextgen"]);

export function parseMlbModelMode(value: string | undefined): MlbModelMode {
  if (value === undefined || value === "") return "v1";
  if (!MLB_MODES.has(value as MlbModelMode)) {
    throw new Error(`Invalid MLB_MODEL_MODE "${value}"; expected v1, v4_guarded, or v4`);
  }
  return value as MlbModelMode;
}

export function parseNcaafModelMode(value: string | undefined): NcaafModelMode {
  if (value === undefined || value === "") return "legacy";
  if (!NCAAF_MODES.has(value as NcaafModelMode)) {
    throw new Error(`Invalid NCAAF_MODEL_MODE "${value}"; expected legacy, nextgen_guarded, or nextgen`);
  }
  return value as NcaafModelMode;
}

export interface GuardedServingConfig {
  mlbMode: MlbModelMode;
  ncaafMode: NcaafModelMode;
}

export function readGuardedServingConfig(env: NodeJS.ProcessEnv = process.env): GuardedServingConfig {
  return {
    mlbMode: parseMlbModelMode(env["MLB_MODEL_MODE"]),
    ncaafMode: parseNcaafModelMode(env["NCAAF_MODEL_MODE"]),
  };
}

/** Synchronous and intentionally early: malformed kill switches stop startup. */
export const guardedServingConfig = readGuardedServingConfig();