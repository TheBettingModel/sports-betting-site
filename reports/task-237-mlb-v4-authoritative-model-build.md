# TASK #237 — MLB V4 AUTHORITATIVE MODEL BUILD + FROZEN PRODUCTION CANDIDATE

## Final classification

**C — MLB V4 MODEL BUILD BLOCKED**

Task #237 produced a legitimate, deterministic, validation-selected MLB full-game moneyline research candidate, but it did **not** freeze an authoritative artifact or build an executor. The required final holdout is no longer globally untouched, and the selected historical 38-feature contract cannot be reproduced exactly from the current live `model-input-v4` snapshots.

- `MODEL_BUILD_READY=false`
- `MODEL_PROMOTION_READY=false`
- `GUARDED_APPROVED=false`
- Current public MLB: **V1**
- V4 public serving: **OFF**
- Locked OOS queried by Task #237: **NO**
- Frozen artifact created: **NO**
- Executor registered: **NO**

The small validation improvement is useful research evidence, not authority to freeze or promote.

## What was built

Task #237 added a deterministic L2-regularized binary logistic classifier for `P(home_team_win)`, a sealed TRAIN/VALIDATION experiment, candidate-family comparisons, calibration and temporal diagnostics, feature-family ablations, AUC, uncertainty reporting, and focused tests.

The base model structurally excludes market prices, ROI, units, POD, Final Rating, target-game results, and actual-only starter identity. Training and preprocessing use TRAIN only. Hyperparameters are chosen with chronological TRAIN folds; only one TRAIN-selected winner per family is scored on VALIDATION.

No production table, prior evidence row, approval record, incumbent configuration, or NCAAF behavior was changed.

## Historical foundation

| Item | Actual |
|---|---|
| Authoritative historical artifact | `mlb-historical-2023-2026-pitcher-bullpen-pit-v5` |
| Seasons | 2023–2026 |
| Raw games audited | 9,393 |
| Chronology-safe games | 9,390 |
| Offense + bullpen eligible | 9,073 |
| Excluded from trainable cohort | 320 |
| TRAIN | 2023-04-04 through 2024-10-30; 4,700 games |
| VALIDATION | 2025-04-01 through 2025-11-01; 2,361 games |
| Existing LOCKED_OOS | 2026-04-01 through 2026-09-04; 2,012 games |
| Foundation hash | `cec426281151791d8018ada96990c76c0ba07a585b57333382bc5fbe9489a050` |
| Replay hash | `a1fb96b3ec8abff49a69c56ceefdecef038ccc46aef150779abf19a286e2fe42` |
| Source-manifest hash | `8da8c322a3ec1ac6723d267cc9aa4b922c185654f809f26246934bbefd8a6d98` |
| Retrieval cutoff | `2026-09-05T11:29:57.512Z` |
| PIT / future-information violations | 0 |
| Target leakage violations | 0 |
| Starter leakage violations | 0 |
| Market leakage violations | 0 |

Historical pregame starter identity coverage remains **0**. The 18,780 actual starter observations are postgame facts and were not promoted into model inputs.

## Research feature manifest

- Version: `mlb-v4-moneyline-237-flat-38-v1`
- Hash: `e6eb8f018049f4cf2030f40c8ab4e5763a6d9d1f55f22ca591dd74b969c1cfed`
- Count: 38
- Offense: 8
- League/home context: 6
- Opponent bullpen: 24
- Starter: 0
- Missingness: deterministic TRAIN-derived median imputation persisted in the fitted transform
- Game representation: standardized home-minus-away feature differences
- Calibration: identity; no VALIDATION-fitted calibration

## Predefined selection procedure

1. Verify sealed foundation and immutable TRAIN/VALIDATION membership.
2. Fit preprocessing separately inside each chronological TRAIN fold.
3. Select one hyperparameter winner per model family using mean TRAIN-fold log loss.
4. Score only those family winners on VALIDATION.
5. Require zero integrity/numerical issues, deterministic rebuild, lower validation log loss and Brier than the TRAIN-derived naive home-win prior, ECE no greater than 0.05, and no catastrophic temporal-fold failure.
6. Rank eligible family winners by validation log loss, Brier, ECE, temporal stability, then simplicity.
7. Do not use ROI, units, POD, Final Rating, market prices, or final-holdout results.

