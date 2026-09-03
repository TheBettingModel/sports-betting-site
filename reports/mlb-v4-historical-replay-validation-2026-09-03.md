# MLB V4 Historical Replay & Challenger Validation

Date: 2026-09-03  
Mode: read-only, research-only, shadow-only  
Detailed immutable replay ledger: `reports/mlb-v4-historical-replay-validation-2026-09-03.json`

## 1. Executive summary

The largest clean point-in-time replay available contains **79 completed games** from **2026-08-23 through 2026-08-31**. This is below the required 100-game minimum diagnostic sample and far below a promotion-quality out-of-sample sample.

V4 improved on V3 in Brier score (0.2379 vs 0.2449) and log loss (0.6689 vs 0.6822), but lost to the no-vig market (Brier 0.2331; log loss 0.6586). V4 Brier Skill Score versus market was **-0.0206**. Its run model materially underpredicted scoring: total-runs bias was **-2.327 runs/game** and total RMSE was **5.349**. V4 selected-side win rate was **49.4%** despite an average selected probability of **57.1%**.

Recommendation: **B — BUILD MLB V4.1 CHALLENGER.** The run-first architecture remains auditable and directionally better than V3 on proper scoring, but the current run estimates and uncertainty behavior need evidence-supported research changes. Do not promote V4.

## 2. Historical replay date range

The clean window is 2026-08-23 through 2026-08-31 inclusive. Earlier rows lacked the full immutable evidence bundle needed to reconstruct V4 without current-data or postgame leakage.

## 3. Total sample size

- Immutable source revisions in the accepted window: 200
- Distinct games represented: 79
- Latest valid pregame snapshots replayed: 79
- Minimum diagnostic target: 100
- Promotion-quality target: not reached

Repeated revisions were deduplicated by game after point-in-time validation; only the latest valid pregame revision was used.

## 4. Replay coverage

Coverage is nine calendar days and 79 completed MLB games. It is adequate to detect large implementation defects and directional failure modes, but not to fit calibration, optimize policy, or make stable team/park/month conclusions.

## 5. Exclusion reasons

Inside the accepted 2026-08-23 to 2026-09-01 query window, all 200 selected production snapshot revisions passed the strict evidence checks before 79-game deduplication. Earlier history was excluded from the replay universe because it did not preserve the full V4-required evidence object and reliable game-start cutoff.

## 6. Point-in-time integrity assessment

Each accepted record required:

- prediction timestamp before first pitch;
- evidence `capturedAt` and `cutoffTimestamp` before first pitch;
- immutable `decision.availability`, `decision.inputSignals`, and full-game evidence;
- completed scores read only after forecast reconstruction;
- no live enrichment, current roster lookup, or postgame feature repair.

The replay writes no database rows. Every output record carries `officialPick: false` and `officialUnits: 0`.

## 7. Run prediction metrics

| Target | MAE | RMSE | Bias (projected - actual) |
|---|---:|---:|---:|
| Home runs | 2.840 | 3.682 | -1.499 |
| Away runs | 2.412 | 3.424 | -0.828 |
| Total runs | 4.211 | 5.349 | -2.327 |
| Home margin | 3.451 | 4.684 | -0.672 |

The dominant run-model defect is broad underprediction, especially for home scoring.

## 8. Run-model segmentation

Seventy-six of 79 forecasts projected fewer than eight total runs. That group had total MAE 4.240 and bias -2.557. Only three forecasts projected 8–9 runs, with bias +3.487. No game projected nine or more. This concentration indicates an overly compressed low-total run environment rather than balanced residual noise.

## 9. V4 Brier Score

V4 Brier score was **0.2379** over 79 games.

## 10. V4 Log Loss

V4 log loss was **0.6689**. No catastrophic near-zero/near-one miss dominated the result, but the score was worse than market.

## 11. V4 calibration

Home teams won 57.0% of games while V4's mean home probability was 50.5%. Reliability was unstable:

- 40–50% home bucket: 25 games, 44.9% forecast, 68.0% actual.
- 50–60% bucket: 28 games, 54.2% forecast, 42.9% actual.
- 60–70% bucket: 12 games, 65.8% forecast, 91.7% actual.

ECE was **0.1863**, but this estimate is highly sample-sensitive.

## 12. Market Brier Score

Point-in-time no-vig market Brier score was **0.2331**, better than V4 by 0.0048.

## 13. V4 Brier Skill Score

V4 Brier Skill Score versus market was **-0.0206**. Negative skill means V4 did not add probability accuracy over the market in this window.

## 14. Model-vs-market disagreement analysis

| Absolute disagreement | N | V4 Brier | Market Brier |
|---|---:|---:|---:|
| 0–3 pp | 17 | 0.2276 | 0.2210 |
| 3–7 pp | 14 | 0.2550 | 0.2512 |
| 7–12 pp | 22 | 0.2317 | 0.2351 |
| 12+ pp | 26 | 0.2408 | 0.2298 |

V4 only beat market in the 7–12 pp bucket, and that margin was small and underpowered. The largest disagreements underperformed market.

## 15. Extreme-edge analysis

| Research edge | N | Selected-side win rate |
|---|---:|---:|
| <2 pp | 11 | 36.4% |
| 2–5 pp | 13 | 46.2% |
| 5–10 pp | 23 | 52.2% |
| 10+ pp | 32 | 53.1% |

Larger modeled edges were directionally better, but a 53.1% win rate at an average 17.4-point edge is not commensurate with the claimed edge magnitude.

