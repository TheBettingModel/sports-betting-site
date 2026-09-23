#223B FINAL

MODEL:
tbm-ncaaf-v4-expected-score

CONFIGURATION HASH:
212a6c78431a181821106721877155745724d3619ec63cf5424f098b07f9ae86

PARAMETER HASH:
792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81

FROZEN PROSPECTIVE LEDGER:
656

LEGITIMATELY GRADED GAMES:
0

PENDING GAMES:
656

INVALID/EXCLUDED GRADES:
0

PROSPECTIVE HOME MAE:
N/A

PROSPECTIVE AWAY MAE:
N/A

PROSPECTIVE MARGIN MAE:
N/A

PROSPECTIVE TOTAL MAE:
N/A

PROSPECTIVE BRIER:
N/A

PROSPECTIVE LOG LOSS:
N/A

HISTORICAL OOS MARGIN MAE:
12.5008391763

HISTORICAL OOS BRIER:
0.1800233716

PROSPECTIVE EVIDENCE:
INCONCLUSIVE

DRIFT:
INSUFFICIENT SAMPLE

PIT VIOLATIONS:
0

MARKET LEAKAGE VIOLATIONS:
0

INVALID PROBABILITY OUTPUTS:
0

RUNTIME HEALTH:
PARTIAL

MODEL APPROVAL RECOMMENDATION:
CONTINUE UNVALIDATED SHADOW EVIDENCE ACCUMULATION

MODEL MATURITY:
DEVELOPING

PRODUCTION APPROVAL READY:
FALSE

FULL LIVE PUBLICATION DATA READY:
FALSE

CURRENT CHAMPION CHANGED:
NO

PUBLICATION CHANGED:
NO

NFL CHANGED:
NO

FINAL DECISION:
C. #223B PARTIAL — MORE LEGITIMATELY GRADED PROSPECTIVE EVIDENCE IS REQUIRED

NEXT TASK:
Continue accumulating and grading the unchanged frozen ledger after games legitimately finish. Do not begin #224.

---

## 1. Executive summary

#223B loaded the immutable #223 v8 ledger without rebuilding any prediction. Every required hash and frozen model identifier matched exactly. At `2026-09-04T14:34:47.911Z`, the earliest frozen kickoff was still more than eight hours away, so all 656 eligible forecasts remained pending.

No prospective result was available to grade. Prospective metrics, calibration, drift, and incumbent comparisons remain unavailable. Runtime health is PARTIAL because the latest evidence run is partial from unmatched market identities; provider transport itself has no recorded errors.

## 2. Immutable ledger verification

| Identity | Expected and recomputed value | Result |
|---|---|---|
| Input ledger | `58b162ab5f4f984d018a3bfaa994eae80e323cf468b8dffdc3647884eeee4eab` | PASS |
| Prediction ledger | `fd7c547fda608d0a045cab9687cabae868baeba2d99efab852110057f859bccf` | PASS |
| Evaluation identity | `1d2bde61e2850b8dc6abe24764aa46816ec32ed10a1139cdcbb260592012c60e` | PASS |
| Configuration | `212a6c78431a181821106721877155745724d3619ec63cf5424f098b07f9ae86` | PASS |
| Parameters | `792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81` | PASS |

The source remains `reports/ncaaf-v4-formal-validation-evidence-2026-09-04-v8.json`. No forecast was regenerated, replaced, or backfilled.

Canonical continuation evidence: `reports/ncaaf-v4-prospective-validation-evidence-2026-09-04-20260904T143447911Z.json`. Each future evaluation writes a distinct timestamped file. Earlier continuation packages are superseded diagnostic evidence and are not used for approval.

## 3. Completed-game resolution

- `PREGAME_FROZEN_PENDING`: 656
- `PREGAME_FROZEN_GRADED`: 0
- `INVALID_RESULT`: 0
- `RESULT_UNAVAILABLE`: 0
- `OUT_OF_DOMAIN`: 123

Only authoritative `final` evidence with complete scores and a kickoff exactly matching the frozen ledger can be graded. Cancelled, postponed, no-contest, partial, or live results are excluded.

## 4. Grading eligibility

All frozen rows passed model ID, configuration, parameter, feature-schema, identity, frozen 138-team FBS-universe membership, prediction-before-kickoff, and feature-cutoff checks. Finals additionally require observed ESPN evidence, a payload hash, complete nonnegative scores, and capture after kickoff. The strict grader also rejects duplicate IDs, malformed scores, conflicting kickoffs, non-finite outputs, invalid probabilities, and non-positive uncertainty.

Eligible completed rows: **0**. Eligibility exclusions among completed rows: **0**.

## 5. Prospective game count

The frozen cohort remains 656 games, with 656 pending and zero graded. The count is not inflated by out-of-domain targets or current snapshots captured after the #223 freeze.

## 6. Prospective score metrics

Home and away MAE/RMSE are **N/A** because no frozen game has completed.

## 7. Prospective margin metrics

Margin MAE, RMSE, and bias are **N/A**.

## 8. Prospective total metrics

Total MAE, RMSE, and bias are **N/A**.

## 9. Prospective Brier/log loss

Moneyline Brier and log loss are **N/A**. Identity-calibrated probabilities remain frozen and no calibration transform was fitted or applied.

## 10. Historical comparison

Historical OOS references remain:

- Margin MAE: 12.5008391763
- Total MAE: 12.9390090779
- Brier: 0.1800233716
- Log loss: 0.5347917462

Absolute and percentage differences are unavailable with zero prospective grades. Classification: **INCONCLUSIVE**.

## 11. Sample adequacy

- Architecture confirmation: **supported**
- Provisional production approval: **not supported**
- Calibration confidence: **not supported**
- Mature validation: **not supported**

This conclusion uses the actual evidence rather than an arbitrary numerical threshold.

## 12. Calibration

No prospective reliability bands, ECE, or MCE can be computed. The applied transform remains identity calibration. Prospective results were not used to fit anything.

## 13. Early-season performance

No early-season game has completed in the frozen ledger. Historical Weeks 1–3 remain the only early-season diagnostic and cannot be compared prospectively yet.

## 14. Data-quality performance

No HIGH, MEDIUM, LOW, or INSUFFICIENT prospective quality group has a graded result. Future publication should continue treating INSUFFICIENT as a candidate abstention state, but no policy was activated.

## 15. Error forensics

There are no prospective errors or outliers to inspect. No claims were made about QB changes, injuries, roster changes, discontinuity, identity, or stale features.

## 16. Optional live availability review

Confirmed starting QB and material injury state remain candidate **PUBLICATION REQUIRED / ABSTENTION TRIGGER** inputs. Depth-chart state remains an **OPTIONAL ENHANCEMENT / RESEARCH ONLY** signal. No unavailable information was inferred.

## 17. Drift analysis

Classification: **INSUFFICIENT SAMPLE**. Score residuals, margin/total bias, residual SD, Brier, and log loss have no prospective observations. No drift claim is justified.

## 18. Probability integrity

The complete frozen ledger retains finite expected scores and uncertainty, probabilities strictly between zero and one, and home-plus-away probability equal to one within tolerance. Invalid output count: **0**.

## 19. Market sandbox

Matched graded-game count: **0**. No market comparison was performed, and no sportsbook price entered the sports-model validation layer.

## 20. CLV separation

CLV sample count: **0**. CLV did not alter expected scores, probabilities, weights, calibration, or approval.

## 21. Incumbent comparison

The overlapping completed cohort with `tbm-ncaaf-moneyline-v1` is zero. Winner accuracy, Brier, log loss, disagreement, and coverage are unavailable. No comparison was forced.

## 22. Operational health

Current development runtime:

- Active development API scheduler Node-process count: UNAVAILABLE in the persisted run ledger
- Duplicate NCAAF invocation count: UNAVAILABLE — not persisted
- Active evidence runs: at most 1
- Stale evidence runs: 0
- Current provider transport errors in the latest run: 0
- Latest evidence-run status: PARTIAL
- Partial reason: 1,196 `unmatched_market_identity` rows
- Database-auth error count: UNAVAILABLE — not persisted in the run ledger
- Feature-bridge failure count: UNAVAILABLE — not persisted in the run ledger
- Prediction-generation failure count: UNAVAILABLE — not persisted in the run ledger
- Continuation grading execution: PASS

The managed API workflow restarted successfully and logged `API ready`, but process count is not persisted in the evidence ledger and is therefore unavailable in the canonical machine evidence. The latest NCAAF evidence cycle produced 779 feature and intelligence snapshots with no persisted game failures and empty persisted provider transport errors, but its status is `partial` because some market rows could not be safely linked to ESPN games. Duplicate invocation and database-auth counts are likewise unavailable. Earlier transient ESPN/database errors and unrelated Soccer foreign-key errors remain disclosed historical observations.

## 23. Approval gates

| Gate | Result |
|---|---|
| PIT violations = 0 | PASS |
| Market leakage = 0 | PASS |
| Immutable ledger intact | PASS |
| Valid prospective grading path | PASS |
| Probability integrity | PASS |
| Domain enforcement | PASS |
| Runtime health for controlled evaluation | PARTIAL — unmatched market identities |
| Prospective metrics non-catastrophic | NOT ASSESSABLE |
| Calibration defect absent prospectively | NOT ASSESSABLE |
| Material drift absent | NOT ASSESSABLE |

The non-assessable prospective gates prevent advancement to #224.

## 24. Registry recommendation

Continue the current non-production state and accumulate shadow evidence. Do not apply `PRODUCTION_APPROVED`, promote V4, or change `tbm-ncaaf-moneyline-v1`.

## 25. Maturity

Remain **DEVELOPING**. Historical validation and live architecture are credible, but there is no prospective performance evidence.

## 26. Continuous-learning rule

Every legitimately completed frozen game may append evaluation evidence. Production weights must not update automatically. Any future coefficient or calibration change requires a new version, chronological validation, OOS testing, and explicit approval.

## 27. Tests/build

- Immutable ledger hash verification: PASS
- Pending-game exclusion: PASS
- Final-result eligibility: PASS
- Postponed/cancelled exclusion path: enforced
- Duplicate grading prevention: PASS
- Prediction and cutoff timing: PASS
- Score/Brier/log-loss grader: PASS
- Probability integrity: PASS
- Final relevant suite: 53/53 passed across 9 files
- TypeScript typecheck: PASS

The full final suite, including frozen-domain and authoritative-final rejection tests, and production build are run before delivery.

## 28. Remaining limitations

No frozen game has completed, so prospective accuracy, calibration, drift, early-season behavior, data-quality performance, error forensics, market comparison, CLV, and incumbent overlap remain unknown. Runtime remains partial due to unmatched market identities. Full live publication eligibility also lacks complete QB/injury/depth-chart evidence.

## 29. Final decision

**C. #223B PARTIAL — MORE LEGITIMATELY GRADED PROSPECTIVE EVIDENCE IS REQUIRED**

The immutable ledger is healthy, but all 656 frozen games remain pending and runtime health is partial. Continue accumulating the unchanged ledger, resolve or explicitly accept the operational market-identity limitation in a later gate, and rerun grading after authoritative finals exist. Do not begin #224.