## Candidate comparison

| Candidate | Validation Log Loss | Validation Brier | Validation AUC | ECE | Worst TRAIN-fold Log Loss | Selected |
|---|---:|---:|---:|---:|---:|---|
| TRAIN home-win prior | 0.690385 | 0.248620 | 0.500000 | 0.017043 | N/A | NO |
| Simple offense-only strength | 0.688743 | 0.247794 | 0.538150 | 0.023933 | N/A | NO |
| Binary logistic, L2=0.1 | **0.687438** | **0.247032** | **0.555435** | **0.025444** | **0.684712** | **VALIDATION ONLY** |
| Ridge expected runs, L2=1 | 0.755140 | 0.270754 | 0.550022 | 0.137279 | 0.771698 | NO |
| Poisson expected runs, L2=1 | 0.692204 | 0.249331 | 0.552314 | 0.050031 | 0.686133 | NO |
| NB2 expected runs, L2=1, alpha=0.1 | 0.690510 | 0.248611 | 0.552153 | 0.046119 | 0.684556 | NO |

The selected research candidate has validation accuracy `0.540873`, equal to always choosing the validation-majority home class. Probabilistic metrics, not raw accuracy, drove selection.

## Uncertainty and calibration

The selected candidate improved mean validation log loss by `0.002947` and Brier by `0.001587` versus naive. Paired per-game approximate 95% intervals were:

- Log-loss difference, candidate minus naive: `[-0.008887, 0.002993]`
- Brier difference, candidate minus naive: `[-0.004431, 0.001256]`

Both intervals cross zero. Games are not guaranteed independent, so these intervals are descriptive rather than promotion-grade evidence.

| Probability bucket | Rows | Mean probability | Outcome rate | Status |
|---|---:|---:|---:|---|
| 0.00–0.50 | 850 | 0.450742 | 0.500000 | adequate |
| 0.50–0.55 | 727 | 0.525295 | 0.529574 | adequate |
| 0.55–0.60 | 496 | 0.572320 | 0.586694 | adequate |
| 0.60–0.65 | 217 | 0.620256 | 0.612903 | adequate |
| 0.65–0.70 | 49 | 0.673443 | 0.591837 | adequate |
| 0.70–0.75 | 17 | 0.721729 | 0.588235 | insufficient sample |
| 0.75–1.00 | 5 | 0.820155 | 0.800000 | insufficient sample |

Probability range: `0.132624` to `0.857515`. Extreme buckets remain too small for authoritative confidence claims.

## Feature-family diagnostics

| Feature set | Validation Log Loss | Brier | AUC | ECE |
|---|---:|---:|---:|---:|
| Full offense + context + bullpen | 0.687438 | 0.247032 | 0.555435 | 0.025444 |
| Offense only | 0.688743 | 0.247794 | 0.538150 | 0.023933 |
| Bullpen only | 0.689084 | 0.247833 | 0.546646 | 0.034394 |
| Context only | 0.690385 | 0.248620 | 0.500000 | 0.017044 |

Starter ablation is unavailable because starter features were never admitted. Market/favorite/underdog diagnostics are unavailable because market evidence was structurally excluded from this base-model experiment.

## Why the build is blocked

### 1. No globally untouched final holdout remains

The existing 2,012-game `LOCKED_OOS` cohort was opened once for the earlier expected-runs artifact. The new logistic candidate has not seen those rows, but that makes the cohort only **candidate-unseen**, not globally untouched. Task #237 expressly requires a truly untouched final chronological holdout and forbids relabeling a spent cohort.

Task #237 therefore did not query or score `LOCKED_OOS`.

### 2. Historical/live feature semantics are incompatible

The selected model uses a flat 38-feature offense/context/bullpen contract. Current live `MlbV4ModelInput` snapshots use different nested aggregates and do not prove identical:

- rolling windows;
- denominators;
- season/prior-season boundaries;
- bullpen rate and workload definitions;
- missingness semantics;
- source-time cutoffs;
- feature ordering.

No versioned adapter or parity test demonstrates exact reproduction. An approximate mapping is insufficient for a frozen production artifact.

### 3. Validation lift is not robustly resolved

The candidate strictly beats the naive point estimates and passed the predefined research gate, but the approximate paired intervals cross zero. The validation cohort is one season, and high-confidence probability buckets are sparse. More untouched prospective evidence is required.

## Research-only identity

These hashes prove deterministic research reconstruction; they are **not** frozen artifact identity:

| Item | Value |
|---|---|
| Research model ID | `tbm-mlb-moneyline-v4-research-237` |
| Research version | `validation-only-binary-logistic-l2-0.1` |
| Model hash | `7761ffd0f2a75bdf89b4b7f891a3971194b47438f27869be3c2d758b909a6a33` |
| Parameter hash | `742d5cd1128aaf9b40040f9aef11b2a0d2df53afdee5e9338cd6f7626d5e736d` |
| Transform hash | `3677ed49c9e711ea5cde8796e0b4700007c0bf3769b197d2814200b9fa11d6f1` |
| Configuration hash | `9b27c9fff277fa1ad8e0818d6812c02643318cc4467f389412b57d646ad93be0` |

No artifact row, registry identity, approval, or executor was created from these values.

## Required 84-item record

| # | Required item | Actual |
|---:|---|---|
| 1 | Final classification | **C — MLB V4 MODEL BUILD BLOCKED** |
| 2 | `MODEL_BUILD_READY` | `false` |
| 3 | `MODEL_PROMOTION_READY` | `false` |
| 4 | `GUARDED_APPROVED` | `false` |
| 5 | Public serving status | V1 only |
| 6 | MLB incumbent identity | `tbm-mlb-moneyline-v1` |
| 7 | MLB V4 candidate identity | No frozen candidate; research ID only |
| 8 | Historical seasons available | 2023–2026 |
| 9 | Raw historical games | 9,393 |
| 10 | Canonical eligible games | 9,073 |
| 11 | Excluded games | 320 |
| 12 | Historical PIT status | PASS; 0 violations |
| 13 | Historical backfill status | Sealed offense/bullpen; starter backfill unavailable |
| 14 | Observation cutoff | Per-game strict pregame cutoff; foundation retrieval cutoff `2026-09-05T11:29:57.512Z` |
| 15 | Target definition | `P(home_team_win)` for MLB full-game moneyline |
| 16 | Feature manifest version/hash | `mlb-v4-moneyline-237-flat-38-v1` / `e6eb8f...1cfed` |
| 17 | Final feature count | 38 research features; no frozen final |
| 18 | Feature-family coverage | offense 8, context 6, bullpen 24, starter 0 |
| 19 | Missingness policy | TRAIN-derived median imputation |
| 20 | Train period/count | 2023-04-04–2024-10-30 / 4,700 |
| 21 | Validation period/count | 2025-04-01–2025-11-01 / 2,361 |
| 22 | Final holdout period/count | Existing 2026-04-01–2026-09-04 / 2,012; spent globally and not queried |
| 23 | Candidate model families | naive, logistic, ridge, Poisson, NB2, offense-only baseline |
| 24 | Hyperparameter search | TRAIN-fold-only; logistic L2 grid, run-model L2 grid, NB2 alpha grid |
| 25 | Predefined selection rule | probability-first, deterministic, no ROI, naive/ECE/stability gates |
| 26 | Candidate comparison | See table above |
| 27 | Selected model family | Binary logistic, validation-only |
| 28 | Selected hyperparameters | L2 `0.1`; identity calibration |
| 29 | Validation Log Loss | `0.6874382383523808` |
| 30 | Validation Brier | `0.24703246807516793` |
| 31 | Validation AUC | `0.5554350747109664` |
| 32 | Validation calibration | ECE `0.025444315414265554`; extreme buckets sparse |
| 33 | Final holdout Log Loss | N/A — not queried |
| 34 | Final holdout Brier | N/A — not queried |
| 35 | Final holdout AUC | N/A — not queried |
| 36 | Final holdout calibration | N/A — not queried |
| 37 | Naive comparison | Better point estimates; approximate 95% intervals cross zero |
| 38 | V1 comparison | Not available on identical sealed probability rows |
| 39 | Per-season results | VALIDATION contains 2025 only; TRAIN-fold results span 2023–2024 |
| 40 | Favorite/underdog diagnostics | N/A; market excluded |
| 41 | Home/away diagnostics | Target is home win; symmetric home-minus-away inputs |
| 42 | Probability distribution | min `0.132624`, max `0.857515` |
| 43 | Calibration buckets | See bucket table above |
| 44 | Starter ablation | N/A; zero admitted starter features |
| 45 | Bullpen ablation | Bullpen-only Log Loss `0.689084` |
| 46 | Offense ablation | Offense-only Log Loss `0.688743` |
| 47 | Context ablation | Context-only Log Loss `0.690385` |
| 48 | PIT violations | 0 |
| 49 | Target leakage violations | 0 |
| 50 | Starter leakage violations | 0 |
| 51 | Feature-time leakage violations | 0 |
| 52 | Training reproducibility | PASS; deterministic model/parameter/transform hashes |
| 53 | Inference reproducibility | PASS for research rows; production execution BLOCKED |
| 54 | Selected artifact ID | N/A; no artifact frozen |
| 55 | Model version | N/A; research version is not an artifact |
| 56 | Artifact hash | N/A |
| 57 | Parameter hash | N/A artifact; research hash recorded above |
| 58 | Config hash | N/A artifact; research hash recorded above |
| 59 | Calibration hash | N/A; identity calibration, no artifact |
| 60 | Feature-manifest hash | Research `e6eb8f...1cfed`; no artifact binding |
| 61 | Durable artifact location | BLOCKED; none created |
| 62 | Runtime/library versions | Node `24.13.0`, pnpm `10.26.1`, TypeScript `5.9.2`; no new dependency |
| 63 | Executor registration | NO |
| 64 | Executor health | UNAVAILABLE |
| 65 | Input contract | Required `model-input-v4`; exact compatibility BLOCKED |
| 66 | Supported markets | Intended MLB full-game moneyline only; no executor |
| 67 | Guarded fallback | PASS; V1 default/fallback retained |
| 68 | Kill switch | PASS; `MLB_MODEL_MODE=v1` |
| 69 | Positive isolated approval fixture | PASS in existing guarded tests; no real approval created |
| 70 | Real pregame execution | BLOCKED |
| 71 | Frozen-artifact prospective evidence count | 0 |
| 72 | Old shadow rows excluded | Current development count 25; Task #237 inserted 0 |
| 73 | Approval ledger before/after | MLB rows `0` / `0` |
| 74 | Owner runtime status | MLB V1 active; V4 artifact/executor unavailable |
| 75 | Full test results | 90 files, 567 tests PASS; focused 5/5 PASS |
| 76 | Typecheck/build results | API typecheck PASS; libraries PASS; API build PASS |
| 77 | Security results | No critical dependency finding; pre-existing highs documented; HoundDog 0 |
| 78 | Dependency results | 0 critical, 32 high, 23 moderate, 3 low; no dependency added |
| 79 | Exact files changed | See files section |
| 80 | Independent model-science conclusion | `BLOCK_OOS_EVALUATION` |
| 81 | Independent architecture conclusion | Not run; executor was correctly not integrated |
| 82 | Remaining model blockers | Fresh untouched holdout, exact live feature parity, stronger evidence |
| 83 | Remaining promotion blockers | Frozen artifact, executor, prospective evidence, approval |
| 84 | Ready for Task #238 | **YES**, as an independent NCAAF task; MLB cutover remains NO |

