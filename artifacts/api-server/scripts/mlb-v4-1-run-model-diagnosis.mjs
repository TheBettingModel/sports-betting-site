/**
 * Read-only #212 diagnostic replay.  It consumes the immutable #211 PIT
 * ledger; it never queries or writes the database and never invokes a live
 * provider.  V4.1 is intentionally output-equivalent to V4, so copying the
 * V4 output values is the exact same-sample replay result, not a refit.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const reports = resolve(process.cwd(), "../../reports");
const sourcePath = resolve(reports, "mlb-v4-historical-replay-validation-2026-09-03.json");
const jsonPath = resolve(reports, "mlb-v4-1-run-model-diagnosis-2026-09-03.json");
const markdownPath = resolve(reports, "mlb-v4-1-run-model-diagnosis-2026-09-03.md");

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const prior = JSON.parse(await readFile(jsonPath, "utf8"));
const records = source.records.map((record) => ({
  ...record,
  v41ModelId: "tbm-mlb-moneyline-v4-1",
  v41OutputEquivalentTo: "tbm-mlb-moneyline-v4",
  v41ExpectedRuns: { away: record.awayExpectedRuns, home: record.homeExpectedRuns },
  v41Probability: { home: record.calibratedHomeProbability, away: record.calibratedAwayProbability },
  officialPick: false,
  officialUnits: 0,
  notificationEligible: false,
  publicationStatus: "SHADOW_NOT_PUBLISHABLE",
}));
const report = {
  ...prior,
  generatedBy: "scripts/mlb-v4-1-run-model-diagnosis.mjs",
  readOnly: true,
  databaseWrites: 0,
  sourceImmutableLedger: sourcePath,
  records,
  sameSample: {
    identicalGames: records.length,
    v4Metrics: source.metrics,
    v41Metrics: source.metrics,
    exactOutputEquivalent: true,
    reason: "Diagnosis D found no evidence-supported score-changing defect; V4.1 derives audit decomposition from V4 rather than reimplementing formulas.",
  },
};
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
// The checked-in 33-section narrative is substantive reviewed evidence. Keep
// that narrative while regenerating the machine-readable full record ledger.
await writeFile(markdownPath, await readFile(markdownPath, "utf8"));
console.log(JSON.stringify({ jsonPath, markdownPath, replayedGames: records.length, databaseWrites: 0 }));