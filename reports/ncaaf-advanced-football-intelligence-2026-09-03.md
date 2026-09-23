# #221 NCAAF Advanced Football Intelligence — measured completion report

**Assessment:** **ENGINEERING COMPLETE — PROVIDER ACTIVATION REQUIRED.** This is not ready for #222, V4 development, promotion, or subscriber exposure. The review is deliberately limited to the production pre-implementation measurements supplied for this report and the current #221 diff/code. Production has not yet received the #221 schema migration, so the new tables do not yet exist there.

## 1. Executive summary
The diff adds isolated, immutable NCAAF evidence primitives, cohort assignment code, provider capability declarations, scheduler hooks, and authenticated readiness diagnostics. It does not add a football-intelligence provider. ESPN scoreboard evidence is limited to points and limited game context. All advanced, QB, roster, injury, coaching, and weather domains remain missing or unsupported.

## 2. #220 starting state
There are 99 legacy NCAAF published-pick rows: 8 graded and 91 pending. They remain legacy/quarantined evidence, not a legitimate prospective V4 cohort. Production evidence runs measure 31 completed, 8 failed, 142 partial, and 36 running. There are 0 valid evaluations, 1 walk-forward run, and 2 promotion decisions; none supports promotion.

## 3. Current NCAAF provider inventory
The wired NCAAF providers are ESPN scoreboard, Odds API, and an Open-Meteo service that is not wired for NCAAF. ESPN supplies the schedule/scoreboard mapping; Odds API supplies market-only observations; Open-Meteo has no NCAAF venue map or capture path. Authentication, endpoint breadth, and rate limits beyond what the adapters use are not asserted by this audit.

## 4. Provider capability matrix
| Domain | Current state | PIT state | Evidence |
|---|---|---|---|
| ESPN schedule, identity, team IDs, conference IDs, venue, neutral site, status, scores | AVAILABLE_NOW | PARTIAL | scoreboard/date-backfill mapping |
| ESPN player, roster, injury, depth, play EPA/success/explosiveness/havoc, drive, recruiting, transfer, coaching, special teams | NOT_SUPPORTED | NOT_SUPPORTED | scoreboard endpoint has none of these reliable feeds |
| ESPN historical PIT | NOT_SUPPORTED | NOT_SUPPORTED | date backfill cannot reconstruct pregame intelligence |
| Odds API current markets | AVAILABLE_NOW | AVAILABLE_BUT_NOT_CAPTURED | market-only current h2h/spread/total ledger |
| Odds API opening/closing | PARTIAL | NOT_SUPPORTED | current-only integration |
| NCAAF weather | REQUIRES_PROVIDER | NOT_SUPPORTED | no NCAAF venue/capture integration |

## 5. Provider activation changes
#221 adds the declarative capability inventory and a production-shaped score/context normalization and team-game ledger path. It does **not** activate a new intelligence-data provider or create credentials. The safe activation result is therefore provider activation required.

## 6. Remaining provider gaps
Required gaps include timestamped NCAAF play/team evidence; QB, roster, depth, injury, coaching, talent/recruiting, transfer, special-teams, venue/roof/weather, and historical PIT coverage. No code may treat a missing domain as zero, healthy, known, or available.

## 7. Raw evidence architecture
Existing NCAAF evidence/market capture remains append-only and provider-scoped. The added performance design stores provider, event/team IDs, season/week, captured time, payload hash, provenance, supported fields, missing fields, and reasons. The production table is absent until publish, so this is an implementation boundary rather than production-captured data.

## 8. Canonical game identity
The scheduler and ledger use ESPN provider event IDs and team IDs; cohort assignment rejects blank, legacy, unmapped, and unknown provider/event identifiers. Market matching remains fail-closed for ambiguity. There is no newly proven cross-provider canonical-game master.

## 9. Canonical team identity
Provider-native ESPN team IDs are retained for team/opponent identity. The reviewed implementation does not introduce a canonical school/brand/alias registry that resolves difficult names such as Miami or USC; it appropriately does not guess.

## 10. FBS/FCS handling
The performance normalizer records `competitionClassification: UNKNOWN` because the scoreboard contract does not establish FBS/FCS membership. Conference IDs may be scoreboard context, but no subdivision inference or adjustment is made.

## 11. Team-game performance
The implementation can normalize two immutable team rows per scoreboard game with points for/against, halftime points, kickoff, week, home/away/neutral, and final-status quality/reliability. Production has no new #221 table until publish; no claim is made that this ledger has rows in production.