## Verification

| Check | Result |
|---|---|
| Focused Task #237 tests | PASS — 5/5 |
| Full API tests | PASS — 90 files, 567 tests |
| API typecheck | PASS |
| Shared-library typecheck | PASS |
| API build | PASS |
| TRAIN/VALIDATION experiment | PASS; `LOCKED_OOS_NOT_QUERIED=true` |
| Experiment report SHA-256 | `2197c6cefe7c4305683ad327373df7ce72c771ca90abb528527a6dea07c95326` |
| Signing credential guard | PASS |
| Changed-file credential grep | PASS; no matches |
| Dependency scan | 0 critical; 32 high, 23 moderate, 3 low, all pre-existing |
| SAST | 2 pre-existing high path-traversal warnings in `artifacts/mobile/server/serve.js`; no Task #237 finding |
| Privacy/dataflow scan | PASS — 0 findings |
| Repository diff whitespace check | PASS |

The database package has no standalone `typecheck` script; the root shared-library TypeScript build passed.

## Independent model-science review

**Verdict: `BLOCK_OOS_EVALUATION`.**

The reviewer confirmed that the logistic implementation is deterministic, bounded, uses TRAIN-fitted transforms, and structurally excludes prohibited market/result/starter inputs. The reviewer blocked final-holdout evaluation and freezing because:

