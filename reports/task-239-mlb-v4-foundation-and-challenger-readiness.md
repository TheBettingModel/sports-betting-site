# Task 239 — MLB V4 foundation and challenger readiness

## 1. Executive summary
The repaired development foundation is deterministic, PIT-constrained, and shadow-only. Fourteen features are retained; training remains fail-closed.

## 2. Scope
MLB V4 development infrastructure only.

## 3. Explicit exclusions
No deployment, promotion, production migration, Git/ref operation, credential change, MLB V1 change, or other-sport change occurred.

## 4. Prior-contract preservation
The Task 238 audit contract and report remain unchanged.

## 5. Live schema
The successor contract consumes `mlb-v4-model-input-v5`, not a synthetic live schema.

## 6. Contract identity
Contract: `mlb-v4-frozen-parity-baseline-v2`; version: 2.

## 7. Contract hash
`9f5f0665b55f371ed3106d81056a56ead225591b00a1d6f6b9ef67297a26aa6a`.

## 8. Ordered feature count
Fourteen home-minus-away features.

## 9. Feature-order hash
`91bde2bcad369347926daf22605d4dde574fb359a3b80087f70d4e957fb8f3e8`.

## 10. Offense feature set
`priorGames`, `seasonGames`, 5/10/20/30-game run rates, season run rate, and home/away split run rate.

## 11. League feature set
Home indicator, prior league games, 7/14/30-day league run rates, and season league run rate.

## 12. Bullpen feature set
No bullpen field enters the new vector.

## 13. Starter feature set
No starter field enters the new vector.

## 14. Weather/park feature set
No weather or park field enters the new vector.

## 15. Reassessment coverage
All 38 predecessor fields receive exactly one explicit disposition.

## 16. Parity-proven disposition
Fourteen offense and league/home-context fields are `PARITY_PROVEN`.

## 17. Historical-only disposition
Twenty-four bullpen fields are `HISTORICAL_BASELINE_ONLY`.

## 18. Bullpen exclusion reason
Historical definitions exist, but live v5 does not yet materialize the full exact 24-field historical set.

## 19. Disposition hash
`eb6f1c153f4d00aa6644353c1218cf341c58680fde69cf52283d9fb2310b1566`.

## 20. Side normalization repair
Live side labels are normalized; invalid values fail closed.

## 21. Home/away repair
The home indicator is constructed from canonical side, preventing the former lowercase/uppercase defect.

## 22. Season-bound offense repair
Rolling offense windows now remain inside the target season.

## 23. Bullpen version repair
One deterministic artifact version is selected per canonical game/team.

## 24. Bullpen conflict handling
Conflicting latest source hashes are rejected.

## 25. Bullpen null handling
Unknown bullpen components remain null; they are not converted to zero.

## 26. League PIT repair
League windows are derived from same-season games completed and recorded strictly before the target cutoff.

## 27. League deduplication
League aggregation deduplicates by canonical game deterministically.

## 28. League windows
The v5 foundation emits exact 7-day, 14-day, 30-day, and season-to-date run environments.

## 29. Immutable versioning
Old v4 snapshots remain immutable; repaired rows use v5.

## 30. Historical adapter
The historical adapter consumes raw authoritative side features, then applies the frozen 14-field allowlist.

## 31. Live adapter
The live adapter parses the nested v5 offense and league objects into the same side schema.

## 32. Historical adapter hash
`54e3b0604c2a906d4cf698cad70c4d9121be65aa54c1f62775bf273f6c901737`.

## 33. Live adapter hash
`5b1b13b6c21410ce569395a85d1ea7c89e5327b3b8d57aa02b772d915b3677fb`.

## 34. Directionality
Every feature is constructed as home minus away.

## 35. Null semantics
Missing values remain null through both adapters.

## 36. Imputation
Medians are fit from TRAIN only.

## 37. Scaling
Means and population standard deviations are fit from TRAIN only, per side, before differencing.

## 38. Leakage firewalls
Recursive key firewalls reject market, outcome, and cross-sport data.

## 39. PIT chronology
Required ordering is source evidence time ≤ cutoff ≤ prediction time < actual event-start boundary.

## 40. Delayed-start handling
Historical delayed games bind to the sealed actual first-play boundary, not the earlier scheduled timestamp.

## 41. Historical foundation size
The authoritative development foundation contains 9,393 games.

## 42. Eligible historical vectors
9,073 games materialize under the frozen contract.

## 43. Ineligible historical rows
320 foundation games remain excluded by the pre-existing eligibility boundary.

## 44. TRAIN cohort
4,700 games; hash `ced478f940a3727669a61b4c82005383f2ae69f86cccc5fee5a59b93136fb765`.

## 45. VALIDATION cohort
2,361 games; hash `91940b514f5a143d1d78b77a7e01b0e5ab384b156539d4d6c0d6f14fe3638681`.

## 46. Historical benchmark cohort
2,012 games; hash `43dd23417016358c92976efb157314a9207f5b3d91c7a4ae9ef5cdcc58a4f48c`.

## 47. Benchmark quarantine
The 2,012-game cohort remains `HISTORICAL_BENCHMARK_ONLY` and is never available for selection or fitting.

## 48. Dataset hash
`a72ae19782e457a63bdff9f28d73c9a5c51e7631949086cddaf3e1aa77c5dd73`.

## 49. Normalization transform hash
`908ced7a2279760f54bc326200ae18c3625e7b9cee5d31fbc9ea230b5d1963bc`.

## 50. Normalization artifact hash
`7221767dfe6930136f1729b257b49580157095b8d09065fb2e237819774645c8`.

## 51. Development live materialization
An idempotent run produced 30 v5 snapshots.

## 52. Live storage eligibility
All 30 rows were marked PIT-safe and baseline-core eligible by the live foundation.

## 53. Live PIT violations
Zero v5 snapshot rows have cutoff at or after first pitch.

## 54. Prospective adapter verification
Zero rows are counted as adapter-verified because independent component-ID/hash-to-source-timestamp replay is not yet implemented.

## 55. Training gate
Closed with `NO_PROSPECTIVE_V5_PARITY_VECTOR`.

## 56. Training result
`CHALLENGER TRAINING BLOCKED`; no coefficients, intercept, calibration, or fitted artifact were created.

## 57. Challenger runtime
Deterministic artifact identity, exact executor identity, score distributions, win probabilities, calibration evaluation, idempotent shadow records, and outcome pairing are implemented.

## 58. Serving and promotion
MLB V4 remains non-deployable; MLB V1 remains champion. Promotion is structurally impossible from this workflow.

## 59. Verification
Focused Task 238/239 suites pass 64/64, API typecheck passes, and the development API workflow starts successfully.

## 60. Final decision
**B — FOUNDATION COMPLETE / CHALLENGER TRAINING BLOCKED:** the frozen 14-feature historical/live contract, chronology, dataset, normalization, materializer, and shadow runtime are complete, but no fitted challenger may be created until at least one real v5 row passes independent component-provenance replay.

**Recommended next task (exactly one):** implement an immutable read-only provenance replay that resolves every v5 component ID and hash to its original source cutoff, runs the live adapter on those rows, and opens the training gate only when at least one real vector matches the frozen contract.