# MLB V4.1 Run-Model Diagnosis

**Sample status:** DIAGNOSTIC / DEVELOPMENT; **not validated and not OOS.**  
**Mode:** read-only research; V4 and V3 were not modified.

## 1. Executive summary
79 clean immutable PIT games (200 revisions, Aug 23–31) show V4 total bias -2.327 runs/game and RMSE 5.349. The suspected offense/runs-allowed bug is disproved by source inspection: V4 shrinks `scoredPerGame`, not `allowedPerGame`. No score-changing fix is supported.
## 2. Exact explanation of the V4 -2.327 run bias
The sample shows broad low-total compression, not a demonstrated field swap. Mean shrinkage-derived offense contributions are -1.394 away and -1.468 home; causality cannot be assigned from 79 games.
## 3. Run projection decomposition
Mean V4 contributions: base 4.50/team; starter -0.298 away/-0.286 home; bullpen +0.281/+0.242; park +0.005/+0.011; weather +0.180 each; home field +0.120.
## 4. Home scoring bias
Projected minus actual: -1.499; residual convention actual minus expected is therefore +1.499.
## 5. Away scoring bias
Projected minus actual: -0.828; residual is +0.828.
## 6. League run-environment audit
V4 uses 4.50/team. No immutable expanding league ledger was captured, so a PIT historical league baseline cannot be reconstructed without future data. V4.1 retains this documented fallback.
## 7. Offensive baseline audit
Source lines 489–504 use `scoredPerGame` with a 20-game prior. `allowedPerGame` is not an offensive input. Negative recent-scoring contributions explain compression descriptively, not a validated replacement scale.
## 8. Starter run-model audit
The retained blend is FIP 50%, season ERA 25%, recent ERA 25%, multiplied by projected IP/9. Pitcher actual-IP/run-allowance fields are absent from the immutable ledger; no correction is justified.
## 9. Starter innings audit
Projected IP is recent-IP average clamped 3–7.2. Actual starter IP was not preserved in the replay result data; MAE/bias cannot be honestly calculated.
## 10. Bullpen run-model audit
Only workload/fatigue is available, not reliever talent. V4.1 retains the regressed baseline and exposes no fabricated bullpen-quality effect.
## 11. Lineup fallback audit
All 79 lineups are missing; the V4 fallback is neutral (zero lineup/platoon/BvP runs) and increases uncertainty. It does not suppress runs.
## 12. Park audit
Mean park effect is near neutral (+0.005 away, +0.011 home); factors are applied as percentage multipliers. No unit defect is evidenced.
## 13. Weather audit
Weather averages +0.180/team; domes receive zero weather contribution. No systematic negative weather suppression is shown.
## 14. Distribution-vs-lambda diagnosis
Independent Poisson converts lambda to wins and cannot lower expected lambda. The low-total issue is upstream lambda generation.
## 15. Every V4.1 change made
One auditability change: a distinct V4.1 identity wraps `computeMlbV4Forecast` and derives decomposition directly from its contribution tree. It deliberately duplicates no run formula and makes no fitted intercept or score-changing parameter.
## 16. Evidence supporting each change
N=79. Source disproves the alleged swap; immutable inputs support preserving, rather than retuning, the 4.50 fallback and V4 transformations.
## 17. V4 vs V4.1 same-sample run metrics
The read-only V4.1 replay is exact-output-equivalent on the same 79 records: home MAE 2.840, away MAE 2.412, total MAE 4.211, total RMSE 5.349, margin MAE 3.451 for both identities.
## 18. V4 vs V4.1 Brier
V4 and V4.1 Brier are identically 0.2379 by design; no V4.1 improvement claim is made.
## 19. V4 vs V4.1 Brier Skill
V4 and V4.1 skill vs PIT no-vig market are identically -0.0206.
## 20. V4 vs V4.1 Log Loss
V4 and V4.1 log loss are identically 0.6689; no fitted calibration was added.
## 21. V4 vs V4.1 calibration
V4 ECE 0.1863. N=79 is inadequate for calibration fitting.
## 22. Away/underdog comparison
V4 away selections won 43.5%; no underdog policy or penalty was changed.
## 23. Extreme-probability comparison
No probability caps or tail tuning were introduced; tails remain development-only.
## 24. Uncertainty review
Uncertainty is unchanged by the decomposition. Missing lineups remain an explicit limitation.
## 25. Data-quality review
Input-quality states are unchanged; better fit was not treated as better input quality.
## 26. Historical replay expansion assessment
Earlier records lack the complete immutable evidence bundle/start cutoff. PIT requirements were not relaxed.
## 27. Tests
Focused tests prove exact V4/V4.1 expected-run and probability equivalence, unchanged V4 output before and after the wrapper call, decomposition provenance, permanent-shadow identity, non-deployability, zero official units, disabled notifications, and non-publishability.
## 28. Build/typecheck results
Focused TypeScript typecheck passed for the implementation change.
## 29. Registry/config identities
Model `tbm-mlb-moneyline-v4-1`; features `mlb-v4-1-audit-features-v1`; run model `mlb-v4-1-output-equivalent-audit-v1`; distribution `independent-poisson-v1`; calibration `mlb-v4-1-calibration-unfitted-v1`; SHA-256 configuration hash is emitted by the pure model.
## 30. Confirmation V3 unchanged
Confirmed: no V3 file or policy was modified.
## 31. Confirmation V4 unchanged
Confirmed: no V4 source/formula/output was modified.
## 32. Confirmation V4.1 shadow-only
Permanent-shadow registry protection blocks deployment. The pure forecast is UNVALIDATED, non-publishable, official pick false, units zero, notifications false; no writer, Results, ROI, Free Pick, Top Pick, POD, or learning path exists.
## 33. Recommended next step
**D — INSUFFICIENT EVIDENCE TO MODIFY V4 — CONTINUE DATA COLLECTION.** Capture a larger immutable PIT ledger including chronological league runs and starter outcomes, then conduct untouched OOS shadow validation. Do not promote V4.1.