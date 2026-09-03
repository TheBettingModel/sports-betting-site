# #221C NCAAF Production Evidence Activation — authoritative completion report

**Report time:** 2026-09-03 UTC. **Production URL:** `https://Thebettingmodel.replit.app` — active, public, autoscaled, and successful.  
**Authoritative disposition:** **PROVIDER ACCESS REQUIRED; DATA_PIPELINE_READY=false; V4_BUILD_READY=false; DO NOT BEGIN #222.**

## 1. Executive summary

#221C activated the isolated production NCAAF evidence cycle and repaired the operational starvation that prevented completed-game performance capture. The deployment startup bootstrap proved capture (`attemptedDates=1`, `capturedDates=1`, `failures=[]`), and evidence rows grew during the production audit. Production now has 458 performance rows, including 16 rows with ESPN Summary evidence.

This is not a claim that the entire data foundation is complete. The current cycle is processing a large future schedule; canonical intelligence snapshots and cohorts remain zero. Therefore snapshot activation, `FINAL_PREGAME`, and `LIVE_SHADOW` are not yet production-proven/completed. Critical pregame provider domains also remain absent. Facts reported below are observed production facts at report time; code descriptions are expectations unless an observed result is stated.

## 2. Starting production state

Before reconciliation, production had 0 performance rows, 0 intelligence snapshots, and 0 cohorts; evidence runs were 31 completed, 142 partial, 8 failed, and 37 running. Deployment is now active at the URL above. This section separates that starting observation from the later report-time snapshot.

## 3. Scheduler diagnosis

The NCAAF capture/snapshot path was nested in the shared 30-minute odds-ingestion job. A synchronized five-minute MLB heavy lock could own that shared path when NCAAF needed to run, starving NCAAF work. The new NCAAF process-local single-flight cycle runs independently at minutes `:02`, `:17`, `:32`, and `:47`; it reconciles stale runs, captures current evidence with provider-failure fallback, discovers future games, and attempts feature/intelligence snapshots and eligible cohorts.

## 4. Zero-performance-row root cause

The verified cause was scheduler starvation, not a fabricated provider, schema, or identity explanation: completed-game NCAAF capture sat behind the shared 30-minute odds-ingestion path and was starved by the aligned MLB heavy-job lock.

## 5. Performance capture fix

The repair is the dedicated process-local single-flight cycle plus a bounded startup completed-game bootstrap and stale-run reconciliation. Capture failures fall back to existing evidence rather than aborting later cycle work. ESPN Summary is used only for legitimate completed games; its normalized rows preserve provenance, capture time, payload hash, quality, and missing reasons. It is never treated as pregame evidence.

## 6. Performance rows after fix

Observed report-time `performance_rows=458`; `performance_with_summary=16`. The deployment log proves the bounded bootstrap attempted and captured one date with no failures, and evidence rows increased during audit. These are immutable completed-game performance records, not prospective pregame intelligence.

## 7. Intelligence-snapshot root cause

The same shared-job starvation made the intelligence path unreachable in the prior operational design. After isolation, the current cycle is processing a large future schedule, but no canonical intelligence snapshot has yet persisted. Zero is an observed result, not permission to weaken readiness gates.

## 8. Intelligence snapshot fix

The production cycle now invokes canonical feature creation and `ncaaf-football-intelligence-v1` creation independently after discovery, with per-game error isolation, provider-failure fallback, and process-local single-flight. It enforces pre-kickoff cutoffs and leaves missing evidence explicit. The plumbing is deployed; end-to-end snapshot activation remains unproven until a row persists.

## 9. Intelligence snapshots after fix

Observed report-time `intelligence_snapshots=0`. Consequently, no readiness-state distribution can be asserted from production snapshots, and this activation is **not** complete/production-proven.

## 10. Evidence runs before reconciliation

Observed immediately before reconciliation: completed 31, partial 142, failed 8, running 37. All 37 running rows were deterministically stale under the reconciliation policy.

## 11. Stale-run reconciliation

The stale reconciliation safely converted the 37 old running rows to failed while leaving fresh work untouched. It preserves run history/details. The two report-time running rows began at approximately 17:00 UTC; they are fresh and were not relabeled.

## 12. Evidence runs after reconciliation

Observed report-time statuses: completed 31, partial 144, failed 45, running 2; `stale_running=0`. The arithmetic reflects 37 stale running rows reconciled into failed runs, with subsequent cycle outcomes included in the report-time totals.

## 13. PARTIAL reasons

The leading newly structured PARTIAL cause is **ESPN Summary invalid JSON**, appearing 5 times in persisted `partialReasons`. No unmeasured aggregate cause is inferred.

## 14. FAILED reasons

Observed failed causes are: 37 stale reconciliations; 7 Odds API timeout failures; and 1 combined ESPN+Odds timeout failure. These total 45 failed runs.