## 12. Advanced offensive evidence
Unsupported. ESPN scoreboard does not provide plays, yards, pass/rush efficiency, third down, red zone, possession, or play outcomes. No advanced offensive feature is calculated.

## 13. Advanced defensive evidence
Unsupported. There is no reliable scoreboard feed for opponent plays, yards, pressure, sacks, disruption, coverage, or defensive player evidence. No defensive rating is created.

## 14. EPA availability
NOT_SUPPORTED. The code explicitly records no play-level EPA and leaves derived metrics null.

## 15. Success-rate availability
NOT_SUPPORTED. There are no down-and-distance outcomes from the scoreboard source.

## 16. Explosiveness availability
NOT_SUPPORTED. There is no play-level gain distribution and no explosive-play threshold is invented.

## 17. Havoc availability
NOT_SUPPORTED. There is no TFL, forced-fumble, pressure, or disruption feed.

## 18. Line-yards availability
NOT_SUPPORTED. Required rushing/play-level inputs are absent.

## 19. Drive evidence
NOT_SUPPORTED. ESPN scoreboard has no drive summaries, possessions, or points-per-drive evidence.

## 20. Garbage-time support
NOT_SUPPORTED. Without play/drive/game-state evidence, garbage-time filtering cannot be performed and no adjustment exists.

## 21. Opponent-strength architecture
`buildNcaafFootballIntelligence` provides market-free, chronological descriptive opponent history: prior scored opponent games and prior average scoring margin, strictly before the row kickoff and requested cutoff. It preserves no subdivision enrichment beyond `UNKNOWN`.

## 22. Opponent-adjusted features
No opponent-adjusted offensive, defensive, passing, or rushing feature is available. The only implemented output is descriptive chronological opponent-strength metadata, with an explicit missing reason when no prior scored game exists.

## 23. Early-season prior architecture
The intelligence object reports current- and prior-season game/scored-game counts and a cutoff. It establishes sample metadata only; no preseason true-talent prior, shrinkage formula, or forecast blend exists.

## 24. Prior-season evidence
Only prior scoreboard score/context rows are potentially usable after the new ledger is published and captured. They are not reliable PIT player, roster, injury, coaching, or advanced-stat prior evidence.

## 25. Returning-production evidence
NOT_SUPPORTED. No provider integration supplies trustworthy, timestamped returning production.

## 26. Recruiting/talent evidence
NOT_SUPPORTED. No recruiting or talent-composite provider is wired; no rankings are scraped or represented as authoritative.

## 27. Transfer-portal evidence
NOT_SUPPORTED. No transfer provider, player identity continuity, or PIT transfer capture is wired.

## 28. QB identity
NOT_SUPPORTED. The current NCAAF implementation has no first-class QB/player identity source.

## 29. QB starter evidence
NOT_SUPPORTED. TBM cannot reliably identify an expected or confirmed NCAAF starting QB from the wired scoreboard feed.

## 30. QB performance evidence
NOT_SUPPORTED. Attempts, completions, passing/rushing production, starts, EPA/dropback, CPOE, and pressure evidence are unavailable.

## 31. QB continuity/transfer evidence
NOT_SUPPORTED. Returning starter, transfer, prior school, career starts, and offense-continuity evidence require another provider.

## 32. Roster evidence
NOT_SUPPORTED. There is no NCAAF roster snapshot or player/team/depth capture path.

## 33. Injury evidence
NOT_SUPPORTED. Missing injury data is not interpreted as healthy; the scoreboard availability contract explicitly says it has no injury report.

## 34. Offensive-line evidence
NOT_SUPPORTED. No projected starters, starts, injuries, or continuity evidence exists.

## 35. Skill-player evidence
NOT_SUPPORTED. No reliable RB/WR/TE availability or role evidence exists.

## 36. Defensive-personnel evidence
NOT_SUPPORTED. No DL/EDGE/LB/CB/S availability, continuity, or player evidence exists.

## 37. Coaching evidence
NOT_SUPPORTED. ESPN scoreboard does not provide coach/coordinator evidence, effective dates, or continuity.

## 38. Pace evidence
NOT_SUPPORTED. No plays, possessions, drives, or seconds-per-play inputs are available.

## 39. Special-teams evidence
NOT_SUPPORTED. The scoreboard contract has no special-teams play evidence. Null field-goal fields must not be interpreted as zero.

## 40. Home/away/neutral context
SUPPORTED context only. The normalizer uses explicit neutral-site information; otherwise it retains the scoreboard home/away side. It does not infer home field from display order.

## 41. Venue
Venue is available only as limited ESPN scoreboard context when supplied. No stable venue identity, coordinates, roof, surface, altitude, or venue enrichment is implemented.

## 42. Rest/travel
No rest/travel feature or penalty exists. Chronological kickoff history may later support objectively derived rest, but no geography or travel evidence is wired.

## 43. Weather
REQUIRES_PROVIDER. Open-Meteo exists elsewhere but NCAAF has no venue lookup or scheduler capture. No current, forecast, historical, indoor/outdoor, or PIT weather evidence is claimed.

## 44. Data-quality states
The code preserves missing fields/reasons and uses unsupported/null rather than fabricated zeros. Feature readiness code presently looks for a top-level `quality.status`; this is important to the measured result below.

## 45. Feature reliability
Scoreboard final rows may carry quality/reliability of 1 only when final scores are present. The intelligence sample reports game/scored-game counts. There is no advanced-feature reliability, source completeness score, or opponent-adjustment maturity sufficient for V4.

## 46. Feature schema/version
The added cohort schema version is `ncaaf-pregame-cohort-v1`; collection version is `ncaaf-evidence-v1`; live-shadow version is `ncaaf-live-shadow-v1`. A dedicated `ncaaf-football-intelligence-v1` feature-schema contract is not established by this diff.

## 47. FINAL_PREGAME implementation
Implemented in code as an immutable assignment keyed by cohort type/provider/event. It requires a matching immutable feature snapshot, exact cutoff equality, provider identity, provenance, sports-evidence validation, and feature/evidence timestamps strictly before kickoff.

## 48. FINAL_PREGAME counts
**0 legitimate FINAL_PREGAME assignments** in current production. The new cohort table does not exist there until publish; historical rows are not retroactively represented as legitimate final cohorts.

## 49. FINAL_PREGAME completeness
An assignment preserves completeness, quality, and missing reasons from the snapshot. Existence is not readiness. Current snapshots cannot be confirmed READY merely from their legacy quality objects.

## 50. Forecast readiness
Measured confirmed READY snapshots: **0**. There are 561 snapshots, but their legacy quality objects lack a top-level `status` key. The endpoint’s implementation consequently computes ready as 0 and blocked as 561, but “BLOCKED” here is an implementation/readiness classification, not an invented data-quality fact.

## 51. LIVE_SHADOW implementation
Implemented in code as a separate immutable cohort assignment. It requires current collection version, pre-kickoff assignment, strict snapshot/evidence cutoff, provider identity, provenance, and sports/market firewall checks.

## 52. LIVE_SHADOW activation boundary
The exact fixed boundary is **2026-09-03T19:30:00.000Z**, activation version **`ncaaf-live-shadow-v1`**, with required collection version **`ncaaf-evidence-v1`**. Assignment before that time is rejected.

## 53. LIVE_SHADOW counts
**0 legitimate LIVE_SHADOW assignments** until the first post-publish prospective scheduler capture. The production schema has not yet been published with the new table.

## 54. Anti-backfill proof
`assignNcaafLiveShadowCohort` rejects assignment before the fixed activation timestamp and at/after kickoff; generic assignment also requires an immutable pre-kickoff snapshot. Legacy/unmapped identities are rejected. Thus a historical or July legacy game cannot become LIVE_SHADOW through this path.

## 55. Sports/market firewall
The cohort code rejects persisted snapshot features/evidence containing market/odds/sportsbook/bookmaker/moneyline fields. Football intelligence consumes sports evidence only; market evidence remains downstream.

## 56. Market evidence
Market evidence remains append-only and independent. Production measures 1,196,645 rows: 718,904 matched and 477,741 unmatched, a **60.08%** match rate. It is not football intelligence.

## 57. Market-at-decision architecture
Current market observations retain capture identity/time and match state. The #221 code does not create V4 forecasts or an immutable V4 decision-market binding; that remains future work after a football provider is activated.

## 58. Closing-market architecture
Opening/closing market history is not supported by the configured current-only Odds API path. Closing data cannot enter sports features and is not used here.

## 59. Postgame outcome
ESPN final scoreboard points/context are the only supported outcome evidence. Final scores can populate performance rows after publish; postgame evidence cannot mutate a pregame cohort.

## 60. Future V4 input contract
`getNcaafFinalPregameIntelligence(provider,eventId)` returns the single assigned immutable feature-snapshot reference after identity and schema consistency checks. It is an appropriate boundary, but its contents remain incomplete for a V4 engine.

## 61. Future V4 output contract
No expected points, score distribution, win probability, spread/total probability, recommendation, or units output is implemented. No forecast/output behavior changed.

