/** Explicit development-only registry registration; no prediction/publication writes. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { registerNcaafV4Development } from "../src/services/ncaafV4Registry";

const reportDir = resolve(process.cwd(), "../../reports");
const jsonPath = resolve(reportDir, "ncaaf-v4-expected-score-engine-2026-09-04-v5.json");
const reportPath = resolve(reportDir, "ncaaf-v4-expected-score-engine-2026-09-04.md");
async function main() {
  const artifact = JSON.parse(await readFile(jsonPath, "utf8"));
  const result = await registerNcaafV4Development({
    validationMetrics: artifact.validation, oosMetrics: artifact.oos,
    configurationHash: artifact.identity.configurationHash, parameterHash: artifact.identity.parameterHash, artifactLocation: jsonPath,
  });
  const current = await readFile(reportPath, "utf8");
  const registry = `## 36. Registry\n\n\`\`\`json\n${JSON.stringify({ state: "CHALLENGER/UNVALIDATED", environment: "development", modelVersionId: result.model.id, datasetId: result.dataset.id, incumbentUnchanged: result.incumbentUnchanged, trainingRunCreated: result.trainingRunCreated }, null, 2)}\n\`\`\``;
  const decision = "## 41. Final decision\n\n**B. #222 ENGINE COMPLETE — ONE SPECIFIC MODEL QUALITY ISSUE MUST BE RESOLVED BEFORE #223**\n\nThe selected simple expected-score model is identical to declared Baseline D, so it does not yet demonstrate improvement over that baseline. It remains UNVALIDATED, non-production, non-champion, and unpublished. The 2026 compatibility result is PARTIAL and zero internal challenger predictions were generated.";
  await writeFile(reportPath, current.replace(/## 36\. Registry[\s\S]*?(?=\n## 37\.)/u, `${registry}\n\n`).replace(/## 41\. Final decision[\s\S]*$/u, `${decision}\n`));
  console.log(JSON.stringify({ modelId: result.model.id, datasetId: result.dataset.id, incumbentUnchanged: result.incumbentUnchanged }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });