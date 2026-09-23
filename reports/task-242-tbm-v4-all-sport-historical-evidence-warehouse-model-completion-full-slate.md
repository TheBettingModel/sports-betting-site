# TASK #242 — TBM V4 ALL-SPORT HISTORICAL EVIDENCE WAREHOUSE, MODEL COMPLETION & FULL-SLATE PROJECTION ENGINE

## 1. Executive Summary

Overall classification: **C**. Shared-registry operational V4: Soccer. Dedicated frozen V4 path: NCAAF. Shadow-ready: Soccer; NCAAF still needs shared-registry integration. Production-approval-ready: none. Blocked from shared all-sport readiness: MLB, NCAAF integration, NFL, NBA, WNBA, NHL, UFC, NCAAMB. The reusable warehouse, quarantine rules, append-only forecast ledger, full-slate router, coverage calculation, and safe projection API are built. The intended nine-sport model set is not complete, so no production or cloud cutover occurred. No legacy fallback, market leakage, or outcome leakage was introduced.

## 2. #241 Reconciliation

The exact frozen NCAAF and Soccer artifacts were preserved. The seven #241 model blockers remain fail-closed; no failed candidate was registered or renamed.

## 3. #240 Architecture Preservation

The strict V4 registry, exact artifact identity, evidence validation, deterministic double execution, approval boundary, and `NO_FORECAST` behavior remain authoritative.

## 4. Historical Evidence Warehouse

An additive typed warehouse now covers source manifests, identity bridges, canonical events, completion-time semantics, quarantine, immutable cohort manifests, forecast versions, and full-slate run coverage.

## 5. Source Provenance

| Sport | Sources | Date coverage | Raw | Canonical | Eligible | Quarantined | PIT |
|---|---|---:|---:|---:|---:|---:|---|
| NCAAF | Existing CFBD/ESPN immutable evidence | Existing frozen cohort | Preserved | Preserved | Preserved | Preserved | Proven |
| Soccer | Existing canonical completed games | Existing frozen cohort | 103 | 103 | 103 | 0 | Proven under #241 contract |
| Other seven | Existing project sources assessed in #241 | Insufficient | Not promoted | Not frozen | Insufficient | Unsafe rows excluded | Unproven/inadequate |

No unavailable completion timestamp is silently invented. Events declare `SOURCE_REPORTED`, `CONSERVATIVE_BOUND`, or `UNAVAILABLE`; unavailable chronology is quarantined.

## 6. Identity System

Provider IDs map to canonical IDs with sport, season, competition, display name, aliases, corroborating proof, and a deterministic identity hash. Missing participant identity is `UNRESOLVED_IDENTITY`.

## 7. PIT Validation

Canonical events require valid event start, completion order, and target availability. Training evidence remains constrained to information available before the forecast cutoff.

## 8. Leakage Validation

The warehouse rejects market-shaped keys. Existing V4 input validation still recursively rejects market and outcome keys. Outcomes remain targets after feature freezing.

## 9. Cohort Materialization

Frozen cohort manifests record source manifests, exact event hashes, date range, raw/eligible/quarantined counts, feature count, train/validation counts, contract hash, and cohort hash.

## 10. MLB Historical Reconstruction

The consumed 2,012-game benchmark remains quarantined as `HISTORICAL_BENCHMARK_ONLY`. Prospective live-v5 parity remains unproven; no hindsight starter data was admitted.

## 11. MLB V4.0 Core

No new MLB artifact was frozen. Classification: **D**. The existing V4 foundation remains available for future prospective work, but no valid executor is registered.

## 12. NCAAF Preservation / Integration

The frozen expected-score model and strict evidence bridge were preserved without refit. Its dedicated route/executor remains available, but it has not yet been adapted into the shared `V4EngineRegistry` contract used by the generic full-slate service. Classification: **C**.

## 13. NFL Historical Reconstruction

Existing canonical evidence remains too small for a quality-gated model. The warehouse can accept future authoritative multi-season events without changing model code.

## 14. NFL V4.0 Core

The 12-vector candidate remains rejected for data insufficiency. Classification: **D**.

## 15. NBA Historical Reconstruction

No sufficiently complete PIT-safe multi-season canonical cohort was proven.

## 16. NBA V4.0 Core

No artifact was frozen or registered. Classification: **D**.

## 17. WNBA Historical Reconstruction

Existing chronology-safe evidence was retained, but the evaluated candidate did not beat the required baseline.

## 18. WNBA V4.0 Core

The failed candidate remains unfrozen and unregistered. Classification: **D**.