1. the existing OOS cohort is not globally untouched;
2. exact live-to-historical feature parity is absent;
3. validation lift is small and not robustly resolved.

The initial review also found hidden expected-runs validation exceptions. Task #237 corrected the family-label bug, surfaced errors, reran every TRAIN/VALIDATION comparison, and obtained valid finite deterministic metrics for all four family winners. The two material freeze blockers remain.

No architecture review was required because no executor was built.

## Files changed

- `artifacts/api-server/package.json`
- `artifacts/api-server/src/services/mlbV4Moneyline237.ts`
- `artifacts/api-server/src/services/mlbV4Moneyline237.test.ts`
- `artifacts/api-server/scripts/train-mlb-v4-moneyline-237.ts`
- `reports/mlb-v4-moneyline-237.json`
- `reports/task-237-mlb-v4-authoritative-model-build.md`
- `reports/task-237-verification.json`
- `.agents/memory/mlb-v4-shadow-boundary.md` (durable project decision note; no runtime effect)

The generated mockup-sandbox registry change visible in the worktree is unrelated automatic workspace state and is not part of Task #237.

## Owner summary

### TBM MLB V4 MODEL BUILD STATUS

**Incumbent:** `tbm-mlb-moneyline-v1`

**V4 Candidate:** no frozen candidate; `tbm-mlb-moneyline-v4-research-237` is validation-only

### MODEL BUILD

- Historical PIT-Safe Cohort: **READY**
- Training Rows: **4,700**
- Validation Rows: **2,361**
- Final Holdout Rows: **0 legitimately untouched; existing 2,012-game cohort is globally spent**
- Candidate Families Tested: **naive, offense baseline, logistic, ridge, Poisson, NB2**
- Selected Model: **binary logistic L2=0.1, research only**
- Calibration: **identity; validation ECE 0.025444**
- Final Holdout: **FAIL — not available and not queried**
- V1 Comparison: **PENDING — no identical sealed V1 probability cohort**

### SAFETY

- PIT Violations: **0**
- Target Leakage: **0**
- Starter Leakage: **0**
- Feature-Time Leakage: **0**

### FROZEN ARTIFACT

- Artifact ID: **N/A**
- Model Version: **N/A**
- Artifact Hash: **N/A**
- Parameter Hash: **N/A**
- Config Hash: **N/A**
- Feature Manifest Hash: **research-only hash, not artifact-bound**
- Durable Storage: **BLOCKED**

### EXECUTION

- Executor Registered: **NO**
- Executor Healthy: **NO**
- Input Contract: **`model-input-v4`; incompatible with selected historical feature semantics**
- Inference Reproducibility: **PASS in research / FAIL for production**
- Real Pregame Forecast: **BLOCKED**
- Supported Markets: **MLB full-game moneyline intended; none executable**

### GOVERNANCE

- `MODEL_BUILD_READY`: **FALSE**
- `MODEL_PROMOTION_READY`: **FALSE**
- `GUARDED_APPROVED`: **FALSE**
- Automatic Retraining: **DISABLED**
- Automatic Recalibration: **DISABLED**
- Automatic Parameter Changes: **DISABLED**
- Automatic Promotion: **DISABLED**

**CURRENT PUBLIC MLB:** V1

**V4 PUBLIC SERVING:** OFF

**READY FOR TASK #238:** YES, as the independent NCAAF risk/rating/POD task.

**READY FOR MLB GUARDED CUTOVER:** NO.