# NFL V4.0 Core Rapid Completion and 2026 Live Evidence Launch

## 1. Executive decision
**Classification: B — NFL V4 is technically ready for prospective shadow validation, not publication.** The clean candidate beats the historical-rate baseline on validation and untouched OOS data, executes the current full slate, and now persists immutable 2026 shadow forecasts. It remains `SHADOW`, `V4_VALIDATING`, and publication-disabled.

## 2. Scope
This continuation is NFL-only. It does not alter Soccer, redesign clients, cut over production, or authorize official picks.

## 3. Prior rejection
The prior generic rolling-score NFL candidate was correctly rejected because its probability Brier score was worse than the historical-rate baseline.

## 4. Diagnosis
The generic engine lacked an NFL-specific season reset, controlled inter-season carryover, and an independently regularized win-strength state. Its score trend was not a sufficient win-probability model.

## 5. Remediation strategy
The replacement is a compact NFL-only Elo probability core plus regularized, recency-weighted home and away score models.

## 6. Modeling boundary
No market prices, betting lines, sportsbook fields, injury hindsight, QB hindsight, or post-kickoff information enter the model.

## 7. Source
Historical outcomes come from ESPN’s NFL scoreboard feed and retain provider event and participant identities.

## 8. Raw cohort
The source contains 1,143 provider rows covering the controlled 2022–2026 acquisition window.

## 9. Canonical cohort
All 1,143 rows canonicalized structurally before sport-eligibility quarantine.

## 10. Quarantine
Four AFC-versus-NFC Pro Bowl events were quarantined as non-club events.

## 11. PIT-eligible club cohort
The clean point-in-time eligible club-game cohort contains 1,139 events.

## 12. Chronological split
The clean split is 786 training rows, 168 validation rows, and 169 untouched OOS rows.

## 13. Split safety
Rows are ordered by event time; no randomized split is used.

## 14. Target availability
Completed scores enter state only after conservative completion availability, never merely because a final score exists in a later extract.

## 15. NFL season definition
The season boundary is July 1. February 2026 is part of the 2025 season; September 2026 starts the 2026 season.

## 16. Season transition
At a new season, team Elo and scoring state regress toward league priors rather than carrying fully across years.

## 17. Carryover
The selected inter-season carryover is `0.35`.

## 18. Early-season behavior
Sparse early-season team observations are regularized toward league state and the carried prior.

## 19. Recency
Scoring form uses exponentially recency-weighted state so recent games matter without discarding the stable prior.

## 20. Opponent strength
The Elo update uses opponent-relative expected win probability; it does not treat every win or loss as equal evidence.

## 21. Score outputs
Every forecast emits expected home score, expected away score, margin, and total.

## 22. Probability outputs
Every forecast emits complementary home and away win probabilities that sum to one.

## 23. Candidate family
The controlled family varied Elo K, home advantage, and inter-season carryover only. This limited search reduces overfitting risk.

## 24. Selected candidate
`ELO_HOME_55`: K `12`, home advantage `55` Elo points, carryover `0.35`.

## 25. Balanced challenger
`ELO_BALANCED` scored validation/OOS Brier `0.22119 / 0.21475`.

## 26. Slow-update challenger
`ELO_SLOW` scored validation/OOS Brier `0.22084 / 0.21838`.

## 27. High-carry challenger
`ELO_HIGH_CARRY` scored validation/OOS Brier `0.22086 / 0.21699`.

## 28. Low-carry challenger
`ELO_LOW_CARRY` scored validation/OOS Brier `0.22298 / 0.21312`.

## 29. Selection rule
Selection uses validation Brier. OOS metrics are reported after selection and are not used to relabel the winner.

## 30. Validation Brier
Selected candidate: `0.22043`; historical-rate baseline: `0.24060`; absolute improvement: `0.02017`.

## 31. OOS Brier
Selected candidate: `0.21657`; historical-rate baseline: `0.25220`; absolute improvement: `0.03563`.

## 32. Training Brier
Training Brier is `0.22375`, consistent with rather than suspiciously better than later cohorts.

## 33. Validation log loss
Validation log loss is `0.63651`.

## 34. OOS log loss
OOS log loss is `0.61988`.

## 35. Validation discrimination
Validation ROC AUC is `0.67851`.