## 15. ESPN scoreboard production state

ESPN scoreboard is the legitimate source for NCAAF schedule, event/team IDs, status, scores, venue/context, neutral-site information, and limited record information. Its coverage is intentionally limited; it does not establish the critical player/pregame domains.

## 16. ESPN Summary production state

ESPN Summary is producing legitimate completed-game evidence: 16 performance rows carry summary evidence. Where valid, it supplies completed-game team boxscore statistics, drives, provider player IDs, passing rows, and QB completed-game performance. Some events produced invalid JSON and are explicitly recorded; Summary is not evidence of pregame starters, roster/depth, injuries, recruiting, transfers, coaching continuity, or full PIT play data.

## 17. QB provider audit

No currently configured provider path supplies a reliable timestamped NCAAF pregame QB identity with team, expected/confirmed starter state, availability, and source. ESPN Summary player/QB data are postgame performance only.

## 18. QB evidence coverage

Pregame QB coverage is **MISSING / PROVIDER_ACCESS_REQUIRED**. Missing QB evidence is not replaced by prior scoring or assumed starter/availability.

## 19. Roster/depth provider audit

The configured scoreboard and Summary paths do not provide a reliable pregame roster, depth chart, position/starter state, or PIT roster revision feed.

## 20. Roster coverage

Roster/depth coverage is **MISSING / PROVIDER_ACCESS_REQUIRED**. No missing roster value is interpreted as a stable roster or known starter.

## 21. Injury provider audit

No configured source provides timestamped NCAAF pregame injury, availability, suspension, or designation history.

## 22. Injury coverage

Injury coverage is **MISSING / PROVIDER_ACCESS_REQUIRED**. Absence of an injury feed does not mean healthy, available, or probable.

## 23. Historical team evidence

Completed ESPN Summary records can retain valid boxscore and drive evidence, and scoreboard supports score/context history. This is insufficient independent historical PIT evidence for intended V4 team strength because it lacks reliable timestamped pregame player, availability, roster, and complete play context.

## 24. Play/drive evidence

Valid completed ESPN Summary responses contain drive evidence. The feed did not establish reliable complete play-by-play/PIT play data. Drive evidence therefore cannot be promoted to a claim of a complete play-level feature foundation.

## 25. EPA availability

**Not available legitimately.** Complete play-level inputs required for EPA/play are not reliably available; no EPA is derived.

## 26. Success-rate availability

**Not available legitimately.** Down, distance, and complete play outcomes are not established; no success rate is derived.

## 27. Explosiveness availability

**Not available legitimately.** There is no verified complete play gain distribution; no explosiveness metric is invented.

## 28. Havoc availability

**Not available legitimately.** Verified inputs for disruption/havoc are incomplete; no havoc metric is derived.

## 29. Early-season prior evidence

Limited prior score/context and completed-game evidence may describe samples, but there is no legitimate PIT true-talent prior covering QB continuity, returning production, talent, transfers, or coaching continuity. September modeling cannot safely substitute current-season scoring alone.

## 30. Returning production

**Missing / PROVIDER_ACCESS_REQUIRED.** No verified, timestamped returning-production feed is configured.

## 31. Recruiting/talent

**Missing / PROVIDER_ACCESS_REQUIRED.** No recruiting or talent provider/coverage has been verified.

## 32. Transfers

**Missing / PROVIDER_ACCESS_REQUIRED.** No verified transfer history or PIT player-continuity source is configured.

## 33. Coaching

**Missing / PROVIDER_ACCESS_REQUIRED.** No verified coach/coordinator effective-date or continuity source is configured.

## 34. Weather

Open-Meteo infrastructure exists, but NCAAF venue geocoding and weather capture are not active. There is no NCAAF forecast/observation record to claim, and no postgame weather leakage is permitted.

## 35. FBS/FCS

Subdivision classification remains `UNKNOWN` unless legitimate source evidence establishes FBS, FCS, or OTHER. Conference/context is not used to invent a classification.

## 36. Provider access gaps

**CRITICAL:** timestamped pregame QB identity/starter/availability; roster/depth; injuries/availability; sufficient PIT historical team/play evidence; and complete play-by-play needed for intended independent football features. **IMPORTANT:** returning production, recruiting/talent, transfers, coaching continuity, weather/venue metadata, special teams, and reliable subdivision enrichment. **OPTIONAL:** additional enrichments beyond those required to build/calibrate the initial approved model. Critical domains remain missing.

## 37. Recommended provider/access

Obtain authenticated commercial NCAAF access such as **Sportradar NCAAF** or **SportsDataIO College Football**, but contractually verify the particular licensed endpoints and timestamp semantics for pregame depth charts/QB, rosters, injuries, play-by-play, and historical PIT before claiming coverage. Supplement with **CollegeFootballData** for recruiting, transfers, rosters, and plays only after verifying licensed coverage and timestamps. No claim is made that any one endpoint supplies every domain.