## 62. Admin observability
The authenticated aggregate endpoint `GET /api/admin/ncaaf-readiness` now returns readiness gates, cohorts, feature counts, evidence/run and market coverage, performance coverage, provider inventory/blockers, PIT violations, and validation summaries. The new authenticated per-event endpoint is `GET /api/admin/ncaaf-readiness/:eventId`; it exposes only actual evidence, cohorts, quality, missing reasons, and market match diagnostics.

## 63. Provider health
Aggregate health is observable through recent evidence-run records and structured partial/failure details, not a claim that provider health is good. The endpoint currently limits recent run detail to 12 rows, so it is not a full historical provider-SLA calculation.

## 64. Evidence-run health before/after
Measured production state is 31 completed, 8 failed, 142 partial, and 36 running. No stale reconciliation was run for this reporting task; **0 stale runs reconciled by this task**. No before/after improvement is claimed.

## 65. Market matching before/after
Measured current state is 1,196,645 total / 718,904 matched / 477,741 unmatched (60.08%). No historical rows were rewritten and no post-change prospective improvement can be measured before publish/capture. Remaining cause detail must come from persisted `marketIdentityStatus`, reason, and missing-reasons fields; aggregate cause counts were not supplied.

## 66. Prospective 2026 collection
The scheduler code invokes NCAAF evidence capture and prospective snapshot/cohort logic within the existing ingestion architecture. It is not yet active in production for #221 because schema/code must first publish. Consequently no legitimate prospective capture exists yet.

## 67. Scheduler cadence
The existing odds-ingestion scheduler cadence is **every 30 minutes**. FINAL_PREGAME selection is attempted only inside the **30 minutes before kickoff**, selecting a valid pre-kickoff snapshot; this is not an assertion that a selection has yet occurred.

## 68. Pregame revision behavior
Raw evidence and market observations are append-only. A cohort assignment is immutable and unique by type/provider/event; later evidence cannot update it. The final selection must use the last valid pre-kickoff snapshot rather than overwrite older revisions.

## 69. PIT/leakage tests
Code-level guards reject cutoff/evidence timestamps at or after kickoff, reject pre-boundary LIVE_SHADOW, and reject market fields in sports snapshots. This report does not claim a test suite was run. Broader requested leakage cases (future QB/roster/coaching/weather, closing market, drive/play data) cannot be substantively tested until those provider domains exist.

## 70. Historical evidence inventory
No legitimate PIT football-intelligence historical inventory is available by season from the supplied production facts. Scoreboard history can describe prior scores/context, but cannot reconstruct historical pregame QB, roster, injury, coaching, advanced, weather, or market-history states. The 99 legacy picks are not V4/OOS evidence.

## 71. OOS eligibility rules
Only a pre-kickoff immutable LIVE_SHADOW assignment captured on/after the stated activation boundary under `ncaaf-evidence-v1` may qualify as prospective live-forward research. Historical backfill and inspected legacy data are not untouched OOS.

## 72. NCAAF/NFL isolation proof
The added modules, schemas, scheduler calls, and readiness routes are explicitly NCAAF-named and do not import an NFL forecasting model. They collect evidence and assign cohorts only; no shared football forecast engine or weights were added.

## 73. Other-sport regression proof
The reviewed #221 paths do not modify MLB, NBA, WNBA, NCAAB, NHL, Soccer, UFC, or their forecast formulas. This is code-scope evidence, not a claim that a full regression suite was run by this reporting task.

## 74. API tests
No API tests were run as part of this report-only task. The requirement’s historical #220 verification (319 API tests across 46 files) is not evidence that #221 tests were executed.

## 75. API typecheck/build
Not run by this report-only task. No success claim is made.

## 76. Admin typecheck/build
Not run by this report-only task. No success claim is made.

## 77. Engineering readiness
**False.** The endpoint defines engineering readiness as persisted FINAL_PREGAME and LIVE_SHADOW assignments plus zero provider capability blockers. Current assignments are 0/0, production lacks the tables until publish, and provider blockers remain.

## 78. Evidence readiness
**False.** Confirmed READY is 0; legacy quality objects have no top-level status; no legitimate cohorts exist; advanced/QB/roster/injury/coaching/weather evidence is unsupported; and 477,741 market rows are unmatched. Team performance ledger rows cannot yet exist in production before migration.

## 79. readyForV4 result
**False** (`engineeringReadyForV4 AND evidenceReadyForV4`). This is not V4 readiness and must not be flipped merely because code has been written.

