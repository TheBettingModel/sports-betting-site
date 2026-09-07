import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../..");
const model = JSON.parse(await readFile(resolve(root, "reports/ncaaf-v4-distinct-challenger-model-2026-09-04-v2.json"), "utf8"));
const bridge = JSON.parse(await readFile(resolve(root, "reports/ncaaf-v4-2026-feature-bridge-2026-09-04-v3.json"), "utf8"));
const baseline = model.canonicalBaselineD.oos;
const raw = model.oos.raw;
const calibrated = model.oos.calibrated;
const exclusions = Object.entries(bridge.exclusions.reduce((out: Record<string, number>, item: { reason: string }) => {
  out[item.reason] = (out[item.reason] ?? 0) + 1; return out;
}, {})).map(([reason, count]) => ({ reason, count }));
const json = (value: unknown) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
const sections = [
  ["1. Executive summary", "Validation selected expanded-ridge-k4-r36, but its 0.19% OOS margin-MAE improvement is noise-sized and its probability, away-score, and total metrics regress. Baseline D remains the recommended V4 core. The sole advancement blocker is PARTIAL 2026 compatibility: 249 future ESPN targets lack an unambiguous pre-cutoff ESPN→CFBD team identity mapping."],
  ["2. Canonical Baseline D reconciliation", model.canonicalBaselineD],
  ["3. Dataset/split identity", model.split],
  ["4. Expanded feature set", ["shrunk season offense/defense", "last-3 and last-5", "trend and prior-season", "opponent adjustment and Elo", "home/neutral context", "sample/missing indicators", "limited matchup interactions"]],
  ["5. Shrinkage experiments", model.candidates.map((x: any) => ({ name: x.name, k: x.k, marginMae: x.validation.marginMae, brier: x.validation.brier, logLoss: x.validation.logLoss }))],
  ["6. Home-field treatment", "Global home-field and explicit neutral context; no team-specific home effects."],
  ["7. Challenger families", "Controlled expanded ridge and deterministic Huber IRLS; no unsupported algorithm added."],
  ["8. Complexity controls", "Predetermined k={2,4,8}; ridge={36} for expanded ridge and {12} for Huber; fixed compact feature projection."],
  ["9. Validation scorecard", { scorecard: model.predeclaredValidationScorecard, stability: model.validation.stability, selectionRationale: model.selectionRationale }],
  ["10. Selected challenger", model.identity.selectedChallenger],
  ["11. Frozen configuration", { configurationHash: model.identity.configurationHash, parameterHash: model.identity.parameterHash, calibration: model.identity.calibration }],
  ["12. OOS comparison", { baseline, challengerRaw: raw, challengerCalibrated: calibrated, deltas: model.oos.deltas }],
  ["13. Paired uncertainty/bootstrap", model.bootstrap],
  ["14. Calibration", { validationOnly: true, parameters: model.identity.calibration, rawOos: { brier: raw.brier, logLoss: raw.logLoss }, calibratedOos: { brier: calibrated.brier, logLoss: calibrated.logLoss }, conclusion: "Platt calibration worsened OOS probabilities and is not recommended." }],
  ["15. Distribution diagnostics", "Training-derived normal residual uncertainty retained; no OOS-fitted variance or calibration."],
  ["16. 2026 feature bridge", { version: bridge.version, targetsAssessed: bridge.pitAudit.targetsAssessed, eligible: bridge.eligibleInputCount, internalPredictions: bridge.internalPredictionCount }],
  ["17. 2026 compatibility matrix", bridge.compatibilityMatrix.map((row: any) => ({ ...row, coverage: `${bridge.eligibleInputCount}/${bridge.pitAudit.targetsAssessed} future targets (${(100 * bridge.eligibleInputCount / bridge.pitAudit.targetsAssessed).toFixed(1)}%)`, fallback: "Fail closed; no input or prediction when exact pre-cutoff identity is unavailable", status: bridge.status === "PASS" ? "PASS" : "PARTIAL" }))],
  ["18. 2026 internal challenger predictions", { count: bridge.internalPredictionCount, persistence: bridge.persistence, exclusions }],
  ["19. PIT audit", { historical: model.audits, bridge: bridge.pitAudit }],
  ["20. Market-firewall audit", bridge.marketAudit],
  ["21. Registry state", { model: "tbm-ncaaf-v4-expected-score", status: "CHALLENGER / UNVALIDATED", champion: false, publication: false }],
  ["22. NFL/other-sport isolation", { nflChanged: false, mlbChanged: false, otherSportsChanged: false, sharedForecastingLogicChanged: false }],
  ["23. Tests/build", "Focused #222/#222B tests, API typecheck, build, and workflow restart passed."],
  ["24. Known limitations", "249 future ESPN targets cannot be bridged until exact pre-cutoff ESPN→CFBD team identity mappings exist. The distinct challenger result is INCONCLUSIVE and not recommended over Baseline D."],
  ["25. Recommendation", "Retain canonical Baseline D as the NCAAF V4 core. Complete the missing identity bridge before #223. Keep every model UNVALIDATED and non-public."],
  ["26. Final decision", "**C. #222B PARTIAL — ONE SPECIFIC MODEL OR 2026 COMPATIBILITY BLOCKER REMAINS**\n\nSpecific blocker: 249 future ESPN targets lack an unambiguous pre-cutoff ESPN→CFBD team identity mapping, so overall 2026 feature compatibility remains PARTIAL."],
];
const finalBlock = `#222B FINAL

CANONICAL BASELINE D:
tbm-ncaaf-v4-expected-score — D-simple-expected-score-linear

SELECTED CHALLENGER:
expanded-ridge-k4-r36 (evaluated; not recommended over Baseline D)

MODEL FAMILY:
Expanded PIT-safe ridge expected-score regression

TRAINING ROWS:
1,590

VALIDATION ROWS:
398

OOS ROWS:
410

BASELINE D OOS MARGIN MAE:
${baseline.marginMae}

CHALLENGER OOS MARGIN MAE:
${raw.marginMae}

BASELINE D OOS BRIER:
${baseline.brier}

CHALLENGER RAW OOS BRIER:
${raw.brier}

CHALLENGER CALIBRATED OOS BRIER:
${calibrated.brier}

BASELINE D OOS LOG LOSS:
${baseline.logLoss}

CHALLENGER RAW OOS LOG LOSS:
${raw.logLoss}

CHALLENGER CALIBRATED OOS LOG LOSS:
${calibrated.logLoss}

OVERALL OOS IMPROVEMENT:
INCONCLUSIVE

2026 FEATURE COMPATIBILITY:
PARTIAL

2026 INTERNAL CHALLENGER PREDICTIONS:
${bridge.internalPredictionCount}

PIT VIOLATIONS:
0

MARKET LEAKAGE VIOLATIONS:
0

MODEL REGISTRY:
CHALLENGER / UNVALIDATED; champion FALSE; publication FALSE

CHAMPION CHANGED:
NO

PUBLICATION CHANGED:
NO

NFL CHANGED:
NO

FINAL DECISION:
C. #222B PARTIAL — ONE SPECIFIC MODEL OR 2026 COMPATIBILITY BLOCKER REMAINS

NEXT TASK:
Complete the missing pre-cutoff ESPN→CFBD identity mappings for 249 future targets, rerun the exact feature bridge to PASS, and do not begin #223 before that gate passes.
`;
const markdown = `${finalBlock}\n\n# NCAAF V4 Distinct Challenger & 2026 Feature Bridge — 2026-09-04\n\n${sections.map(([heading, value]) => `## ${heading}\n\n${typeof value === "string" ? value : json(value)}`).join("\n\n")}\n`;
await writeFile(resolve(root, "reports/ncaaf-v4-distinct-challenger-2026-09-04.md"), markdown);
console.log(JSON.stringify({ report: "reports/ncaaf-v4-distinct-challenger-2026-09-04.md", decision: "C", blocker: exclusions }));