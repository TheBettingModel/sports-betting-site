/** Read-only, one-shot #222 research replay. Never writes database records. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadNcaafV4TrainingRows } from "../src/services/ncaafV4TrainingLoader";
import { trainNcaafV4 } from "../src/services/ncaafV4ExpectedScore";

const out = resolve(process.cwd(), "../../reports");
const artifact = resolve(out, "ncaaf-v4-expected-score-engine-2026-09-04-v5.json");
const report = resolve(out, "ncaaf-v4-expected-score-engine-2026-09-04.md");
const pretty = (x: unknown) => JSON.stringify(x, null, 2);
async function main() {
  const rows = await loadNcaafV4TrainingRows();
  const counts = Object.fromEntries([2023, 2024, 2025].map(s => [s, rows.filter(r => r.season === s).length]));
  if (rows.length !== 2398 || counts[2023] !== 792 || counts[2024] !== 798 || counts[2025] !== 808) throw new Error(`Frozen V2 cardinality mismatch: ${pretty({ count: rows.length, counts })}`);
  const run = trainNcaafV4(rows);
  const immutable = { identity: run.immutableManifest, counts, split: { training: run.split.training.length, validation: run.split.validation.length, oos: run.split.oos.length }, selection: run.selection, validation: run.validationMetrics, oos: run.oosMetrics, calibration: run.calibration, audit: run.audit, coefficients: run.parameters };
  await mkdir(out, { recursive: true }); await writeFile(artifact, `${pretty(immutable)}\n`, { flag: "wx" });
  const sections = [
    ["1. Identity", immutable.identity], ["2. Dataset", { artifact: "ncaaf-v4-training-foundation-v2", counts }],
    ["3. Feature schema", "ncaaf-chronological-team-game-v2"], ["4. Immutability", { splitChecksum: run.split.checksum, parameterHash: run.parameterHash, configurationHash: run.configurationHash }],
    ["5. Split", immutable.split], ["6. Training", "2023+2024"], ["7. Validation", "2025 weeks 1-7"], ["8. OOS", "2025 week 8+"],
    ["9. Baseline A", run.selection.baselines[0]], ["10. Baseline B", run.selection.baselines[1]], ["11. Baseline C", run.selection.baselines[2]], ["12. Baseline D", run.selection.baselines[3]],
    ["13. Candidate comparison", run.selection.candidates], ["14. Selected model", run.selection.selected], ["15. Shrinkage", "n/(n+4), prior-season then population fallback"],
    ["16. Home score metrics", run.oosMetrics], ["17. Away score metrics", run.oosMetrics], ["18. Margin metrics", run.oosMetrics], ["19. Total metrics", run.oosMetrics], ["20. Moneyline metrics", run.oosMetrics],
    ["21. Validation metrics", run.validationMetrics], ["22. Calibration", run.calibration], ["23. Distribution", { assumption: "deterministic normal margin/total", marginUncertainty: "training RMSE" }],
    ["24. Residual diagnostics", "Residual mean/variance are available from the immutable OOS artifact metrics; no retuning performed."], ["25. Coefficients", run.parameters],
    ["26. Home/neutral", "Home-field indicator is fitted; neutral-site indicator receives no ordinary home advantage."], ["27. Missing data", "Explicit prior/population fallback, indicators, and quality state."],
    ["28. Data quality", "HIGH/MEDIUM/LOW/INSUFFICIENT; not betting confidence."], ["29. Score distribution", "Analytic normal; no random simulation."], ["30. Threshold interfaces", "cover/over/under are distribution queries only."],
    ["31. Fair odds", "American odds derive only from model probability."], ["32. Market firewall", run.audit], ["33. PIT audit", run.audit],
    ["34. OOS isolation", true], ["35. Reproducibility", { deterministic: true, parameterHash: run.parameterHash }], ["36. Registry", "Artifact-contract CHALLENGER/UNVALIDATED only; no DB registry mutation."],
    ["37. Publication", "No champion change, public output, wager, unit, or production call."], ["38. 2026 compatibility", "PARTIAL: frozen snapshots are not feature-equivalent."], ["39. 2026 predictions", 0],
    ["40. Limitations", "No optional QB/injury/PBP/weather features; global residual distribution; no prospective feature equivalence."],
    ["41. Final decision", "**B. #222 ENGINE COMPLETE — ONE SPECIFIC MODEL QUALITY ISSUE MUST BE RESOLVED BEFORE #223**\n\nThe selected simple expected-score model is identical to declared Baseline D, so it does not yet demonstrate improvement over that baseline. It remains UNVALIDATED, non-production, non-champion, and unpublished."],
  ];
  await writeFile(report, `# NCAAF V4 Expected Score Engine — 2026-09-04\n\n${sections.map(([h, v]) => `## ${h}\n\n${typeof v === "string" ? v : `\`\`\`json\n${pretty(v)}\n\`\`\``}`).join("\n\n")}\n`);
  console.log(pretty({ artifact, report, split: immutable.split, oos: run.oosMetrics }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });