# TASK #238 — MLB V4 HISTORICAL/LIVE FEATURE-PARITY PROOF & FROZEN INPUT CONTRACT

Audit date: 2026-09-06

Environment audited: development, read-only database queries

Decision scope: MLB V4 research inputs only

## 1. Executive Summary

- **Classification:** See §41.
- **Parity proven:** NO.
- **Frozen contract created:** YES, as a versioned `BLOCKED_INCOMPLETE` audit contract. It is not challenger-ready.
- **Feature count:** 38.
- **Historical adapter:** Implemented; baseline-core only; deterministic; emits raw values and a four-field raw-semantic comparison vector, never a model vector.
- **Live adapter:** Implemented; exact `mlb-v4-model-input-v4` binding; deterministic; requires complete component provenance; never emits a model vector.
- **Real prospective materialization:** 30 snapshots / 30 games audited; 30 adapter successes; 0 full-contract-eligible vectors.
- **#237 compatibility:** `INCOMPATIBLE`.
- **Market leakage:** 0 detected.
- **Outcome leakage:** 0 detected.
- **PIT violations:** 0 detected; incomplete component provenance: 0.
- **New model trained:** NO.
- **Model promoted:** NO.
- **Production mutated:** NO.
- **Push:** NO.
- **Deploy:** NO.

The audit found deterministic semantic inconsistencies in the current live representation: offense rolling windows cross season boundaries; home/away offense splits are corrupted by a side-label casing mismatch; bullpen inputs read five artifact versions without deduplication and convert unknown numeric components to zero; and league context is not bound to the required target game, season, and window. Task #237’s fitted normalization constants and parameters are also not persisted as a consumable artifact. All vectors therefore fail closed.

## 2. Files Inspected

- Task specification: `attached_assets/Pasted-TASK-238-MLB-V4-HISTORICAL-LIVE-FEATURE-PARITY-PROOF-FR_1788737740167.txt`
- Historical feature assembly: `artifacts/api-server/src/services/mlbExpectedRuns224C.ts`
- Historical transform/model: `artifacts/api-server/src/services/mlbV4ExpectedRuns.ts`, `artifacts/api-server/src/services/mlbV4Moneyline237.ts`
- Historical offense/context chronology: `artifacts/api-server/src/services/mlbHistoricalCompletionFoundation.ts`
- Historical bullpen replay/materialization: `artifacts/api-server/src/services/mlbHistoricalPitchingReplay.ts`, `artifacts/api-server/scripts/mlb-historical-pitcher-bullpen-materialize.ts`
- Historical cohort loading: `artifacts/api-server/scripts/mlb-expected-runs-224c-data.ts`
- Live input/state construction: `artifacts/api-server/src/services/mlbV4LiveFoundation.ts`, `artifacts/api-server/src/services/mlbV4LiveRuntime.ts`
- Live/historical schemas: `lib/db/src/schema/mlb-v4-live-foundation.ts`, `lib/db/src/schema/mlb-historical-pit.ts`
- #237 research outputs: `reports/task-237-mlb-v4-authoritative-model-build.md`, `reports/mlb-v4-moneyline-237.json`
- Existing MLB V4 tests covering historical, live, starter, bullpen, expected-runs, and moneyline behavior.

## 3. Files Changed

- `artifacts/api-server/src/services/mlbV4InputContract238.ts`
- `artifacts/api-server/src/services/mlbV4InputContract238.test.ts`
- `artifacts/api-server/scripts/audit-mlb-v4-input-contract-238.ts`
- `reports/task-238-mlb-v4-historical-live-feature-parity-proof.md`

No production model, serving route, scheduler, database schema, migration, credential, Git ref, or Git history was changed.

## 4. Existing MLB V4 Input Representations

1. **Historical directed-side raw representation:** `buildDirectedSideFeatures` emits `ownOffense`, `leagueEnvironment`, and the batting side’s `opponentBullpen`, with 38 ordered scalar fields per side.
2. **#237 transformed representation:** `fitMoneylineTransform` fits TRAIN-only median imputation and population standardization separately on home and away side rows. `gameFeatures` subtracts transformed away values from transformed home values.
3. **Live nested representation:** `freezePregameFeatureSnapshot` persists `model-input-v4` with nested offense, starter, opponent-bullpen, league, home, and park objects plus component IDs/hashes, missingness, sample sizes, cutoff, and evidence tier.
4. **#237 research result:** hashes and validation output exist, but no consumable frozen model artifact or fitted normalization arrays exist.
5. **Task #238 audit representation:** the new contract freezes the 38-field order and definitions, preserves raw adapter outputs, exposes only raw-semantic comparisons, and permanently returns `modelVector: null` / `fullVectorEligible: false`.

## 5. Canonical Frozen Contract

- **Contract ID:** `mlb-v4-model-input-contract-v1`
- **Contract version:** `1`
- **Contract state:** `BLOCKED_INCOMPLETE`
- **Feature count:** `38`
- **Contract hash:** `69d627b5717fd4e9b94ee0cb4550cda800ebc507ee31ea9275700eeaae9d021c`
- **Feature-order hash:** `9f25a6e8ff04d30df51bd86c33dd84f90d8688ac7bf4995ce397ff93fb2274ff`
- **Normalization hash:** `f0941710410cd00a623cf027563b89ccf438f5b6ad16576a2805d1877821a40a`
- **Historical schema:** `mlb-v4-moneyline-237-flat-38-v1`
- **Live schema:** `mlb-v4-model-input-v4`
- **Full-vector eligibility:** denied until all 38 mappings and the exact fitted normalization are proven.

The exported TypeScript object is the machine-readable contract. The read-only audit script emits a machine-readable JSON audit.

## 6. Exact Ordered Feature List

1. `homeMinusAway.ownOffense.priorGames`
2. `homeMinusAway.ownOffense.seasonGames`
3. `homeMinusAway.ownOffense.runsPerGame5`
4. `homeMinusAway.ownOffense.runsPerGame10`
5. `homeMinusAway.ownOffense.runsPerGame20`
6. `homeMinusAway.ownOffense.runsPerGame30`
7. `homeMinusAway.ownOffense.seasonRunsPerGame`
8. `homeMinusAway.ownOffense.homeAwayRunsPerGame`
9. `homeMinusAway.leagueEnvironment.isHome`
10. `homeMinusAway.leagueEnvironment.priorGames`
11. `homeMinusAway.leagueEnvironment.runsPerTeamGame7d`
12. `homeMinusAway.leagueEnvironment.runsPerTeamGame14d`
13. `homeMinusAway.leagueEnvironment.runsPerTeamGame30d`
14. `homeMinusAway.leagueEnvironment.seasonRunsPerTeamGame`
15. `homeMinusAway.opponentBullpen.bullpenSeasonInnings`
16. `homeMinusAway.opponentBullpen.bullpenSeasonEra`
17. `homeMinusAway.opponentBullpen.bullpenSeasonWhip`
18. `homeMinusAway.opponentBullpen.bullpenSeasonKPct`
19. `homeMinusAway.opponentBullpen.bullpenSeasonBbPct`
20. `homeMinusAway.opponentBullpen.bullpenSeasonKMinusBbPct`
21. `homeMinusAway.opponentBullpen.bullpenSeasonHrRate`
22. `homeMinusAway.opponentBullpen.bullpenSeasonFip`
23. `homeMinusAway.opponentBullpen.bullpenLast3Innings`
24. `homeMinusAway.opponentBullpen.bullpenLast5Innings`
25. `homeMinusAway.opponentBullpen.bullpenLast10Era`
26. `homeMinusAway.opponentBullpen.bullpenPitchesLast1d`
27. `homeMinusAway.opponentBullpen.bullpenPitchesLast2d`
28. `homeMinusAway.opponentBullpen.bullpenPitchesLast3d`
29. `homeMinusAway.opponentBullpen.bullpenInningsLast1d`
30. `homeMinusAway.opponentBullpen.bullpenInningsLast2d`
31. `homeMinusAway.opponentBullpen.bullpenInningsLast3d`
32. `homeMinusAway.opponentBullpen.relieversUsedLast1d`
33. `homeMinusAway.opponentBullpen.relieversUsedLast2d`
34. `homeMinusAway.opponentBullpen.backToBackRelievers`
35. `homeMinusAway.opponentBullpen.threeDayRelievers`
36. `homeMinusAway.opponentBullpen.sourceGameCount`
37. `homeMinusAway.opponentBullpen.bullpenSampleSize`
38. `homeMinusAway.opponentBullpen.bullpenFeatureCompleteness`

## 7. Feature Definition Matrix

Common rules for every row: `dtype=number`; raw adapter transform is identity; required model transform is TRAIN-median imputation plus per-side population z-score, then `HOME - AWAY`; raw missing values are null; every source must be before feature cutoff.

| # | Feature | Unit | Allowed raw range | Provenance |
|---:|---|---|---|---|
| 1 | `ownOffense.priorGames` | count | ≥0 | team completion ledger |
| 2 | `ownOffense.seasonGames` | count | ≥0 | team completion ledger |
| 3 | `ownOffense.runsPerGame5` | runs/game | ≥0 | team completion ledger |
| 4 | `ownOffense.runsPerGame10` | runs/game | ≥0 | team completion ledger |
| 5 | `ownOffense.runsPerGame20` | runs/game | ≥0 | team completion ledger |
| 6 | `ownOffense.runsPerGame30` | runs/game | ≥0 | team completion ledger |
| 7 | `ownOffense.seasonRunsPerGame` | runs/game | ≥0 | team completion ledger |
| 8 | `ownOffense.homeAwayRunsPerGame` | runs/game | ≥0 | team completion ledger |
| 9 | `leagueEnvironment.isHome` | binary | 0 or 1 | side identity |
| 10 | `leagueEnvironment.priorGames` | count | ≥0 | league completion ledger |
| 11 | `leagueEnvironment.runsPerTeamGame7d` | runs/team-game | ≥0 | league completion ledger |
| 12 | `leagueEnvironment.runsPerTeamGame14d` | runs/team-game | ≥0 | league completion ledger |
| 13 | `leagueEnvironment.runsPerTeamGame30d` | runs/team-game | ≥0 | league completion ledger |
| 14 | `leagueEnvironment.seasonRunsPerTeamGame` | runs/team-game | ≥0 | league completion ledger |
| 15 | `opponentBullpen.bullpenSeasonInnings` | innings | ≥0 | bullpen boxscore replay |
| 16 | `opponentBullpen.bullpenSeasonEra` | earned runs/9 IP | ≥0 | bullpen boxscore replay |
| 17 | `opponentBullpen.bullpenSeasonWhip` | baserunners/IP | ≥0 | bullpen boxscore replay |
| 18 | `opponentBullpen.bullpenSeasonKPct` | decimal rate | 0–1 | bullpen boxscore replay |
| 19 | `opponentBullpen.bullpenSeasonBbPct` | decimal rate | 0–1 | bullpen boxscore replay |
| 20 | `opponentBullpen.bullpenSeasonKMinusBbPct` | decimal rate | -1–1 | bullpen boxscore replay |
| 21 | `opponentBullpen.bullpenSeasonHrRate` | decimal rate | 0–1 | bullpen boxscore replay |
| 22 | `opponentBullpen.bullpenSeasonFip` | FIP runs/9 | finite | bullpen boxscore replay |
| 23 | `opponentBullpen.bullpenLast3Innings` | innings | ≥0 | bullpen boxscore replay |
| 24 | `opponentBullpen.bullpenLast5Innings` | innings | ≥0 | bullpen boxscore replay |
| 25 | `opponentBullpen.bullpenLast10Era` | earned runs/9 IP | ≥0 | bullpen boxscore replay |
| 26 | `opponentBullpen.bullpenPitchesLast1d` | pitches | ≥0 | bullpen boxscore replay |
| 27 | `opponentBullpen.bullpenPitchesLast2d` | pitches | ≥0 | bullpen boxscore replay |
| 28 | `opponentBullpen.bullpenPitchesLast3d` | pitches | ≥0 | bullpen boxscore replay |
| 29 | `opponentBullpen.bullpenInningsLast1d` | innings | ≥0 | bullpen boxscore replay |
| 30 | `opponentBullpen.bullpenInningsLast2d` | innings | ≥0 | bullpen boxscore replay |
| 31 | `opponentBullpen.bullpenInningsLast3d` | innings | ≥0 | bullpen boxscore replay |
| 32 | `opponentBullpen.relieversUsedLast1d` | count | ≥0 | bullpen boxscore replay |
| 33 | `opponentBullpen.relieversUsedLast2d` | count | ≥0 | bullpen boxscore replay |
| 34 | `opponentBullpen.backToBackRelievers` | count | ≥0 | bullpen boxscore replay |
| 35 | `opponentBullpen.threeDayRelievers` | count | ≥0 | bullpen boxscore replay |
| 36 | `opponentBullpen.sourceGameCount` | count | ≥0 | bullpen boxscore replay |
| 37 | `opponentBullpen.bullpenSampleSize` | count | ≥0 | bullpen boxscore replay |
| 38 | `opponentBullpen.bullpenFeatureCompleteness` | decimal rate | 0–1 | bullpen boxscore replay |

## 8. Historical Adapter

The historical adapter:

- accepts only `mlb-v4-moneyline-237-flat-38-v1`;
- accepts only `BASELINE_CORE`, because historical pregame starter identity coverage is zero;
- validates `evidence <= cutoff <= prediction < first pitch`;
- requires non-empty, complete component provenance;
- runs market, outcome/hindsight, and cross-sport firewalls before flattening;
- validates all 38 values against explicit raw ranges;
- emits 76 raw side values in frozen order;
- computes only the four source-proven raw-semantic home-minus-away comparisons;
- returns no normalized/model vector and always denies full-vector eligibility.

It does not refit, infer, or fabricate #237 normalization values.

## 9. Live Adapter

The live adapter:

- accepts only persisted `mlb-v4-model-input-v4` input with `pitSafe=true`;
- requires complete component-ID resolution and at least one component source timestamp;
- enforces component source times at or before cutoff and prediction strictly before first pitch;
- confirms starter objects are present for starter/enhanced tiers but never consumes starter identity;
- maps nested values into the same 38-slot raw order;
- preserves unavailable values as null;
- compares only four raw-semantic fields;
- emits deterministic vector and adapter hashes;
- never emits a model-ready vector.

## 10. Historical/Live Feature-Parity Matrix

Legend: `Sem` = raw semantics, `Unit` = unit, `Xform` = fitted transform, `PIT` = cutoff/source rule. `P` = pass, `F` = fail, `NA` = not available. Overall `PARTIAL` means raw semantics pass but the exact fitted transform is absent.

| # | Feature | Sem | Unit | Xform | PIT | Overall | Reason |
|---:|---|---|---|---|---|---|---|
| 1 | `ownOffense.priorGames` | P | P | NA | P | PARTIAL | current-season completed-game count maps |
| 2 | `ownOffense.seasonGames` | P | P | NA | P | PARTIAL | same count under #237 naming |
| 3 | `ownOffense.runsPerGame5` | F | P | NA | P | FAIL | live window crosses seasons |
| 4 | `ownOffense.runsPerGame10` | F | P | NA | P | FAIL | live window crosses seasons |
| 5 | `ownOffense.runsPerGame20` | F | P | NA | P | FAIL | live window crosses seasons |
| 6 | `ownOffense.runsPerGame30` | F | P | NA | P | FAIL | live window crosses seasons |
| 7 | `ownOffense.seasonRunsPerGame` | P | P | NA | P | PARTIAL | current-season completed games map |
| 8 | `ownOffense.homeAwayRunsPerGame` | F | P | NA | P | FAIL | lowercase/uppercase side defect |
| 9 | `leagueEnvironment.isHome` | P | P | NA | P | PARTIAL | deterministically derived from side |
| 10 | `leagueEnvironment.priorGames` | NA | NA | NA | NA | NOT_AVAILABLE | sample count not preserved |
| 11 | `leagueEnvironment.runsPerTeamGame7d` | NA | NA | NA | NA | NOT_AVAILABLE | named 7-day window not preserved |
| 12 | `leagueEnvironment.runsPerTeamGame14d` | NA | NA | NA | NA | NOT_AVAILABLE | named 14-day window not preserved |
| 13 | `leagueEnvironment.runsPerTeamGame30d` | NA | NA | NA | NA | NOT_AVAILABLE | named 30-day window not preserved |
| 14 | `leagueEnvironment.seasonRunsPerTeamGame` | F | P | NA | P | FAIL | latest row is not bound to season/window/target |
| 15 | `opponentBullpen.bullpenSeasonInnings` | NA | NA | NA | NA | NOT_AVAILABLE | no exact live field |
| 16 | `opponentBullpen.bullpenSeasonEra` | NA | NA | NA | NA | NOT_AVAILABLE | no exact live field |
| 17 | `opponentBullpen.bullpenSeasonWhip` | NA | NA | NA | NA | NOT_AVAILABLE | no exact live field |
| 18 | `opponentBullpen.bullpenSeasonKPct` | NA | NA | NA | NA | NOT_AVAILABLE | no exact live field |
| 19 | `opponentBullpen.bullpenSeasonBbPct` | NA | NA | NA | NA | NOT_AVAILABLE | no exact live field |
| 20 | `opponentBullpen.bullpenSeasonKMinusBbPct` | NA | NA | NA | NA | NOT_AVAILABLE | no exact live field |
| 21 | `opponentBullpen.bullpenSeasonHrRate` | NA | NA | NA | NA | NOT_AVAILABLE | no exact live field |
| 22 | `opponentBullpen.bullpenSeasonFip` | NA | NA | NA | NA | NOT_AVAILABLE | no exact live field |
| 23 | `opponentBullpen.bullpenLast3Innings` | NA | NA | NA | NA | NOT_AVAILABLE | live has no 3-game window |
| 24 | `opponentBullpen.bullpenLast5Innings` | F | P | NA | P | FAIL | multi-version duplication and null-to-zero |
| 25 | `opponentBullpen.bullpenLast10Era` | F | P | NA | P | FAIL | multi-version duplication and null-to-zero |
| 26 | `opponentBullpen.bullpenPitchesLast1d` | F | P | NA | P | FAIL | multi-version duplication and null-to-zero |
| 27 | `opponentBullpen.bullpenPitchesLast2d` | NA | NA | NA | NA | NOT_AVAILABLE | live has no 2-day window |
| 28 | `opponentBullpen.bullpenPitchesLast3d` | F | P | NA | P | FAIL | multi-version duplication and null-to-zero |
| 29 | `opponentBullpen.bullpenInningsLast1d` | F | P | NA | P | FAIL | multi-version duplication and null-to-zero |
| 30 | `opponentBullpen.bullpenInningsLast2d` | NA | NA | NA | NA | NOT_AVAILABLE | live has no 2-day window |
| 31 | `opponentBullpen.bullpenInningsLast3d` | F | P | NA | P | FAIL | multi-version duplication and null-to-zero |
| 32 | `opponentBullpen.relieversUsedLast1d` | F | P | NA | P | FAIL | multi-version duplication and null-to-zero |
| 33 | `opponentBullpen.relieversUsedLast2d` | NA | NA | NA | NA | NOT_AVAILABLE | live has no 2-day window |
| 34 | `opponentBullpen.backToBackRelievers` | NA | NA | NA | NA | NOT_AVAILABLE | no exact live field |
| 35 | `opponentBullpen.threeDayRelievers` | NA | NA | NA | NA | NOT_AVAILABLE | no exact consecutive-date field |
| 36 | `opponentBullpen.sourceGameCount` | NA | NA | NA | NA | NOT_AVAILABLE | no role-bound exact live field |
| 37 | `opponentBullpen.bullpenSampleSize` | NA | NA | NA | NA | NOT_AVAILABLE | historical season sample not preserved |
| 38 | `opponentBullpen.bullpenFeatureCompleteness` | NA | NA | NA | NA | NOT_AVAILABLE | exact historical completeness scalar absent |

**Overall counts:** PASS 0; PARTIAL 4; FAIL 13; NOT_AVAILABLE 21; PROSPECTIVE_ONLY 0.

## 11. Unit Parity

All 17 live paths/derived values use the same dimensional unit as their historical analog. The remaining 21 features have no exact live path and therefore no unit-parity claim. Unit equality does not rescue a semantic mismatch: the 13 failed fields retain matching dimensions but different population/window/missingness semantics.

## 12. Orientation Parity

The frozen direction is always transformed home minus transformed away. Historical directed-side assembly correctly attaches the opponent’s bullpen to each batting side. The live snapshot builder also explicitly assigns away bullpen to home offense and home bullpen to away offense. Asymmetric fixtures verify sign changes. `isHome` is derived as home `1`, away `0`, so its raw difference is always `+1`.

## 13. Missingness Parity

- Historical #237 permits raw nulls and replaces them with TRAIN-fitted medians before standardization.
- The exact TRAIN medians are unavailable, so Task #238 performs no imputation.
- The live bullpen aggregate uses `Number(value ?? 0)`, while historical replay returns null if any contributing source value is unknown. This is a semantic failure, not a permissible imputation.
- Every audited live snapshot had 22 raw missing comparison fields: the 21 structurally unavailable fields plus the corrupted `homeAwayRunsPerGame`.
- No incomplete vector is eligible; no silent zero/default/model fallback exists in the Task #238 adapter.

## 14. Transform Parity

#237’s model input is not the raw difference. Each side is independently:

1. flattened in frozen order;
2. null-imputed with TRAIN medians;
3. centered by TRAIN means;
4. divided by TRAIN population standard deviations;
5. subtracted as standardized home minus standardized away.

Task #238’s adapters deliberately expose raw values and a labeled raw-semantic comparison vector. They return `modelVector: null`. Transform parity is unavailable for all 38 features because the fitted arrays were not persisted.

## 15. Normalization Constants

- Expected #237 transform hash: `3677ed49c9e711ea5cde8796e0b4700007c0bf3769b197d2814200b9fa11d6f1`
- Task #238 normalization descriptor hash: `f0941710410cd00a623cf027563b89ccf438f5b6ad16576a2805d1877821a40a`
- Persisted medians: unavailable
- Persisted means: unavailable
- Persisted standard deviations: unavailable
- Persisted coefficients/intercept: unavailable as a consumable frozen artifact

The development `mlb_historical_model_artifacts` query returned no row for `tbm-mlb-moneyline-v4-research-237`. No refit or reconstruction was attempted.

## 16. Starter Evidence Semantics

The 38-feature #237 representation contains zero starter features. Historical replay reports pregame starter identity coverage of zero; actual starters observed after games are hindsight and are rejected. Live starter-core snapshots may contain pregame starter feature objects, but Task #238 only verifies their tier presence and does not consume identity or starter values into the 38-field contract. Keys such as `actualStarter` and `actualLineup` fail the outcome/hindsight firewall.

## 17. Baseline-Core vs Starter-Core

- Historical 38-field #237 data is baseline/offense-plus-bullpen only.
- Historical starter-core: 0.
- Historical enhanced: 0.
- All 30 current live v4 snapshots are labeled starter-core and also satisfy their persisted baseline-core flag.
- Starter availability does not fill any missing #237 field and does not make the historical candidate compatible.
- The historical adapter rejects starter/enhanced tiers to prevent hindsight or tier conflation.

## 18. Offense State

Raw semantic parity is proven only for `priorGames`, `seasonGames`, and `seasonRunsPerGame`. The four rolling fields fail because historical windows reset by target season while live v4 windows are sliced from all prior rows and can cross season boundaries. `homeAwayRunsPerGame` fails because `mlbV4LiveRuntime` compares stored lowercase side values against uppercase `"HOME"`; all 30 audited v4 snapshots had zero home games in the home team’s home split and a nonzero away split.

## 19. Bullpen State

Historical replay provides season rates, 1/2/3-day workloads, last-3/5/10-game measures, consecutive-use counts, samples, and strict null propagation. Live v4 preserves only a smaller set of 1/3/7-day and 5/10/20/30-game aggregates. It lacks the season rates, 2-day windows, last-3 window, consecutive-use counts, and exact completeness/sample fields.

Additionally, the live runtime queries all five persisted historical bullpen artifact versions without a schema/artifact filter or game-level deduplication. Audited sample sizes such as 3,060 and 3,180 eligible bullpen games prove amplification; all 30 snapshots exceeded the conservative 1,000-row candidate threshold. Live aggregate sums also convert unknown values to zero. Seven name-similar bullpen fields therefore fail exact parity.

## 20. League / Home / Run Environment

`isHome` is the only raw-semantic match and is derived from side identity. The live nested contract does not preserve the historical league sample count or separately named 7/14/30-day windows. The live runtime selects the latest league row before cutoff without binding target game, target season, or required window; its single `runsPerTeamGame` value therefore cannot represent #237’s season-to-date field deterministically.

## 21. Weather / Context

#237’s 38 features contain no weather, park, venue, roof, altitude, wind, temperature, or home-context feature beyond `isHome`. Live v4 carries home and park context separately, but the Task #238 adapter excludes those fields. Adding them would change the feature schema and require a new model/version; they cannot be silently inserted into #237 compatibility.

## 22. PIT Provenance

The canonical inequality is `source evidence <= feature cutoff <= prediction time < scheduled first pitch`. Live database constraints use a stricter source-cutoff `< feature-cutoff` rule when source cutoff is non-null. Read-only audit results for exact `model-input-v4` rows:

- team-state source-cutoff violations: 0;
- starter-state source-cutoff violations: 0;
- context-state source-cutoff violations: 0;
- snapshot cutoff-at/after-first-pitch violations: 0;
- unresolved component IDs/incomplete provenance: 0.

`created_at` is ingestion time, not prediction time. All 30 audited snapshots lack a separately persisted forecast/prediction timestamp, so the audit uses feature cutoff as the adapter decision time and reports the absence honestly. No post-start timestamp was invented.

## 23. Market Leakage Firewall

The contract recursively rejects moneyline, runline, spread, total, odds, sportsbook, market, price, implied probability, vig, CLV, line movement, edge, units, opening/closing line, consensus, and Pinnacle keys. Tests cover odds, totals, and opening lines. SQL inspection of exact v4 feature JSON found 0 market-key candidates. No market value entered an adapter vector.

## 24. Outcome Leakage Firewall

The contract rejects actual starter/lineup, actual runs, final score, winner/result, graded pick, postgame ERA/bullpen outcome, runs allowed, earned runs, and target keys. Tests cover final score, actual starter, and actual lineup. SQL inspection found 0 outcome-key candidates. The live input snapshot table is separate from outcome/evaluation tables.

## 25. Cross-Sport Isolation

Keys prefixed with NFL, NCAAF, NBA, WNBA, NHL, Soccer, or UFC are rejected recursively. The 38-field allowlist is MLB-specific and the adapter imports no other-sport feature definitions. Cross-sport firewall tests pass. No non-MLB code or data was changed.

## 26. Historical Coverage

Read-only development counts using exact chronology v3 and pitcher/bullpen v5:

- foundation games: 9,393;
- **total chronology-safe:** 9,390;
- **baseline-core eligible:** 9,073;
- **starter-core eligible:** 0;
- **enhanced eligible:** 0;
- **chronology-safe but ineligible:** 317;
- quarantined chronology failures: 3;
- **total ineligible including quarantine:** 320.

The consumed 2,012-game locked cohort remains `HISTORICAL_BENCHMARK_ONLY`. It was not queried for model/feature/hyperparameter/calibration/promotion selection and was not used to decide how to repair any mapping.

## 27. Prospective Development Coverage

Exact `mlb-v4-model-input-v4` read-only audit:

- **games:** 30;
- **snapshots:** 30;
- **baseline-core:** 30;
- **starter-core:** 30;
- **enhanced:** 0;
- **adapter successes:** 30;
- **full-contract valid:** 0;
- **invalid canonical vectors:** 30;
- **raw missing fields per snapshot:** 22;
- **source-cutoff violations:** 0;
- **incomplete component provenance:** 0;
- **market/outcome/cross-sport leakage violations:** 0;
- **without persisted prediction timestamp:** 30;
- **home-split casing defect:** 30;
- **bullpen multi-version amplification candidate:** 30.

## 28. Determinism

- Contract hash: `69d627b5717fd4e9b94ee0cb4550cda800ebc507ee31ea9275700eeaae9d021c`
- Feature-order hash: `9f25a6e8ff04d30df51bd86c33dd84f90d8688ac7bf4995ce397ff93fb2274ff`
- Normalization descriptor hash: `f0941710410cd00a623cf027563b89ccf438f5b6ad16576a2805d1877821a40a`
- Historical adapter protocol hash: `bd8987dd142298b90095d72b787b6a6b7a1e6f8f707b1af5beac820abda039e5`
- Live adapter protocol hash: `7da188b8dc87f9b295698d6971bb6d850957bae3226b7f64d20de57087bdd345`
- Prospective canonical comparison-vector set hash: `bcb3d3b2a181a1d9748bd4bec73b95c512e5b92b22c978dd3ecd33e70ff8833c`
- Prospective same-input replay matches: 30/30.
- Exact v4 semantic keys with different artifact hashes: 0.

The controlled historical/live fixture produces identical comparison vectors and vector hashes only for the four raw-semantic fields. Historical and live adapter hashes remain distinct by design.

## 29. #237 Research Candidate Compatibility

**INCOMPATIBLE**

Reasons:

1. complete transformed parity is proven for 0/38 fields;
2. only four raw fields have source-proven semantic parity;
3. 13 live analogs have known semantic mismatches;
4. 21 required fields have no exact live representation;
5. the fitted TRAIN normalization constants are unavailable;
6. no consumable #237 model artifact exists;
7. the research candidate is explicitly unfrozen and nondeployable.

The candidate’s coefficients, intercept, transform hash, validation selection, and research identity were not modified.

## 30. Expected-Score Output Contract

Expected-score models must return separate finite nonnegative `homeExpectedRuns` and `awayExpectedRuns`. Values remain exact model outputs; the contract does not round, coerce, or derive one side from the other. This output contract does not authorize a model to run when its input contract is incomplete.

## 31. Probability Output Contract

Moneyline models must return finite probabilities in `[0,1]` and enforce `homeWinProbability + awayWinProbability = 1` within `1e-12`. The two probabilities are explicit values, not odds-derived inputs. The contract rejects non-complementary output.

## 32. Versioning Rules

- Feature order, definitions, mappings, units, ranges, transform descriptor, missingness, provenance, or output semantics require a new contract version and hash.
- A repaired live representation must use a new input schema version; persisted `model-input-v4` rows remain immutable evidence of their original semantics.
- Normalization constants, coefficients, and intercept must be bound to one exact model artifact and hashes.
- Silent mutation of an existing contract/model/schema version is prohibited.
- Historical and live adapter protocol hashes are version-bound independently.

## 33. Future Model Artifact Requirements

A future challenger artifact must persist:

- exact ordered feature schema and hash;
- exact raw-to-model mapping version;
- per-feature TRAIN medians, means, and population standard deviations;
- coefficients and intercept;
- family/hyperparameters;
- training and validation cohort identities/hashes;
- source foundation and PIT rules;
- missingness policy;
- output semantics;
- artifact, parameter, transform, and model hashes;
- immutable benchmark quarantine;
- approval/maturity/publication state.

No challenger may execute until its exact input contract is fully eligible.

## 34. Schema Changes

No database schema changes were made. Task #238 adds a code-level contract, tests, a read-only audit script, and this report. The audit identified future live-schema/version needs but did not implement or push them.

## 35. Future Production Migration Required

**NO** for Task #238.

A future repaired live input version may require a development migration or new columns, but that decision belongs to the repair task. **DO NOT EXECUTE** any production migration from this report.

## 36. Tests

Final commands and results:

- `pnpm --filter @workspace/api-server exec vitest run src/services/mlbV4InputContract238.test.ts`

  Result: 1 file passed, 17 tests passed.
- `pnpm --filter @workspace/api-server exec vitest run src/services/mlbV4InputContract238.test.ts src/services/mlbV4LiveFoundation.test.ts src/services/mlbV4ExpectedRuns.test.ts src/services/mlbV4Moneyline237.test.ts src/services/mlbExpectedRuns224C.test.ts src/services/mlbHistoricalPitchingReplay.test.ts src/services/mlbHistoricalPitchingOutcomes.test.ts src/services/mlbStarterEvidence224C.test.ts src/services/mlbStarterEvidence224C1B.test.ts`

  Result: 9 files passed, 81 tests passed.
- `pnpm --filter @workspace/api-server test`

  Result: 94 files passed, 614 tests passed.
- `pnpm --filter @workspace/api-server run typecheck`

  Result: passed.
- `pnpm run typecheck:libs`

  Result: passed.
- `pnpm --filter @workspace/api-server run build`

  Result: passed.
- `pnpm run security:signing-credentials`

  Result: passed; no signing credential artifacts or local key configuration found.
- `git diff --check`

  Result: passed.
- `pnpm --filter @workspace/api-server exec tsx scripts/audit-mlb-v4-input-contract-238.ts`

  Result: 30/30 snapshot adaptations and deterministic replays; 0 full-vector eligible.

## 37. Regression Results

The complete API service suite passed: 614/614 tests across 94 files. Focused historical replay, historical outcomes, starter evidence, expected-runs, moneyline #237, live foundation, and Task #238 tests all passed. API and shared-library TypeScript checks passed. API build passed. No unrelated failures remain; the database package has no standalone `typecheck` script, so its project references were checked through `pnpm run typecheck:libs`.

## 38. Forecast Immutability

No persisted feature snapshot, prediction, forecast, outcome, evaluation, registry row, or research result was updated or deleted. No forecast was regenerated. Existing `model-input-v4` defects are reported in place rather than rewritten. The audit is read-only. The 2,012-game benchmark remains consumed and quarantined from all selection work.

## 39. Production Safety Verification

- MLB V1 unchanged.
- Other sports unchanged.
- No training, retuning, calibration, promotion, publication, push, deploy, or production migration.
- No production database mutation.
- No credential access or modification.
- No Git history/ref modification.
- Known contaminated commit/ref blocker remains untouched.
- Contract is not imported by a production serving path.
- Full-vector eligibility is hardcoded fail-closed until a future version proves all requirements.
- Independent architect/model-science review agreed the result is a report-only go and challenger/live-execution no-go; its one hardening finding (incomplete component provenance) was corrected and reverified.

## 40. Remaining Blockers

1. Repair offense rolling windows to reset by target season in a new live schema version.
2. Repair and test lowercase/uppercase team-side handling.
3. Bind bullpen reads to one exact artifact version, deduplicate by canonical game/team, and preserve historical null semantics.
4. Materialize exact season rates, 2-day windows, last-3 window, consecutive-reliever counts, samples, and completeness.
5. Bind league context by target game, season, and named window.
6. Persist a real prediction/forecast decision timestamp where a model actually runs.
7. Produce a legitimate frozen model artifact with exact normalization arrays and parameters without using the consumed benchmark for selection.
8. Re-run prospective capture under a new version; old v4 snapshots must remain immutable and ineligible.
9. Resolve the separate release-security Git-ref blocker before any future release operation.

## 41. Final Classification

**D — UNSAFE: PIT / MARKET / OUTCOME LEAKAGE OR SEMANTIC INCONSISTENCY DETECTED**

The triggering condition is semantic inconsistency, not PIT, market, or outcome leakage. The current live source cannot represent or safely execute the historical #237 candidate.

## 42. Exactly One Recommended Next Task

**Complete the existing “Confirm live MLB evidence is complete enough before building the next model” task as a versioned semantic-repair task.**

It should create a new immutable live input version that fixes season-bounded offense windows, side-label handling, single-version/deduplicated bullpen sourcing with null propagation, exact league windows, and the missing bullpen fields; capture a fresh prospective cohort; and prove 38/38 raw semantics before any separate model-artifact work. It must preserve old snapshots, keep the consumed benchmark quarantined, and perform no training, promotion, publication, deployment, or production migration.