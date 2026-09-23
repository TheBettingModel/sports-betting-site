# MLB Advanced Evidence Capture — 2026-09-03

## 1. Executive summary
#214B is research-only. Readiness is **C — ADVANCED DATA COVERAGE INSUFFICIENT — CONTINUE COLLECTION BEFORE #215**. Measured LIVE_SHADOW counts are zero.
## 2. Root cause of #214's zero evidence
#214 defined storage and boundaries but had no automated producer consuming immutable #213 FINAL_PREGAME rows.
## 3. #214 architecture audit
Append-only evidence/snapshot tables exist and are separate from production feature and prediction paths.
## 4. Scheduler architecture
A five-minute single-flight bounded job reads uncollected, still-pregame FINAL_PREGAME rows and makes no provider call.
## 5. Probable starter collection
Provider IDs, handedness and confirmation state are copied only from the canonical starter child record.
## 6. Starter conventional collection
Normalized existing starter metrics are copied as provider-backed canonical evidence; absent metrics remain absent.
## 7. Starter PIT integrity
Each starter child retrieval timestamp is independently required to be at or before the canonical cutoff.
## 8. Starter revision behavior
Only the exact FINAL_PREGAME canonical revision is collected; hash conflict handling preserves append-only behavior.
## 9. Player identity mapping
`mlb_stats_api` IDs are resolved through `provider_mappings` joined to `players`; unmatched IDs are explicitly UNMAPPED and no names are retained.
## 10. Lineup collection
Canonical lineup rows, order and completeness are collected per team side.
## 11. Lineup cadence
The collector runs every five minutes but only after #213 itself has persisted FINAL_PREGAME.
## 12. Lineup revision behavior
The linked canonical revision, not a latest-by-team lookup, controls lineup identity and doubleheader safety.
## 13. Confirmed lineup capture
Confirmation and nine-player completeness are reported from persisted records, never inferred.
## 14. Bullpen workload collection
Existing canonical bullpen workload/fatigue/reliever structures are captured as research evidence.
## 15. Reliever availability evidence
Reliever provider IDs are mapped where possible; unmapped relievers cannot count as identity-complete.
## 16. Park collection
Canonical park factor, version and fallback metadata are captured.
## 17. Weather collection
Canonical weather forecast/context and quality state are captured, with no new weather request.
## 18. Weather revisions
Only the final canonical revision is captured automatically; late context is marked STALE.
## 19. League environment linkage
The latest target-game league ledger row at/before cutoff is separately linked and evidenced.
## 20. FINAL_PREGAME advanced snapshot
An advanced final snapshot links the exact canonical ID and contains statuses for league environment and all six candidates.
## 21. LIVE_SHADOW cohort behavior
Only a scheduler-discovered, persisted nonempty advanced snapshot assigns LIVE_SHADOW; manual/history paths do not.
## 22. Postgame linkage
Advanced records retain game ID; reporting counts starter outcomes and forecast evaluations linked by that ID without input contamination.
## 23. Feature completeness
PRESENT/STALE/MISSING statuses are explicit and missing values are never zero-filled.
## 24. Feature coverage percentages
The command reports distinct captured-game numerator and selected cohort eligible-game denominator.
## 25. Feature graduation rules
READY requires full PIT/history/live/identity/evidence proof; record presence alone cannot graduate a feature.
## 26. Current READY_FOR_215 features
Only existing `league_run_environment` is READY; it is context, not an advanced player feature.
## 27. Current LIVE_FORWARD_CANDIDATE features
Starter, probable starter, lineup, bullpen, park and weather require real OOS accumulation.
## 28. Current unreliable features
Lineup/live availability and weather historical PIT remain partial or unreliable as registry states.
## 29. Current unsupported features
Statcast, repertoire, defense, baserunning and umpire effects remain excluded.
## 30. Hitter conventional provider investigation
Existing `mlbLineups.ts` uses public MLB Stats API people/stats endpoints, but no immutable mapped hitter-stat #213 payload exists; no adapter was promoted.
## 31. Hitter advanced provider investigation
No approved advanced-hitter source with lawful PIT archive and identity audit is configured.
## 32. Statcast investigation
No Baseball Savant/Statcast adapter, license review or PIT archive exists; xERA/xwOBA remain unsupported.
## 33. Pitch repertoire investigation
No approved pitch-level source is present; usage/velocity/spin/movement/whiff are not fabricated.
## 34. Reliever-quality investigation
Only workload/availability canonical fields are collected; no unsupported quality rating is derived.
## 35. Defense investigation
No OAA/DRS provider adapter or PIT capture source is configured.
## 36. Baserunning investigation
No baserunning-runs provider is configured; steals are not used as a proxy.
## 37. Umpire status
No PIT-auditable umpire assignment/effect provider is configured.
## 38. Recommended provider expansion
First complete immutable MLB Stats API conventional hitter snapshots and mapping audit; separately approve any advanced provider before adding adapters.
## 39. Provider costs/limits considerations if applicable
The current collector has zero calls and reuses stored canonical records; no subscription was created.
## 40. Late market collection
Existing odds-ingestion observations are captured separately before start with no new request.
## 41. Closing line quality
Report distinguishes late checkpoint observations from actual `CLOSING`; only persisted CLOSING rows count as true closing.
## 42. CLV architecture
Existing market snapshot/evaluation architecture remains separate from sports-feature evidence.
## 43. Odds API request/cost safety
Capture reuses already fetched actionable odds and does not fan out provider calls.
## 44. Provider health
Report/admin show provider records, latest success and missing/unavailable/invalid failures.
## 45. Admin completeness
The PIT completeness endpoint supplies aggregate coverage, provider health, quality and strict eligibility.
## 46. Game-level research observability
The game endpoint exposes metadata/domain counts/PIT safety, never raw payloads.
## 47. OOS accumulation architecture
Only persisted automated live-forward captures receive immutable LIVE_SHADOW cohort assignment.
## 48. Historical reconstruction rules
No historical reconstruction/backfill is inferred or allowed to create LIVE_SHADOW.
## 49. Current LIVE_SHADOW game count
Measured report result: **0 distinct games**.
## 50. Current advanced evidence count
Measured report result: **0 evidence records**.
## 51. Current advanced snapshot count
Measured report result: **0 advanced snapshots**, including **0 FINAL_PREGAME**.
## 52. PIT violation count
Measured report result: **0**; zero rows are not proof of future operational quality.
## 53. Post-start contamination count
Measured report result: **0**; collector refuses cutoff at/after start.
## 54. Player mapping completeness
Measured mapped/unmapped evidence-player counts are **0/0**; future rows report both explicitly.
## 55. Scheduler memory safety
The existing `SingleFlightGroup` prevents overlap; bounded query limits work to 20 candidates.
## 56. Scheduler restart/idempotency
Uncollected pregame final rows are queried without a two-hour creation window; hashes/linked snapshot checks make retries safe.
## 57. Database/migrations
Existing #214 append-only schema is used; no startup DDL was introduced.
## 58. Tests
Final full API suite: **308 tests passed in 44 files**; targeted #214 coverage includes PIT, identity sanitization, market quality, candidate/window boundaries, report arithmetic and registry isolation.
## 59. API typecheck
`npx tsc --noEmit --pretty false` passed.
## 60. API production build
`npm run build` passed.
## 61. Workspace typecheck
The workspace command now passes shared libraries, API, Admin, mobile, and scripts, then stops on unrelated pre-existing mockup-sandbox errors: a duplicate object property in `PickFirst.tsx` and React type-identity conflicts in its copied calendar/spinner components. The API and production Admin artifacts typecheck independently.
## 62. Admin typing issue status
The two previously reported Admin blockers were fixed minimally: `ButtonGroupText` now narrows Radix Slot props explicitly, and the calendar root bridges the third-party ref through a callback. Admin typecheck and production build now pass; rendered behavior was not redesigned.
## 63. Exact V3 before/after comparison
No V3 files, formulas, weights, thresholds or inputs were changed.
## 64. Exact V4 before/after comparison
No V4 formulas, calibration, prediction behavior or publication path was changed.
## 65. Exact V4.1 before/after comparison
No V4.1 formulas, configuration, calibration or outputs were changed.
## 66. Confirmation current models do not consume #214B features
Collector modules are research-only and are not imported by V3/V4/V4.1 model calculations.
## 67. Exact feature list now eligible for future #215
`league_run_environment` only; no advanced player feature is eligible.
## 68. Exact feature list still blocked
Starter conventional/identity, lineup, bullpen, park, weather, hitter conventional, Statcast, repertoire, defense, baserunning and umpire domains remain blocked per registry.
## 69. Evidence still required before #215
Accumulate real LIVE_SHADOW finals, mapping coverage, confirmed lineups, late/closing market evidence and OOS/postgame linkage.
## 70. Recommended next MLB action
Operate and audit #214B collection; do not build #215 or change any official model until graduation evidence is demonstrated.