## 19. NHL Historical Reconstruction

No sufficiently complete PIT-safe multi-season canonical cohort was proven.

## 20. NHL V4.0 Core

No artifact was frozen or registered. Classification: **D**.

## 21. Soccer Preservation / Full-Slate Integration

Soccer V4.0 Core remains frozen and registered. The generic full-slate system can now discover and route all eligible Soccer events without edge filtering. Classification: **B**.

## 22. UFC Fighter Identity / Historical Reconstruction

The warehouse supports participant-A/B orientation, alias proof, and bout outcomes. A trustworthy fighter identity/chronology corpus was not available.

## 23. UFC V4.0 Core

No orientation-invariant artifact was frozen or registered. Classification: **D**.

## 24. NCAAMB Historical Reconstruction

No sufficiently complete PIT-safe multi-season canonical cohort was proven.

## 25. NCAAMB V4.0 Core

No artifact was frozen or registered. Classification: **D**.

## 26. Artifact Registry

| Sport | Model | Version | Approval | Maturity |
|---|---|---|---|---|
| NCAAF | `tbm-ncaaf-v4-expected-score` | `D-simple-expected-score-linear` | Existing shadow boundary | Existing frozen state |
| Soccer | Soccer V4 Core | Frozen #241 version | SHADOW | DEVELOPING |
| Other seven | None | — | UNVALIDATED | — |

Exact hashes remain in immutable artifact records and are intentionally not duplicated here.

## 27. Live Executor Matrix

| Sport | Executor | Deterministic | Train/live parity | Registered |
|---|---|---|---|---|
| NCAAF | Dedicated path | Yes | Preserved | No, shared adapter pending |
| Soccer | Yes | Yes | Yes | Yes |
| Other seven | No eligible artifact | — | Unproven | No |

## 28. Full-Slate Event Discovery

Discovery reads every game for an exact sport/Eastern date in chronological order. Missing start or identity is reported, never silently omitted.

## 29. Full-Slate Forecast Engine

Every eligible event is sent through `routeV4Forecast` before any betting-edge logic. Failures are normalized to explicit operational reasons.

## 30. Forecast Coverage

Coverage is computed as scheduled, eligible, forecasted, failed, and percentage. Real counts depend on the requested date and current ingested slate; the API calculates them live rather than embedding stale report values.

## 31. Immutable Forecast Persistence

The additive ledger inserts immutable forecast rows. It never updates an earlier forecast.

## 32. Forecast Versioning

New legitimate pre-event forecasts receive increasing versions and a `supersedes_prediction_id`. Identical prediction IDs are idempotent. Post-start writes are rejected.

## 33. Outcome Pairing

Canonical events preserve target availability and completion semantics. Final metric materialization remains separate from immutable forecasts.

## 34. Full-Slate Forecast Analytics

The schema/run service prepares forecast counts and coverage. Score MAE, margin/total MAE, RMSE, Brier/log loss, calibration, and bias remain derived evaluation outputs over forecast/outcome pairs.

## 35. Betting Analytics Separation

No full-slate row is inserted into legacy pick, result, units, ROI, CLV, or drawdown tables.

## 36. Public Projection API Readiness

`GET /api/model/v4/projections?sport=...&date=YYYY-MM-DD` returns a safe additive DTO with participants, time, lifecycle, supported projections, official-pick status, and complete coverage failures.

## 37. Forecast Display States

The contract supports `V4_VALIDATING`, `V4_PROVISIONAL`, and `V4_APPROVED`, plus `NOT_PUBLICATION_ELIGIBLE`, `NO_OFFICIAL_PLAY`, and `OFFICIAL_TBM_PLAY`.

## 38. Public Projection Safety

The DTO omits artifact hashes, contract hashes, feature hashes, evidence payloads, source manifests, and admin diagnostics.

## 39. #238A Preservation

Exact approval, global ranking, top-six cap, flat 1.0u, requested-unit audit, POTD safety, official filtering, and process-order invariance were not modified.

## 40. Official Record Protection

Shadow/full-slate forecasts are stored only in the V4 forecast ledger and do not alter official records.

## 41. POTD Protection

No full-slate code calls POTD selection or persistence.

## 42. Staking Protection

The public projection DTO carries no units. Official staking remains downstream in #238A.

## 43. V4 Router

Strict V4 only: eligible exact engine → forecast; missing/invalid engine → `NO_FORECAST`. There is no legacy fallback.

## 44. Legacy Replacement Map

NCAAF and Soccer have V4 artifacts, but only Soccer is in the shared registry. MLB, NFL, NBA, WNBA, NHL, UFC, and NCAAMB are not ready to retire legacy engines at a future cutover.

## 45. Prospective Shadow System

Append-only forecasts and run coverage can accumulate prospective evidence per exact model/artifact without mutating coefficients.

## 46. Controlled Model Evolution

Frozen V4.0 → prospective evidence → explicit V4.x challenger → chronological validation → explicit promotion. No self-mutating model was added.

## 47. Model Performance

Soccer retains #241 Brier 0.24485 versus baseline 0.29583 and total bias -0.2446. NCAAF metrics remain those of its frozen artifact. No rejected sport is assigned invented metrics.

## 48. Baseline Comparison

Only candidates that beat their defined naive baseline may freeze. Soccer passed; the WNBA candidate failed; insufficient candidates remain blocked.

## 49. Calibration

Calibration gates remain mandatory. Prospective calibration will be calculated separately from official pick results.

## 50. Bias

Bias gates remain mandatory; fitted-but-biased models remain unregistered.

## 51. Data Sufficiency

NCAAF and Soccer have frozen eligible cohorts. NCAAF still needs a shared-registry adapter. MLB parity, NFL population, NBA/NHL/NCAAMB history, WNBA quality, and UFC identity chronology remain genuine blockers.

## 52. Remaining Genuine Blockers

Seven sports still lack a legitimate combination of PIT-safe cohort, quality-gated frozen artifact, and exact live/train executor parity.

## 53. Future V4.x Enhancements

Advanced injuries, starters, goalies, lineups, and fighter context are enhancements only after valid core cohorts exist; they are not excuses to lower core gates.

## 54. Database Changes

One additive migration adds five warehouse/full-slate tables. No destructive migration or startup DDL was run.

## 55. API Changes

Added the safe all-sport V4 projection endpoint and OpenAPI-generated clients/types. Existing undocumented readiness/support routes were added to the spec so route coverage passes.

## 56. Frontend Compatibility

No frontend redesign or card change occurred.

## 57. Mobile Compatibility

The additive generated client compiles; no native dependency or rebuild was introduced.

## 58. Clean Source Integration

The clean-source export includes the changes and passed its credential scan.

## 59. Security

Source credential and Apple signing scans pass. No credentials or internal evidence are exposed by the public DTO.

## 60. Tests

API: **102 files, 662 tests passed**. Added tests cover deterministic event/cohort hashing, identity quarantine, missing completion time, conflicting duplicates, every-event routing, explicit no-artifact failures, and coverage.

## 61. Full Regression

API typecheck/build, admin typecheck/build, mobile typecheck, API spec generation/coverage, source scan, signing scan, and clean-source export passed.

## 62. Files Changed

Added typed V4 schema, additive migration, warehouse service/tests, full-slate service/tests, safe projection route, OpenAPI contract/generated clients, and this report.

## 63. Per-Sport Release Gates

Soccer is technically/shadow ready in the shared registry. NCAAF is frozen on its dedicated path but not full-slate ready in the shared registry. All other sports fail closed before artifact/executor/full-slate readiness.

## 64. Final Sport Classifications

MLB: **D**; NCAAF: **C**; NFL: **D**; NBA: **D**; WNBA: **D**; NHL: **D**; Soccer: **B**; UFC: **D**; NCAAMB: **D**.

## 65. Final Overall Classification

**C — HISTORICAL EVIDENCE BUILD MATERIALLY ADVANCED BUT TOO MANY V4 ENGINE GAPS REMAIN FOR THE INTENDED ALL-SPORT CUTOVER.**

## 66. What Is Actually Built Now

NCAAF and Soccer have legitimate V4 forecasting foundations; Soccer is registered in the shared strict V4 router, while NCAAF remains on its dedicated V4 path pending an adapter. The generic engine can discover a complete stored slate, attempt every eligible event, persist explicit success/failure coverage, and safely expose projections. Shadow projections can be displayed later but are not official picks. No sport is publication approved. All sports except Soccer currently return `NO_FORECAST` through the shared router. No V4 legacy fallback or production cutover exists.

## 67. EXACTLY ONE RECOMMENDED NEXT TASK

**TBM V4 FINAL SEVEN-SPORT EVIDENCE ACQUISITION & CORE MODEL COMPLETION** — acquire/version authoritative multi-season event and identity corpora, materialize PIT-safe cohorts, and build or explicitly reject one simple quality-gated core per remaining sport before any cloud cutover.