## 38. ncaaf-football-intelligence-v1 status

`ncaaf-football-intelligence-v1` remains the immutable, market-free canonical schema. The deployed cycle attempts it for eligible future games and must retain domain readiness, quality, provenance, and missing ledger. Observed persisted production count remains zero.

## 39. Feature readiness

Observed `feature_snapshots=605`. This is a feature-snapshot count, not proof of canonical intelligence readiness. With `intelligence_snapshots=0`, no READY/PARTIAL/BLOCKED intelligence-state count is production-proven; missing critical domains must remain explicit rather than zero-filled.

## 40. FINAL_PREGAME count

Observed `FINAL_PREGAME=0`. The cycle’s strict pre-kickoff selection uses a 45-minute final window and immutable snapshot/evidence cutoffs, but its operation has not yet been proven by a production assignment.

## 41. Internal LIVE_SHADOW count

Observed `LIVE_SHADOW=0`. It remains internal anti-backfill/prospective cohort infrastructure, not the permanent public mode or a barrier to a future approved live champion.

## 42. Prospective 2026 capture

The dedicated cadence is active at `:02/:17/:32/:47`, and completed-game evidence capture is production-proven by rows/logs. The cycle is currently processing a large future schedule. Because snapshots/cohorts remain zero, prospective intelligence/cohort capture is not yet proven complete.

## 43. PIT violations

No PIT violation is asserted from the report-time counts. Code expectation: feature/intelligence evidence must be strictly before kickoff; `FINAL_PREGAME` has a 45-minute pre-kickoff window; `LIVE_SHADOW` rejects historical backfill. Zero assignments means those guards have not yet been demonstrated by a persisted cohort.

## 44. Sports/market firewall

Odds API evidence is market-only. Sports intelligence rejects market fields and does not consume moneyline, spread, total, odds, sportsbook/bookmaker, implied/market probability, sharp signal, CLV, or line movement. Closing odds are downstream evaluation evidence only.

## 45. Learning architecture

The intended future contract binds immutable prediction/model version, feature schema, calibration version, `FINAL_PREGAME`, decision market, closing market, outcome, residuals, Brier/log loss, CLV, feature performance, and betting-policy performance. Every completed game should add evidence once V4 is live; current records do not create V4 forecasts or approval evidence.

## 46. Production mutation safeguards

One game may add immutable evidence; it may not automatically change production weights/configuration. Improvements must be candidate configuration, chronological replay/walk-forward comparison, validation, explicit approval, and a new immutable version.

## 47. Future live-champion architecture

The target is NCAAF V4 as the approved **LIVE CHAMPION**, not a permanently hidden shadow model. After engineering, PIT safety, sufficient calibration, chronological validation, and explicit approval, one champion per market may publish qualified actionable picks. Internal challengers may use `LIVE_SHADOW`; suspension, rollback, publication disable, and market-specific disable must fail closed. No V4 publication or threshold change occurs in #221C.

## 48. NCAAF/NFL isolation

NCAAF owns its evidence, intelligence, features, QB/team/prior/roster logic, forecast, calibration, learning, champion, and challenger state. This work adds no generic football forecast engine and has zero intended forecasting impact on NFL.

## 49. Other-sport regression

No other sport’s forecasting behavior was changed by this NCAAF-specific work. This is code-scope/implementation evidence; no claim is made that a full other-sport regression suite was run.

## 50. Tests/build/typecheck

62 focused tests passed, including the targeted production-cycle/provider/evidence/cohort safeguards. API and Admin typechecks passed; the Admin production build passed; `git diff --check` passed. This report does **not** claim a full other-sport regression suite was run.

## 51. DATA_PIPELINE_READY

**False.** Performance capture is activated and stale runs are reconciled, but zero production intelligence snapshots, zero `FINAL_PREGAME`, and zero `LIVE_SHADOW` assignments mean the snapshot/cohort pipeline is not production-proven/completed. Required critical pregame domains are also unavailable.

## 52. V4_BUILD_READY

**False.** Intended V4 cannot be built without fabricating critical inputs while pregame QB, roster/depth, injuries, sufficient PIT historical team/play data, and the first legitimate snapshot/cohort evidence remain absent.

## 53. Remaining blockers

Finish bounded snapshot-cycle activation through a persisted canonical snapshot and prospective cohorts; obtain/verify authenticated provider coverage for critical pregame QB, roster/depth, injury, complete play/PIT historical domains; then verify the associated timestamp/PIT semantics. Weather venue geocoding/capture and important prior domains remain additional gaps. Do not weaken evidence gates or declare missing evidence as zero.

## 54. Recommendation for #222

