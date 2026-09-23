# #214 MLB Advanced Data Intelligence — 2026-09-03

## 1. Executive summary
Research-only #214 boundary added. Readiness: **C — ADVANCED DATA COVERAGE INSUFFICIENT — CONTINUE COLLECTION BEFORE #215**. No advanced player feature has proven stable identity, consistent live availability, full historical PIT support and immutable PIT capture.
## 2. Existing provider audit
MLB Stats API supplies schedules, probable pitchers, people, season/game-log pitching, boxscores and objective workload. ESPN supplies event/team/venue identity and optional odds. Odds API supplies markets only. Open-Meteo supplies forecasts. Internal tables supply PIT results/league ledger and static park factors.
## 3. Provider adapter architecture
Provider payload → validated append-only evidence → canonical research feature/snapshot. Vendor names are confined to adapters.
## 4. Player identity architecture
Canonical `players` IDs plus `provider_mappings`; #214 refuses a name-only player identity. Explicit provider state can preserve team/active/IL fields.
## 5. Starting pitcher advanced features
ERA, WHIP, computed FIP, K%, BB%, K-BB%, IP/BF and recent workload are conservatively capturable from current official payloads.
## 6. Pitch repertoire features
NOT_SUPPORTED pending an approved PIT-auditable provider adapter.
## 7. Pitcher expected metrics
xERA/xBA/xSLG/xwOBA/Barrel/HardHit are NOT_SUPPORTED; conventional metrics are never relabeled.
## 8. Hitter true-talent features
PLANNED. Current code has no verified player-stat capture adapter.
## 9. Hitter expected metrics
NOT_SUPPORTED without supported Statcast provider evidence.
## 10. Platoon features
PLANNED; retain PA and handedness only when a supported adapter exists.
## 11. Pitch-type hitter features
NOT_SUPPORTED.
## 12. Pitcher × hitter matchup architecture
Schema domain exists; no matchup score is calculated or used.
## 13. Lineup intelligence
Mapped player identity/order can be captured; pure order-weighted aggregation excludes missing/unordered metrics.
## 14. Lineup revision intelligence
Each revision is append-only and timestamped; later confirmation cannot rewrite prior evidence.
## 15. Player availability
Only explicit provider status belongs in evidence; no medical inference.
## 16. Bullpen true-talent features
PLANNED; no individual reliever quality adapter is active.
## 17. Bullpen role system
PLANNED; reputation labels are prohibited.
## 18. Reliever availability
Research transform records last-three-day pitches/appearances and availability separately from talent.
## 19. Expected bullpen composition
PLANNED; availability is not a claim of manager certainty.
## 20. Defensive features
OAA/DRS NOT_SUPPORTED.
## 21. Baserunning features
BsR/runs NOT_SUPPORTED; steals are not substituted.
## 22. Park intelligence
Internal multi-year factor/version is capturable; small seasonal factors are not invented.
## 23. Weather intelligence
Open-Meteo temperature, wind, direction and precipitation are capturable with forecast retrieval context; roof/dome is explicit.
## 24. Rest/travel/context
Existing rest is context; travel is AVAILABLE_NOT_USED/PLANNED until validated.
## 25. Umpire feature status
NOT_SUPPORTED: no reliable PIT assignment/metric feed.
## 26. League run-environment enrichment
Chronological internal ledger includes completed pre-cutoff games only.
## 27. True-talent prior architecture
Evidence includes sample reliability; no coefficients or fitted prior are introduced.
## 28. Sample reliability
HIGH/MEDIUM/LOW/VERY_LOW/UNKNOWN is separate from quality and model uncertainty.
## 29. Data quality architecture
Provider quality is stored independently; missing provider fields remain null/absent.
## 30. Advanced feature registry
`mlbAdvancedFeatureRegistry.ts` is machine-readable with provider, canonical fields, status, PIT/history/live/fallback/version.
## 31. Research feature snapshot
Immutable advanced snapshots include evidence hashes, quality, reliability and leakage metadata.
## 32. FINAL_PREGAME integration
Advanced snapshots optionally link to #213 canonical feature snapshots and reject cutoff at/after start.
## 33. Historical feature availability audit
Official conventional/lineup/workload: PARTIAL PIT; park/ledger: FULL PIT; weather: no reliable historical forecast; unsupported metrics: NOT_SUPPORTED.
## 34. Statcast integration status
Adapter boundary only. No uncontrolled scraping or raw pitch ingestion.
## 35. PIT integrity
Retrieved/effective/stat-through/cutoff fields are retained and asserted.
## 36. Future-data leakage safeguards
Rejects post-cutoff evidence, target-game-included aggregate IDs and future reliever appearances.
## 37. Late-pregame market capture
Existing market snapshots remain separate from baseball features. Additional cadence is deferred to bounded scheduler work.
## 38. Closing-line definition
Latest credible two-sided non-stale observation after decision and before first pitch; otherwise unavailable.
## 39. CLV-quality architecture
Existing close selector excludes stale/post-start markets; no sports feature may consume CLV.
## 40. Provider-health monitoring
Admin endpoint reports per-provider records, latest success, valid/failure counts.
## 41. Data-completeness observability
Admin endpoint reports advanced domain coverage, missingness, reliability and PIT violations without raw payloads.
## 42. Storage/scale design
Evidence is hash-deduplicated, indexed by game/cutoff/player; ordinary operation stores aggregates, not pitches.
## 43. Rate-limit/cost protections
Existing MLB services cache/bound requests; #214 does not add unbounded provider fan-out.
## 44. Scheduler integration
No new scheduler path is enabled: `collectAdvancedFromCanonicalSnapshot(id)` is bounded, makes no provider calls and is hash-idempotent. Automatic capture is deferred because current provider fields are not yet consistently mapped/captured as advanced evidence; silently scheduling partial data would violate eligibility.
## 45. Feature redundancy audit
ERA/FIP/xERA, OPS/wOBA/wRC+, and batted-ball expected metrics are flagged for future double-count prevention.
## 46. Feature leakage audit
Postgame boxscore, target-game aggregate, later lineup, future workload, future weather and close contamination are prohibited.
## 47. Versioning
`mlb-advanced-research-v1` versions evidence, snapshots and registry.
## 48. Managed migrations
Two managed-schema tables with unique hash identities and game/player indexes; run normal DB push, never startup DDL.
## 49. Tests
Focused tests cover missingness, stable identity, PIT/target leakage, lineup weighting and bullpen future-workload rejection.
## 50. Typecheck/build results
Shared-library typecheck passed after regenerating the DB declarations; API typecheck passed; API production build passed; the complete API suite passed 302 tests across 42 files. The development schema push and read-only advanced-data report command also passed.
## 51. Workspace Admin UI typing status
Not modified; unrelated existing Admin UI errors remain outside #214 scope.
## 52. Exact V3 before/after comparison
No V3 source, hash, weights, thresholds, units, publication, grading or learning code changed.
## 53. Exact V4 before/after comparison
No V4 formulas, run model, calibration, thresholds or shadow-only behavior changed.
## 54. Exact V4.1 before/after comparison
No V4.1 source or behavior changed.
## 55. Confirmation no current model uses newly added advanced features
Advanced module is not imported by V3/V4/V4.1; all registry usage is CAPTURED_RESEARCH_ONLY.
## 56. Current feature coverage percentages
Measured after the development migration: 0 advanced evidence records and 0 advanced snapshots, therefore 0% observed advanced-feature coverage. This is reported as an empty collection window, not as missing values converted to zero. Both PIT-integrity violation counts are 0.
## 57. Current live OOS sample count
0 `LIVE_SHADOW` cohort games currently have #214 advanced evidence. No historical games were reclassified or backfilled.
## 58. Exact list of features available for #215
**READY_FOR_215 (strict):** `league_run_environment` only. It is an existing immutable chronological PIT context feature, not an advanced player feature. There are **no READY advanced player features**.  
**LIVE_FORWARD_CANDIDATE_NEEDS_OOS:** `starter_conventional`, `probable_starter_identity`, `lineup_identity_order`, `bullpen_workload_availability`, `park_run_factor`, `weather_context`.
## 59. Exact list of features still unavailable
`hitter_advanced_metrics`, `statcast_expected_metrics`, `pitch_repertoire_and_matchup`, `defense_oaa_drs`, `baserunning_runs`, `umpire_effects`.
## 60. Recommended next MLB step
Continue mapped, immutable pregame capture and OOS auditing; do not build #215, tune, promote or publish a new model yet.