import { schedulerJobs } from "../src/services/scheduler";
import { bootstrapTask241V4Engines } from "../src/services/v4EngineBootstrap241";

const startedAt = new Date().toISOString();
const publicationEnabled = process.env["PUBLICATION_ENABLED"] === "true";
const results: Record<string, unknown> = {};

// The web entrypoint bootstraps this registry through app.ts. The cron
// entrypoint bypasses app.ts, so it must initialize the same canonical V4
// engines before any evidence cycle attempts to create shadow forecasts.
bootstrapTask241V4Engines();

// Evidence collection is safe in a parallel candidate environment. The
// existing jobs are independently idempotent and provider-isolated.
for (const [name, job] of [
  ["mlbV4EvidenceCollection", schedulerJobs.mlbV4EvidenceCollection],
  ["ncaafProductionEvidenceCycle", schedulerJobs.ncaafProductionEvidenceCycle],
] as const) {
  try {
    results[name] = { status: "SUCCEEDED", result: await job() };
  } catch (error) {
    results[name] = {
      status: "FAILED",
      reason: error instanceof Error ? error.message : "UNKNOWN_FAILURE",
    };
  }
}

// Odds ingestion can flow into the established publication pipeline. It is
// therefore impossible to run accidentally in a staging/shadow environment.
if (publicationEnabled) {
  try {
    results["oddsIngestion"] = {
      status: "SUCCEEDED",
      result: await schedulerJobs.oddsIngestion(),
    };
  } catch (error) {
    results["oddsIngestion"] = {
      status: "FAILED",
      reason: error instanceof Error ? error.message : "UNKNOWN_FAILURE",
    };
  }
} else {
  results["oddsIngestion"] = {
    status: "SUPPRESSED",
    reason: "PUBLICATION_ENABLED_IS_NOT_TRUE",
  };
}

const failed = Object.values(results).some((value) =>
  (value as { status?: string }).status === "FAILED");
console.log(JSON.stringify({
  mode: publicationEnabled ? "PRODUCTION" : "SHADOW",
  startedAt,
  completedAt: new Date().toISOString(),
  results,
}, null, 2));
if (failed) process.exitCode = 1;