## 80. Remaining blockers
Publish/migrate #221 first; activate a timestamped NCAAF intelligence provider; capture prospective PIT evidence; establish actual feature-ready semantics; obtain QB/roster/injury/coaching/talent/transfer/play/team/weather coverage; accumulate legitimate FINAL_PREGAME/LIVE_SHADOW cohorts; and resolve or characterize the market identity gap. Existing validation is also insufficient: 0 valid evaluations.

## 81. Recommendation for #222
**B — Activate/add missing provider data first.** Add a timestamped NCAAF football-intelligence provider with play/team coverage, QB/roster/injury coverage, coaching/talent/transfer coverage, and historical PIT coverage before #222. Then publish the safe architecture and continue prospective collection. Do not build V4, change forecasts, or promote NCAAF now.

---

# Completion appendix — explicit answers

1. **Is FINAL_PREGAME now implemented?** Yes, in code; not yet published to production.
2. **How many legitimate FINAL_PREGAME snapshots exist?** 0.
3. **Is LIVE_SHADOW now implemented?** Yes, in code; not yet published to production.
4. **Exact LIVE_SHADOW boundary?** `2026-09-03T19:30:00.000Z` / `ncaaf-live-shadow-v1` / `ncaaf-evidence-v1`.
5. **How many legitimate LIVE_SHADOW games exist?** 0.
6. **Can historical games be backfilled into LIVE_SHADOW?** No.
7. **What independent team-performance evidence is captured?** The wired contract supports only ESPN scoreboard points and limited context; no new production rows exist until publish.
8. **Is EPA/play available?** No.
9. **Is success rate available?** No.
10. **Is explosiveness available?** No.
11. **Is havoc available?** No.
12. **Is drive-level evidence available?** No.
13. **What opponent-adjusted features are available?** None; only chronological descriptive opponent prior-game/margin metadata.
14. **What preseason/early-season prior evidence is available?** Game/scored-game sample metadata and potentially prior scoreboard scores/context; no true-talent prior.
15. **Is returning production available?** No.
16. **Is recruiting/talent data available?** No.
17. **Is transfer-portal data available?** No.
18. **What QB evidence is available?** None from current NCAAF providers.
19. **Can TBM identify expected/confirmed starting QB reliably?** No.
20. **What roster evidence is available?** None.
21. **What injury evidence is available?** None.
22. **What offensive-line evidence is available?** None.
23. **What coaching evidence is available?** None.
24. **What special-teams evidence is available?** None.
25. **What weather/context evidence is available?** ESPN kickoff/week/home-away-neutral/venue/conference context when supplied; no NCAAF weather.
26. **Which important features require another provider?** Play/team advanced stats, QB, roster/depth, injuries, coaching, talent/recruiting, transfers, special teams, weather, and PIT history.
27. **Which provider(s) are recommended?** A timestamped NCAAF football-intelligence provider covering play/team, QB/roster/injury, coaching/talent/transfer, and historical PIT.
28. **How many feature snapshots are READY?** 0 confirmed.
29. **How many are BLOCKED?** 561 under current readiness implementation; legacy quality objects lack the status key, so this is not invented quality evidence.
30. **Dominant block reasons?** Missing top-level readiness status under current implementation plus unsupported critical provider domains; no aggregate legacy reason count was supplied.
31. **Current market match rate?** 718,904 / 1,196,645 = approximately 60.08%.
32. **Cause of remaining unmatched observations?** 477,741 remain unmatched; aggregate cause counts were not supplied, and diagnostics retain identity/missing reasons rather than guessing.
33. **How many evidence runs remain RUNNING?** 36.
34. **How many remain PARTIAL?** 142.
35. **How many stale runs were reconciled?** 0 by this report task.
36. **Is prospective 2026 collection actively running?** Not in production yet; it awaits publish and first scheduler capture.
37. **Collection cadence?** Every 30 minutes.
38. **Can post-kickoff evidence enter FINAL_PREGAME?** No.
39. **Can sportsbook prices influence sports intelligence?** No.
40. **Can closing odds influence sports intelligence?** No.
41. **Did #221 change a current NCAAF production forecast?** No.
42. **Did #221 change another sport’s forecasting behavior?** No.
43. **Is engineeringReadyForV4 true?** False.
44. **Is evidenceReadyForV4 true?** False.
45. **Is readyForV4 true?** False.
46. **What remains missing?** Published schema/assignments, provider activation, critical football domains, legitimate prospective evidence, feature-ready semantics, and valid evaluation evidence.
47. **Is the foundation ready to begin #222?** No.
48. **Next action?** **B — Activate/add missing provider data first.**