**DO NOT BEGIN. Status: PROVIDER ACCESS REQUIRED.** First obtain and verify the recommended provider access, then finish bounded snapshot-cycle activation and demonstrate persisted canonical intelligence, `FINAL_PREGAME`, and internal prospective `LIVE_SHADOW`. #222/V4 engineering remains blocked.

**Completion questions — explicit answers**

1. **Why were production football-performance rows not being created?** The NCAAF path was starved inside the shared 30-minute odds-ingestion job by the aligned five-minute MLB heavy lock.
2. **Is that fixed?** Yes: the dedicated process-local single-flight cycle, bootstrap, reconciliation, and fallback are deployed; performance evidence is observed.
3. **How many production football-performance rows exist now?** 458.
4. **Why were intelligence snapshots not being created?** The same shared-job starvation prevented the path from running.
5. **Is that fixed?** The runtime path is deployed and reachable, but no: activation is not production-proven/completed because persisted intelligence snapshots are still zero.
6. **How many production intelligence snapshots exist now?** 0.
7. **How many evidence runs were RUNNING before reconciliation?** 37.
8. **How many were stale?** 37.
9. **How many were reconciled?** 37 stale runs.
10. **How many remain RUNNING?** 2, both fresh from about 17:00 UTC.
11. **How many remain PARTIAL?** 144.
12. **What are the top PARTIAL causes?** ESPN Summary invalid JSON, 5 occurrences in `partialReasons`.
13. **Is prospective 2026 NCAAF collection now running correctly?** Completed-game capture is proven active; snapshot/cohort collection is running but not yet proven complete because it is processing a large future schedule and has produced zero snapshots/cohorts.
14. **Is ESPN Summary producing legitimate completed-game evidence in production?** Yes; 16 performance rows carry Summary evidence, subject to explicit invalid-JSON failures.
15. **Do we have reliable pregame QB identity?** No.
16. **Do we have reliable expected/confirmed starting QB?** No.
17. **Do we have reliable roster/depth data?** No.
18. **Do we have timestamped injury data?** No.
19. **Do we have sufficient historical team evidence?** No, not PIT-complete independent evidence for intended V4.
20. **Do we have play-by-play?** No reliable complete play-by-play.
21. **Do we have drive data?** Yes, only from valid completed ESPN Summary responses.
22. **Can we calculate EPA legitimately?** No.
23. **Can we calculate success rate legitimately?** No.
24. **Can we calculate explosiveness legitimately?** No.
25. **Can we calculate havoc legitimately?** No.
26. **What early-season prior evidence exists?** Limited score/context and completed-game sample evidence; no true-talent/PIT continuity prior.
27. **Do we have returning production?** No.
28. **Do we have recruiting/talent?** No.
29. **Do we have transfer data?** No.
30. **Do we have coaching continuity?** No.
31. **Is NCAAF weather active?** No.
32. **Which domains are CRITICAL?** Pregame QB/starter/availability, roster/depth, injuries, and sufficient timestamped historical team/play evidence.
33. **Which critical domains are still missing?** All of those critical domains.
34. **Is another provider required?** Yes.
35. **If yes, exactly what provider/access should we obtain?** Authenticated Sportradar NCAAF or SportsDataIO College Football access, contractually verified for pregame depth/QB, rosters, injuries, play-by-play, and historical PIT; optionally verified CollegeFootballData supplementation for recruiting/transfers/rosters/plays.
36. **How many legitimate FINAL_PREGAME snapshots exist?** 0.
37. **How many internal LIVE_SHADOW cohort assignments exist?** 0.
38. **Can historical games be backfilled into the prospective cohort?** No; internal anti-backfill guards prohibit it.
39. **Can sportsbook odds enter sports intelligence?** No.
40. **Can closing odds enter sports intelligence?** No.
41. **Can one completed game automatically alter production weights?** No.
42. **Will every completed game add learning evidence once V4 is live?** Yes, immutable learning evidence; it does not automatically mutate production.
43. **Can future candidate models be tested without changing the live champion?** Yes, via isolated challengers, chronological replay, validation, and approval.
44. **Is the architecture prepared for V4 to become the LIVE champion?** Yes architecturally after validation/approval; V4 itself is not ready to build.
45. **Did this task change any current NCAAF forecast?** No.
46. **Did this task change any other sport?** No.
47. **Is DATA_PIPELINE_READY true or false?** False.
48. **Is V4_BUILD_READY true or false?** False.
49. **If false, what exact blockers remain?** Zero intelligence snapshots/cohorts and missing critical pregame provider domains: QB, roster/depth, injuries, and sufficient PIT historical team/play data.
50. **Should we begin #222 next?** No — **DO NOT BEGIN; PROVIDER ACCESS REQUIRED** and finish bounded snapshot-cycle activation first.