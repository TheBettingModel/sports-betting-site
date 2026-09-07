/** Development-only #222B replay. Read-only database access; immutable report write. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadNcaafV4TrainingRows } from "../src/services/ncaafV4TrainingLoader";
import { NCAAF_V4_CANONICAL_BASELINE_D, pairedBootstrapClassification, trainNcaafV4DistinctChallenger } from "../src/services/ncaafV4DistinctChallenger";
import { trainNcaafV4 } from "../src/services/ncaafV4ExpectedScore";

async function main() {
  const rows = await loadNcaafV4TrainingRows();
  const run = trainNcaafV4DistinctChallenger(rows);
  if (run.split.training.length !== 1590 || run.split.validation.length !== 398 || run.split.oos.length !== 410) throw new Error(`Frozen #222B cohort cardinality mismatch: ${JSON.stringify({ training: run.split.training.length, validation: run.split.validation.length, oos: run.split.oos.length })}`);
  // Baseline prediction generation occurs only after #222B winner/calibration freeze.
  const baseline = trainNcaafV4(rows);
  const bootstrap = pairedBootstrapClassification(run.predictions.oosRaw, baseline.oos, run.split.oos);
  const fragment = Object.freeze({
    identity: { ...run.immutableManifest, datasetVersion: "ncaaf-v4-training-foundation-v2", selectedChallenger: run.winner, ...run.frozen },
    canonicalBaselineD: NCAAF_V4_CANONICAL_BASELINE_D,
    predeclaredValidationScorecard: { primary: ["marginMae", "brier", "logLoss"], secondary: ["homeMae", "awayMae", "totalMae", "stability"], selection: "validation only; OOS unavailable until frozen configuration", stabilityGate: run.selectionRationale.stabilityGate, stabilityGatePassed: run.selectionRationale.stabilityGatePassed },
    split: { training: run.split.training.length, validation: run.split.validation.length, oos: run.split.oos.length, checksum: run.split.checksum },
    candidates: run.candidates, selectionRationale: run.selectionRationale, validation: run.validation, oos: run.oos, bootstrap,
    audits: run.audit,
    featureBridge2026: { status: "PENDING_SEPARATE_AUDIT", predictions: null },
    registry: { approval: "UNVALIDATED", championChanged: false, publicationChanged: false, nflChanged: false },
    finalDecision: "C. #222B PARTIAL — ONE SPECIFIC MODEL OR 2026 COMPATIBILITY BLOCKER REMAINS",
  });
  const directory = resolve(process.cwd(), "../../reports"), output = resolve(directory, "ncaaf-v4-distinct-challenger-model-2026-09-04-v2.json");
  await mkdir(directory, { recursive: true });
  await writeFile(output, `${JSON.stringify(fragment, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output, selected: run.winner, oos: run.oos, bootstrap }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });