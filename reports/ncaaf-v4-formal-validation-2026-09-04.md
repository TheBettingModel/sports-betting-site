#223 FINAL

MODEL:
tbm-ncaaf-v4-expected-score

MODEL VERSION:
D-simple-expected-score-linear

CONFIGURATION HASH:
212a6c78431a181821106721877155745724d3619ec63cf5424f098b07f9ae86

PARAMETER HASH:
792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81

HISTORICAL OOS GAMES:
410

HISTORICAL OOS MARGIN MAE:
12.5008391763

HISTORICAL OOS TOTAL MAE:
12.9390090779

HISTORICAL OOS BRIER:
0.1800233716

HISTORICAL OOS LOG LOSS:
0.5347917462

CALIBRATION DECISION:
NO CHANGE — retain identity calibration. Validation-fitted Platt is the strongest historical candidate, but it is not applied without prospective graded evidence.

PROSPECTIVE FROZEN PREDICTIONS:
656

PROSPECTIVE GRADED GAMES:
0

PROSPECTIVE MARGIN MAE:
N/A

PROSPECTIVE TOTAL MAE:
N/A

PROSPECTIVE BRIER:
N/A

PROSPECTIVE LOG LOSS:
N/A

PROSPECTIVE EVIDENCE:
INCONCLUSIVE

PIT VIOLATIONS:
0

MARKET LEAKAGE VIOLATIONS:
0

INVALID PROBABILITY OUTPUTS:
0

MODEL DOMAIN:
FBS-vs-FBS NCAAF only

V4 VALIDATION READY:
TRUE

PRODUCTION APPROVAL READY:
FALSE

FULL LIVE PUBLICATION DATA READY:
FALSE

MODEL APPROVAL STATE:
UNVALIDATED; SHADOW is recommended but was not applied

MODEL MATURITY:
DEVELOPING

CURRENT CHAMPION CHANGED:
NO

PUBLICATION CHANGED:
NO

NFL CHANGED:
NO

FINAL DECISION:
C. #223 PARTIAL — PROSPECTIVE SAMPLE OR ONE SPECIFIC VALIDATION BLOCKER REMAINS

NEXT TASK:
Continue #223 prospective grading after legitimately frozen 2026 games finish. Do not begin #224 yet.

---

## 1. Executive summary

The frozen Baseline D expected-score engine passes the complete historical validation gate. Its identity, split, canonical OOS metrics, PIT lineage, market firewall, probability outputs, and threshold-query behavior all reconcile. The 2026 bridge also produced a complete, write-once pre-kickoff ledger containing 656 exact inputs and 656 exact predictions.

The sole advancement blocker is timing: at the immutable evaluation timestamp, none of those games had completed. Prospective metrics are therefore unavailable and the prospective evidence classification is **INCONCLUSIVE**. V4 remains non-production.

## 2. Evaluation identity

- Evaluation version: `ncaaf-v4-formal-validation-v1`
- Evaluation timestamp: `2026-09-04T14:15:00.000Z`
- Evaluation identity hash: `1d2bde61e2850b8dc6abe24764aa46816ec32ed10a1139cdcbb260592012c60e`
- Dataset: `ncaaf-v4-training-foundation-v2`
- Feature schema: `ncaaf-chronological-team-game-v2`
- Split checksum: `7cee52d5188179d81a177aa55b9ac54e06211f11ed8a5b0d29b032ff94095abc`
- Training: 2023–2024
- Validation: 2025 Weeks 1–7
- OOS: 2025 Week 8+
- Distribution: `normal-margin-total-v1`
- Calibration evaluation: `identity-or-validation-fitted-platt-temperature-v1`

The identity, bridge assessment, ledger freeze, and prospective grading all use the same timestamp.

## 3. Frozen model verification

Configuration hash, parameter hash, dataset, feature schema, and split checksum matched exactly. The validator fails closed on any mismatch and never silently retrains. Baseline D coefficients and the historical split were not changed.

## 4. Historical OOS reconciliation

| Metric | Recomputed OOS |
|---|---:|
| Games | 410 |
| Home MAE / RMSE | 9.282626 / 11.530185 |
| Away MAE / RMSE | 8.498564 / 10.582373 |
| Margin MAE / RMSE | 12.500839 / 15.480163 |
| Total MAE / RMSE | 12.939009 / 15.818601 |
| Brier | 0.180023 |
| Log loss | 0.534792 |

All canonical metrics reconciled within deterministic tolerance. These probability metrics use final training-derived uncertainty.

## 5. Baseline comparison

| Baseline | Home MAE | Away MAE | Margin MAE | Total MAE |
|---|---:|---:|---:|---:|
| A — historical home/away average | 10.9735 | 9.9676 | 15.7611 | 13.3153 |
| B — prior offense vs defense | 9.4643 | 9.0681 | 13.4016 | 12.8096 |
| C — pregame Elo winner | 10.9735 | 9.9676 | 15.7611 | 13.3153 |
| D — simple expected-score core | **9.2826** | **8.4986** | **12.5008** | 12.9390 |

Baseline D materially improves the main score and margin targets. Baseline B has a slightly lower total MAE, but the previously tested distinct expanded-ridge challenger did not produce a robust overall gain. Simplicity remains favored.

The old fixed-sigma Baseline D probability comparison is quarantined as deprecated. It is not substituted for the canonical Brier/log-loss values in Section 4.

## 6. Calibration audit

Calibration uses symmetric favorite probability, not home-only probability.

| Cohort | Band | N | Mean forecast | Observed | Absolute error |
|---|---|---:|---:|---:|---:|
| Validation | 50–55% | 79 | .529 | .544 | .015 |
| Validation | 55–60% | 58 | .576 | .448 | .128 |
| Validation | 60–65% | 69 | .626 | .638 | .012 |
| Validation | 65–70% | 49 | .676 | .755 | .079 |
| Validation | 70–75% | 53 | .725 | .811 | .086 |
| Validation | 75–80% | 33 | .776 | .818 | .042 |
| Validation | 80%+ | 57 | .857 | .930 | .073 |
| OOS | 50–55% | 62 | .524 | .758 | .234 |
| OOS | 55–60% | 51 | .575 | .471 | .105 |
| OOS | 60–65% | 61 | .623 | .590 | .033 |
| OOS | 65–70% | 58 | .677 | .810 | .133 |
| OOS | 70–75% | 54 | .722 | .741 | .018 |
| OOS | 75–80% | 35 | .771 | .800 | .029 |
| OOS | 80%+ | 89 | .874 | .944 | .070 |

- Validation ECE / MCE: 0.058743 / 0.127545
- OOS ECE / MCE: 0.092229 / 0.234331
- Canonical validation Brier / log loss: 0.195057 / 0.571199
- Canonical OOS Brier / log loss: 0.180023 / 0.534792

The OOS 50–55% band is noisy and underconfident. This is a caution, not a catastrophic global calibration defect.

## 7. Calibration candidate evaluation

| Candidate | Fit cohort | Validation Brier / LL | OOS Brier / LL |
|---|---|---:|---:|
| Identity | none | .195057 / .571199 | .180023 / .534792 |
| Platt (`a=1.23715`, `b=.19608`) | validation only | .192815 / .562139 | .180586 / .534033 |
| Temperature (`T=.9`) | validation only | .194131 / .567858 | .178899 / .530757 |

No candidate used OOS or 2026 labels for fitting. Expected points were unchanged.

## 8. Calibration decision

**No change.** Platt wins the predeclared validation scorecard and does not materially degrade aggregate OOS probability quality, while temperature performs better on OOS. The disagreement between those candidates and the zero-game prospective sample are insufficient grounds to alter the frozen probability translation. Identity calibration remains applied; the alternatives remain research candidates.

## 9. Distribution validation

OOS residuals are defined as prediction minus actual:

| Target | Mean | SD | Skew | \|error\| ≥15 | \|error\| ≥25 |
|---|---:|---:|---:|---:|---:|
| Home score | 0.874 | 11.497 | -0.330 | 87 | 10 |
| Away score | 0.534 | 10.569 | -0.236 | 69 | 6 |
| Margin | 0.340 | 15.476 | -0.183 | 134 | 52 |
| Total | 1.408 | 15.756 | -0.338 | 149 | 41 |

Bias is modest relative to dispersion. Slight negative skew and material football tails remain. The normal-derived distribution is usable for controlled shadow evaluation but should not be labeled mature.

## 10. Heteroscedasticity

Diagnostics were computed by week, early/late state, sample-count state, data quality, favorite probability, predicted margin, predicted total, venue, and expected-score level. Variation exists, especially in small quality/venue cells, but there is no stable validation-plus-OOS case for adding a variance tier now. The global uncertainty model remains frozen.

## 11. Stability

OOS weekly samples are mostly 51–67 games; Week 15 has 9 and Week 16 has 1, so those cells are not decision-grade. Home-site games (`n=396`) had margin MAE 12.523 and Brier .1783; neutral games (`n=14`) had margin MAE 11.861 and Brier .2291. Sample-count bands were directionally similar. No chronological block indicates catastrophic collapse, but small subsets are not overinterpreted.

## 12. Historical error outliers

The ten largest OOS margin errors ranged from 33.0 to 52.1 points in absolute value; the largest was game `401760413` at -52.10. The ten largest total errors ranged from 36.06 to 45.55 points; the largest was game `401756960` at -45.55. All top listed errors were marked HIGH data quality, suggesting football variance and unmodeled game-specific discontinuities rather than identity or PIT corruption. No coefficient was manually changed in response.

## 13. Data-quality validation

Validation:

| State | N | Margin MAE | Total MAE | Brier | Log loss |
|---|---:|---:|---:|---:|---:|
| HIGH | 50 | 12.600 | 15.266 | .2212 | .6304 |
| MEDIUM | 193 | 12.948 | 11.607 | .1927 | .5657 |
| LOW | 102 | 15.029 | 13.267 | .1864 | .5520 |
| INSUFFICIENT | 53 | 15.959 | 14.551 | .1956 | .5722 |

OOS contains 405 HIGH and only 5 MEDIUM rows; the five-row MEDIUM probability result is too small for a strong conclusion. INSUFFICIENT has the worst validation margin error and remains a sensible future abstention condition.

## 14. Early-season validation

The closest supported grouping is validation Weeks 1–3 versus Weeks 4–7:

| Group | N | Home MAE | Away MAE | Margin MAE | Total MAE | Brier | Log loss |
|---|---:|---:|---:|---:|---:|---:|---:|
| Weeks 1–3 | 191 | 11.352 | 9.126 | 14.608 | 14.053 | .1956 | .5727 |
| Weeks 4–7 | 207 | 9.306 | 8.842 | 13.129 | 11.805 | .1946 | .5698 |

Early score/total error is worse, but probability metrics are similar. This supports conservative early-season publication eligibility, not a score-model change.

## 15. 2026 cohort definition

The write-once ledger was frozen at `2026-09-04T14:15:00Z`, before the earliest kickoff at `2026-09-04T22:30:00Z`.

- `PREGAME_FROZEN_PENDING`: 656
- `PREGAME_FROZEN_GRADED`: 0
- `INVALID_AFTER_CUTOFF`: 0
- `OUT_OF_DOMAIN`: 123

Every prediction embeds its scheduled kickoff. Duplicate IDs, conflicting kickoffs, malformed outcomes, and late forecasts fail closed.

## 16. Prospective grading

Zero legitimately completed frozen games existed at evaluation time. No outcome was invented, no pending game was backfilled, and no retrospective forecast was admitted.

## 17. Prospective metrics

Home MAE, away MAE, margin MAE, total MAE, Brier, and log loss are all **N/A** because the graded sample is zero.

## 18. Historical/prospective comparison

No numerical comparison is possible. Prospective evidence is **INCONCLUSIVE**, not consistent, promising, or concerning.

## 19. Sample adequacy

- Architecture validation: **PASS** — immutable reconstruction, identity mapping, cutoff enforcement, and grading path are verified.
- Provisional production approval: **INSUFFICIENT** — no graded forecast exists.
- Mature validation: **INSUFFICIENT** — no prospective calibration or drift evidence exists.

## 20. Optional/live eligibility features

- Confirmed starting QB: **PUBLICATION ELIGIBILITY REQUIRED** when the future policy depends on QB availability; not required by the frozen core.
- Injury availability: **PUBLICATION ELIGIBILITY REQUIRED** for stale/material late news; not a training feature in this gate.
- Depth-chart state: **OPTIONAL ENHANCEMENT / RESEARCH ONLY** until reliable PIT coverage exists.

Their current absence does not invalidate the sports model, but full live-publication readiness remains false.

## 21. Model domain

The model domain is strictly FBS-vs-FBS NCAAF. The bridge classified 656 eligible games and 123 out-of-domain targets (122 FBS-vs-FCS and 1 other). Unresolved identity count is zero. No out-of-domain target may be promoted.

## 22. Abstention recommendations

Future publication should fail closed for INSUFFICIENT quality, unresolved identity, unsupported domain, stale cutoff, missing material live availability, extreme early-season uncertainty, or approval/version mismatch. These are recommendations for later approval work only; publication was not activated.

## 23. Probability integrity

All 410 historical OOS predictions and all 656 frozen prospective predictions had finite score/probability outputs, positive uncertainty, probabilities strictly inside `(0,1)`, and home-plus-away probability equal to one within tolerance. Invalid output count: **0**.

## 24. Spread/total query integrity

Representative spread thresholds `-7.5`, `-3.5`, `+3.5` and totals `45.5`, `52.5`, `60.5` passed monotonicity and complement checks. Query lines are downstream arguments and never feed back into expected scores or fitting. Query failure count: **0**.

## 25. Market comparison sandbox

No prospective game was graded, so exact matched-market sample count is zero and market comparison is not evaluated. Sportsbook information remained outside all score/probability training and validation.

## 26. CLV separation

No eligible CLV sample was used. CLV availability is reported as zero and did not modify expected scores, probabilities, weights, calibration, or approval. ROI was not computed or used for promotion.

## 27. Incumbent comparison

The exact comparable pregame intersection with `tbm-ncaaf-moneyline-v1` is zero. Accuracy, Brier/log loss, disagreement, and coverage comparisons are therefore unavailable rather than forced. The incumbent remains champion; V4 receives no preference merely for being newer.

## 28. Advancement gates

| Gate | Result |
|---|---|
| Frozen identity | PASS |
| PIT violations = 0 | PASS |
| Market leakage = 0 | PASS |
| Canonical OOS reconciliation | PASS |
| No catastrophic calibration defect | PASS |
| 2026 schema/identity compatibility | PASS |
| Prospective grading path valid | PASS |
| Probability outputs valid | PASS |
| Distribution queries valid | PASS |
| Registry immutable | PASS |
| NFL/other-sport isolation | PASS |
| Prospective consistency evidence | **BLOCKED: 0 graded games** |

## 29. Validation evidence package

Canonical package: `reports/ncaaf-v4-formal-validation-evidence-2026-09-04-v8.json`

- Full 656-row input ledger hash: `58b162ab5f4f984d018a3bfaa994eae80e323cf468b8dffdc3647884eeee4eab`
- Full 656-row prediction ledger hash: `fd7c547fda608d0a045cab9687cabae868baeba2d99efab852110057f859bccf`
- Evaluation identity hash: `1d2bde61e2850b8dc6abe24764aa46816ec32ed10a1139cdcbb260592012c60e`

The package includes exact model inputs, exact predictions, scheduled kickoffs, model identity, calibration diagnostics, residuals, stability buckets, prospective cohorts, limitations, and the non-production recommendation.

## 30. Registry recommendation

Recommend controlled **SHADOW** evaluation, but do not apply a status transition during this partial gate. Development remains `challenger`; production contains only `tbm-ncaaf-moneyline-v1`. V4 remains UNVALIDATED for approval purposes and is not `PRODUCTION_APPROVED`.

## 31. Maturity recommendation

**DEVELOPING.** Historical validation is credible and architecture is ready, but prospective performance and calibration have no graded sample. `VALIDATED` and `MATURE` would be premature.

## 32. Operational health

The API and all configured workflows are running. The NCAAF validation cycle completed as `inconclusive`, consistent with zero available evaluations; the feature bridge and 656-prediction generation succeeded. Current logs show successful NCAAF provider fetches.

Operational concerns remain separate from model quality: duplicate scheduler processes were visible, and unrelated Soccer odds snapshot writes produced foreign-key errors. Earlier transient ESPN/database authentication timeouts are disclosed but were not reproduced as a model-evidence failure. Runtime reliability should be addressed before later production approval.

## 33. NFL/other sport isolation

No NFL, MLB, Soccer, or other sports-model code, weights, registry state, picks, wagers, or units were modified by #223. The observed Soccer runtime errors were only audited and not changed.

## 34. Tests/build

- Full relevant suite: **27/27 passed**
- Formal validator and strict prospective grader: passed
- Frozen hash and OOS reconciliation: passed
- Validation-only calibration and no OOS fitting: passed
- Probability and spread/total query integrity: passed
- Pending/graded cohort logic and after-kickoff rejection: passed
- Duplicate/conflicting/malformed evidence rejection: passed
- TypeScript typecheck: passed
- API production build: passed
- Independent architecture review: **PASS**

## 35. Remaining limitations

The only advancement blocker is zero legitimately graded prospective forecasts. Consequently there is no prospective error scale, calibration, drift, incumbent overlap, market sandbox, or CLV evidence. Optional QB/injury/depth-chart inputs also remain unavailable for full publication eligibility, and runtime scheduler duplication should be resolved before production approval.

## 36. Final decision

**C. #223 PARTIAL — PROSPECTIVE SAMPLE OR ONE SPECIFIC VALIDATION BLOCKER REMAINS**

Specific blocker: **the immutable 656-game prospective ledger contains zero legitimately completed games at the evaluation timestamp.**

Do not begin #224. Do not promote V4, change the champion, publish V4 picks, create wagers, or create units.