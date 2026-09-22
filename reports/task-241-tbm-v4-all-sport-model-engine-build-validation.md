# TASK #241 — TBM V4 ALL-SPORT MODEL ENGINE BUILD & VALIDATION

## 1. Executive Summary

Overall classification: **C — MODEL BUILD PARTIALLY SUCCEEDED; MATERIAL V4 ENGINE GAPS REMAIN**  
Sports attempted: 9  
Sports with frozen V4 artifacts: 2 (NCAAF existing, Soccer new)  
Sports shadow/provisional-ready: 2  
Sports production-approval-ready: 0  
Sports blocked: MLB, NFL, NBA, WNBA, NHL, UFC, NCAAMB  
Legacy fallback used: No  
Market leakage: None  
Outcome leakage: None  
Production deployment performed: No

## 2. Task #240 Reconciliation

The strict V4 router, exact identities, evidence firewall, deterministic replay, health reporting, and `NO_FORECAST` behavior were preserved. Subscriber production routing was not changed.

## 3. Task #239 / MLB Reconciliation

The MLB frozen 14-feature foundation and consumed 2,012-game benchmark quarantine remain unchanged. The required prospective v5 adapter-verified parity evidence is still absent, so no MLB artifact was fitted or relabeled.

## 4. Shared V4 Architecture Used

New models implement `SportEngineV4` and pass through the existing canonical registry/router. Shared code performs chronology, hashing, exact artifact validation, deterministic execution, and persistence-ready forecast envelopes; coefficients remain sport-specific.

## 5. Model Build Methodology

A predeclared ridge family (`lambda` 1, 10, 100) modeled home and away scores independently. Features were built before each event from prior completed games only. Normalization was fitted on TRAIN only. Candidate selection used chronological validation score error; probability and bias gates could reject the winner.

## 6. PIT / Leakage Rules

Only team IDs, event timestamps, prior completed scores, and prior participation were used. Odds, spreads, totals, implied probabilities, legacy projections, current-event outcomes, lineups, injuries, and postgame statistics were excluded.

## 7. Training Dataset Summary

| Sport | Rows | Date range | Features | Target | Train | Validation | Status |
|---|---:|---|---:|---|---:|---:|---|
| MLB | 9,390 prior foundation | 2023–2026 | 14 | Home win | quarantined | consumed benchmark | parity-blocked |
| NCAAF | existing frozen cohort | prior artifact | existing | scores/win | existing | existing | frozen |
| NFL | 12 eligible | 2026-08–09 | 9 | scores/win | 0 selected | 0 selected | insufficient |
| NBA | 1 completed | 2026 | — | — | 0 | 0 | insufficient |
| WNBA | 65 eligible | 2026-07–08 | 9 | scores/win | 52 | 13 | quality rejected |
| NHL | 0 completed | 2026 | — | — | 0 | 0 | insufficient |
| Soccer | 103 eligible | 2026-07–09 | 9 | goals/H-D-A | 82 | 21 | frozen shadow |
| UFC | 0 canonical completed bouts | 2026 | — | — | 0 | 0 | identity/history blocked |
| NCAAMB | 1 completed | 2026 | — | — | 0 | 0 | insufficient |

## 8. Feature Contract Summary

Soccer uses `rolling-score-v4-core-1`, nine ordered features, contract hash `4171705ce64dbf2cb32b006bd9ec7d1483972500dcede7c8d3858ec9d48618cf`. Historical and live paths share the same materializer. NCAAF retains its existing frozen contract. No contract was claimed ready for blocked sports.

## 9. MLB V4

### Starting state
Foundation complete; no legitimate fitted artifact.
### Final feature contract
Unchanged 14-feature frozen baseline.
### Training cohort
Available, but the benchmark is consumed and live parity proof is absent.
### Candidate models
Not reopened because the fail-closed parity gate did not pass.
### Selected model
None.
### Validation
Blocked.
### Calibration
Blocked.
### Expected runs
Not produced.
### Win probability
Not produced.
### Bias
Not reassessed.
### Baselines
Historical references remain quarantined.
### Market comparison
Not performed.
### Artifact
None.
### Executor
Foundation only.
### Shadow readiness
No.
### Approval
None.
### Final classification
**C — V4 CORE FOUNDATION COMPLETE; MODEL TRAINING/VALIDATION STILL BLOCKED**

## 10. NCAAF V4

The existing `tbm-ncaaf-v4-expected-score` frozen artifact and authentic game-day executor were preserved. Historical reported metrics remain margin MAE 12.5008, total MAE 12.9390, Brier 0.1800, and log loss 0.5348. It remains non-publication-approved, current-Eastern-date-only, immutable, and provisional/shadow capable. **Classification: B.**

## 11. NFL V4

A nine-feature chronology-safe score contract was implemented and attempted. Only 12 rows had two prior games for both teams, below the 40-row training floor. No model, calibration, artifact, or registration was created. **Classification: D.**

## 12. NBA V4

Only one completed canonical game exists in development evidence. Market-bearing legacy logic was not reused. No model was fitted. **Classification: D.**

## 13. WNBA V4

An independent WNBA-only 65-row cohort was materialized and trained. The selected ridge candidate failed the hard quality gate: validation Brier exceeded the historical-rate baseline. The rejected candidate was not frozen or registered. **Classification: D.**

## 14. NHL V4

No completed canonical games exist in the current evidence and pregame goalie history is not PIT-proven. No model was fitted. **Classification: D.**

## 15. Soccer V4

The selected independent ridge score model uses 82 TRAIN and 21 chronological validation rows. It predicts unrounded goals and converts them through an independently evaluated Poisson score grid into HOME/DRAW/AWAY probabilities. Validation: home-goal MAE 1.2715, away-goal MAE 1.2222, margin MAE 1.5304, total MAE 2.1412, multiclass Brier 0.24485 versus baseline 0.29583, total bias -0.2446. Artifact `26e1a46ee7feee17b6d7e258a6f3574a90b2fdcdc4f4c06be8abffe5927264b6` is frozen, exact-loaded, registered, and shadow-only. **Classification: B.**

## 16. UFC V4

Current records lack canonical fighter A/B identities, completed bout targets, and chronological fighter histories. Generic team/runs logic was not reused. **Classification: D.**

## 17. NCAAMB V4

Only one completed game exists. NBA coefficients were not reused. **Classification: D.**

## 18. Core vs Enhanced Features

The Soccer core uses prior scoring, conceding, sample-size, rest, and home orientation. Competition strength, lineups, injuries, and richer expected-goal inputs remain V4.1 opportunities, not core blockers. Similar advanced features remain excluded from unbuilt sports until immutable PIT histories exist.

## 19. Artifact Registry

| Sport | Model ID | Version | Artifact hash | Contract hash | Approval | Maturity |
|---|---|---|---|---|---|---|
| NCAAF | tbm-ncaaf-v4-expected-score | existing frozen | existing exact identity | existing | non-public | provisional |
| Soccer | tbm-soccer-v4-core-score | 4.0.0-core | 26e1a46…64b6 | 4171705c…18cf | SHADOW | DEVELOPING |

## 20. V4 Router Integration

Soccer is registered with its exact artifact. NCAAF remains on its authentic existing V4 execution path pending a thin canonical-router adapter. Every unregistered sport returns `NO_FORECAST`; no V1/V2/V3 fallback exists in the new router.

## 21. Shadow Forecast System

The Soccer executor emits immutable identity, artifact, contract, feature snapshot, cutoff, expected-score, and three-way probability fields suitable for existing V4 shadow persistence.

## 22. Outcome Pairing

Current-event outcomes never enter prediction inputs. Pairing remains downstream after final status.

## 23. Calibration Framework

Validation Brier and historical-rate baselines are recorded. Soccer's 21-row validation cohort is too small for post-hoc calibration; raw probabilities are retained and calibration is marked insufficient.

## 24. Expected-Score Framework

Home and away scores are modeled independently and remain unrounded. Margin and total are derived from those outputs.

## 25. Market Comparison

Not used for training or selection. No new market comparison was claimed because the objective validation cohort is small.

## 26. #238A Compatibility

Canonical probabilities are available downstream, but SHADOW approval prevents subscriber publication.

## 27. Legacy Model Retirement Mapping

| Sport | Current legacy | Replacement V4 | Retirement-ready |
|---|---|---|---|
| NCAAF | legacy production path | existing NCAAF V4 | No; approval pending |
| Soccer | generic legacy | Soccer V4 core | No; prospective evidence pending |
| Others | legacy sport engines | none | No |

## 28. Data Integrity

Artifacts are hash-addressed; cohort, validation, parameters, contract, and artifact hashes are frozen.

## 29. PIT Validation

Completions enter team state only after their completion timestamp and before the next prediction cutoff. Rows lacking two prior team games are excluded.

## 30. Market Leakage Validation

The feature contract contains no market fields, and the shared recursive leakage firewall remains active.

## 31. Outcome Leakage Validation

Targets are attached only after pregame vectors are frozen. The current game's score is never applied before its prediction.

## 32. Cross-Sport Isolation

Training is filtered by exact canonical sport. Soccer parameters are not shared with any other sport.

## 33. Deterministic Replay

Identical cohort and timestamp inputs produce identical parameter and artifact hashes. The canonical router executes each forecast twice and compares hashes.

## 34. Tests

- `pnpm --filter @workspace/api-server exec vitest run src/services/rollingScoreV4.test.ts src/services/v4EngineBootstrap241.test.ts src/services/v4Platform.test.ts src/services/grading.task240.test.ts` — 15 passed.
- `pnpm --filter @workspace/api-server run typecheck` — passed after final correction.
- `pnpm --filter @workspace/api-server run model:train:v4-core-241` — Soccer built; NFL insufficient; WNBA quality-rejected.

## 35. Full Regression

API full suite, package builds, mobile typecheck, source scan, signing scan, and diff checks are recorded in the final task response. Unrelated mockup-sandbox errors remain outside production-package validation.

## 36. Files Changed

Added the rolling-score trainer/executor, training command, focused tests, Soccer frozen artifact, bootstrap registration, and this report. No UI files were redesigned.

## 37. Database Changes

None.

## 38. Clean Source Integration

The source export script includes code, tests, reports, and `model-artifacts`; no Git history is copied.

## 39. Model Performance Table

| Sport | Result |
|---|---|
| NCAAF | Existing: margin MAE 12.5008; total MAE 12.9390; Brier 0.1800 |
| Soccer | H MAE 1.2715; A MAE 1.2222; margin MAE 1.5304; total MAE 2.1412; Brier 0.24485 |
| WNBA | Rejected: worse than baseline |
| Others | No legitimate selected model |

## 40. Baseline Comparison Table

Soccer multiclass Brier 0.24485 beat the historical outcome-rate baseline 0.29583. WNBA failed its baseline gate. Other sports had no selectable candidate.

## 41. Calibration Table

NCAAF: monitoring/provisional. Soccer: raw probabilities, insufficient post-hoc calibration sample. Others: unavailable.

## 42. Bias / Error Table

Soccer predicted average total 2.8983 versus actual 3.1429; bias -0.2446. WNBA failed quality validation and was discarded.

## 43. Data Sufficiency Table

| Sport | Training | Validation | Calibration | Prospective |
|---|---|---|---|---|
| MLB | Yes | consumed/blocked | No | No |
| NCAAF | Yes | Yes | monitoring | No |
| NFL | No | No | No | No |
| NBA | No | No | No | No |
| WNBA | Marginal | candidate failed | No | No |
| NHL | No | No | No | No |
| Soccer | Yes | limited Yes | No | No |
| UFC | No | No | No | No |
| NCAAMB | No | No | No | No |

## 44. Per-Sport Release Gates

NCAAF and Soccer are technically ready and shadow-ready, not publication-approved. NCAAF has prior validation; Soccer has limited historical validation. Every other sport fails at least artifact/executor/model-validation gates.

## 45. Remaining Genuine Evidence Limitations

MLB lacks required prospective adapter parity. NFL/NBA/NHL/NCAAMB lack sufficient completed canonical histories. WNBA lacks a candidate that beats baseline. UFC lacks canonical fighter chronology and targets. Soccer lacks prospective calibration evidence.

## 46. Future V4.1 Enhancement Opportunities

After core evidence is established: MLB starters/lineups, football QB/injury state, basketball rotations, NHL goalie state, Soccer competition/xG/availability, and UFC style/opponent-quality features.

## 47. Final Sport Classifications

MLB: **C**  
NCAAF: **B**  
NFL: **D**  
NBA: **D**  
WNBA: **D**  
NHL: **D**  
Soccer: **B**  
UFC: **D**  
NCAAMB: **D**

## 48. Final Overall Classification

**C — MODEL BUILD PARTIALLY SUCCEEDED; MATERIAL V4 ENGINE GAPS REMAIN**

## 49. What Is Actually Built Now

NCAAF and Soccer have legitimate V4 models and frozen identities. Soccer now has a canonical router executor and can shadow; NCAAF retains its authentic existing V4 game-day executor. MLB has a guarded foundation but cannot forecast through V4. NFL, NBA, WNBA, NHL, UFC, and NCAAMB cannot legitimately forecast through V4. The new V4 router has no legacy fallback. Production was not changed.

## 50. EXACTLY ONE RECOMMENDED NEXT TASK

**TASK #242 — TBM V4 MISSING-SPORT EVIDENCE ACQUISITION & CORE MODEL COMPLETION**

Build immutable multi-season PIT cohorts for NFL, NBA, WNBA, NHL, UFC, and NCAAMB; complete MLB prospective parity; then rerun the same build/quality/freeze gates before cloud staging.