## 16. Favorite/underdog analysis

On 33 selected favorites, V4 classification accuracy was 63.6% and Brier 0.2177. On 46 selected underdogs, accuracy was 43.5% and Brier 0.2525. The challenger was materially weaker when opposing the favored side.

## 17. Home/away analysis

V4 selected home in 33 games: 63.6% accuracy, Brier 0.2213. It selected away in 46: 43.5% accuracy, Brier 0.2499. The away-selection cohort is a primary failure mode.

## 18. Data-quality validation

Data-quality scores were tightly clustered at 71.5–75, preventing a meaningful monotonic validation. The score did not span enough states to establish that higher quality produces better outcomes.

## 19. Uncertainty validation

Uncertainty values were fragmented across small buckets, mostly around 7–8.5 probability points. No reliable monotonic error relationship can be claimed. The current sample supports retaining uncertainty as descriptive metadata, not using it for fitted policy.

## 20. Lineup-confirmation analysis

All 79 games had lineup state `MISSING`. No confirmed-versus-projected lineup comparison is possible. This is a major evidence gap and prevents conclusions about lineup-sensitive public policy.

## 21. Starting-pitcher analysis

All 79 game-level starter states were `VALID`; therefore the replay cannot compare valid versus partial/missing starter cohorts. Per-pitcher reliability still varies inside contribution details, but cohort sizes are too small for stable tier conclusions.

## 22. Bullpen analysis

Seventy-five games had `VALID` bullpen state and four were `PARTIAL`. The four partial games scored better, but that tiny cell is not actionable and must not be interpreted causally.

## 23. Team-strength/double-counting audit

The replay confirms that `baseTeamStrength` is validation context only and contributes zero additional runs/probability; record, Pythagorean expectation, and run differential are not stacked on top of team scoring. Lineup overall OPS is likewise not added again. No mechanical double-counting was found in the V4 attribution contract.

## 24. Extreme-probability audit

Only seven selected-side probabilities reached 70% and five reached 75%. Results were mixed and too sparse for tail validation. No probability cap or threshold change is justified from this sample.

## 25. V3 vs V4 head-to-head

| Model | Brier | Log loss | Classification accuracy |
|---|---:|---:|---:|
| V4 raw identity | 0.2379 | 0.6689 | 51.9% |
| V3 snapshot forecast | 0.2449 | 0.6822 | 55.7% |
| No-vig market | 0.2331 | 0.6586 | 60.8% |

V4 improved proper scoring over V3 while reducing simple classification accuracy. Neither beat market.

## 26. V3 vs V4 disagreement analysis

V4's aggregate advantage over V3 is modest: 0.0070 Brier and 0.0133 log-loss improvement over 79 games. The sample is too short to identify a stable disagreement policy or claim V4 dominance.

## 27. Raw UNFITTED_IDENTITY calibration performance

The reported V4 values are the raw independent-Poisson outputs because calibration status is `UNFITTED_IDENTITY`. Raw Brier was 0.2379, log loss 0.6689, and ECE 0.1863.

## 28. Offline calibration candidate results

Platt/logistic, isotonic, and beta calibration were not fitted. A 79-game, nine-day sample cannot support chronological train/validation/test splits without severe variance and leakage risk. No candidate is recommended.

## 29. Run-distribution comparison

Negative-binomial and empirical residual distributions were not fitted because the sample is too small and overconcentrated in low projected totals. The current Poisson output is retained only as the measured baseline; the replay provides no basis to activate a replacement.

## 30. Research betting-policy analysis

The shadow policy produced 53 Neutral and 26 Buy classifications. Buy won 53.9%; Neutral's selected side won 47.2%. Closing odds and CLV were not captured, so ROI/EV conclusions are incomplete. No threshold, unit, or recommendation change is justified.

## 31. Ranked V4 failure modes

1. Total scoring underprediction (-2.327 runs/game).
2. Poor away/underdog selection performance (43.5%).
3. Negative Brier skill versus market.
4. Claimed large edges not translating to proportional win rates.
5. No confirmed-lineup cohort.
6. Narrow quality/uncertainty range and sub-100 sample.

## 32. Ranked V4 strengths

1. Strictly reproducible, immutable point-in-time replay.
2. Auditable run-first architecture and explicit feature states.
3. Better Brier and log loss than V3 in the matched sample.
4. No observed team-strength or lineup double counting.
5. Larger research-edge buckets were directionally stronger than smaller buckets.

## 33. Recommended V4.1 experiments if applicable

Offline experiments only:

1. Diagnose the low-total compression and home-run underprediction using a larger chronological ledger.
2. Add confirmed-lineup capture and compare confirmed, projected, and missing states.
3. Test whether away/underdog errors arise from starter, offense shrinkage, home field, or market disagreement.
4. After substantially more games, compare Poisson with negative-binomial and empirical residual models.
5. Only after a large held-out sample exists, compare identity, Platt, isotonic, and beta calibration.

These are research proposals, not live V4 changes.

## 34. Final challenger recommendation

**B — BUILD MLB V4.1 CHALLENGER.**

The architecture is sufficiently auditable to continue, and V4 modestly improved proper scoring over V3. However, the current implementation has evidence-supported defects—especially severe total-run underprediction—and did not beat market. V4 remains permanently shadow-only and non-deployable. V3 remains the official production model. No weights, thresholds, units, grading, publication, Free Pick, Top Pick, Play of the Day, notifications, ROI, or learning behavior were changed.