## 36. OOS discrimination
OOS ROC AUC is `0.72681`.

## 37. Validation calibration
Validation expected calibration error is `0.06421`.

## 38. OOS calibration
OOS expected calibration error is `0.10362`. This is acceptable for shadow launch but remains a prospective monitoring item.

## 39. Home-score accuracy
OOS home-score MAE is `7.234`; bias is `+0.884`.

## 40. Away-score accuracy
OOS away-score MAE is `7.882`; bias is `-0.711`.

## 41. Margin accuracy
OOS margin MAE is `9.882`; margin bias is `+1.595`.

## 42. Total accuracy
OOS total MAE is `11.150`; total bias is `+0.172`.

## 43. Average-score sanity
Actual/predicted averages are home `23.314 / 24.197`, away `22.320 / 21.608`, and total `45.633 / 45.805`.

## 44. Stability interpretation
Training, validation, and OOS probability results show no late-cohort collapse; untouched OOS performance improves on validation.

## 45. Ablation interpretation
Lower carryover improved OOS but lost validation performance; higher carryover did not dominate; slower K degraded both. The selected parameters are a controlled validation choice, not an OOS cherry-pick.

## 46. Leakage audit
The feature contract contains only prior outcomes and timestamps available before each event. Forbidden market and hindsight fields are absent.

## 47. Pro Bowl audit
Retraining after quarantine changed the authoritative artifact and cohort hashes and preserved the quality-gate pass.

## 48. Model identity
Model ID is `tbm-nfl-v4-core`; model version is `4.0.0-elo-score`.

## 49. Artifact identity
Artifact SHA-256 is `0da3f4e62a88da4c8d486b6433ca83c907e2cbd2fc072834817cbdb919233c5e`.

## 50. Parameter identity
Parameter hash is `f806a63960e2eecab060c4257c494ab8adab26de5d484edbc7fd0940b5c86136`.

## 51. Contract identity
Feature contract hash is `7809b6f49fad7ebb397cc483d6ec4d5f8c297b2d2d7e5125438c114247509260`.

## 52. Cohort identity
Clean cohort hash is `c432744d39dc85a214477779101f8dd7c3d6e5105f41fbce609d49275f426a4e`.

## 53. Artifact verification
Runtime startup verifies canonical artifact hash, parameter hash, contract identity, sport, model identity, and lifecycle metadata before registration.

## 54. Exact executor
Live NFL forecasts are produced by the same season-aware Elo and score-state code used to train and freeze the artifact.

## 55. Determinism
Identical artifact, prior history, event identity, and cutoff produce identical model outputs and feature hashes.

## 56. Router behavior
NFL is registered in the strict V4 router. Missing, invalid, or mismatched evidence returns explicit `NO_FORECAST` behavior rather than legacy fallback.

## 57. Missing schedule compatibility
Legacy upcoming NFL rows lacked kickoff and participant IDs. The live path now enriches these fields in memory only by exact ESPN event ID; unresolved rows remain fail-closed.

## 58. Current full-slate dry run
The database-discovered 2026 Week 1 slate produced 15/15 forecasts: Thursday `1/1`, Sunday `13/13`, and Monday `1/1`, with zero failed eligible events.

## 59. Forecast sanity
The current slate emits finite scores, margins, totals, probabilities, winners, model version, event time, and forecast timestamp for every eligible event.

## 60. Publication boundary
All current forecasts report `officialPickStatus = NOT_PUBLICATION_ELIGIBLE`. No NFL V4 official pick or client publication was enabled.

## 61. Prospective persistence
The development database now has the existing additive V4 warehouse schema applied. Startup capture persisted 15 unique immutable NFL forecast versions.

## 62. Prospective coverage ledger
The first shadow capture persisted three date-level runs with `10000` basis points coverage, 15 eligible events, 15 forecasts, and zero failures.

## 63. 2026 operating state
An isolated NFL job runs at `:07` and `:37`, plus startup, over a bounded eight-day horizon. It is append-only, idempotent for identical feature evidence, non-fatal, independent of official-pick generation, and suitable for prospective 2026 grading.

## 64. Final recommendation
Proceed with **Task 244** as the single next task: evaluate the accumulated prospective shadow forecasts across sports and define evidence-based promotion decisions without enabling publication prematurely.