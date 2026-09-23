# #221D — CollegeFootballData NCAAF Intelligence Integration

**Report date:** 2026-09-03  
**Scope:** CollegeFootballData (CFBD) integration into the isolated NCAA Football intelligence pipeline.  
**Decision:** CFBD access and the isolated adapter are verified. Development capture and tests pass. Production CFBD capture is not yet proven, so `DATA_PIPELINE_READY = false` and `V4_BUILD_READY = false`. Work must stop before #222.

## 1. Executive summary

CFBD was authenticated successfully using the server-only `CFBD_API_KEY`. The key was not printed, returned, committed, or exposed to Admin, frontend, mobile, or API responses.

An NCAAF-specific CFBD client and bounded evidence-capture path were implemented. The client handles Bearer authentication, request identity, timeouts, bounded retries for rate limits/server errors, response validation, payload hashes, provider timestamps, and sanitized errors. Raw CFBD payloads are persisted before compatible derived evidence. Market-shaped fields are recursively removed from sports evidence.

Development verification completed successfully. The current development database contains 2 CFBD raw evidence rows, 758 CFBD game-evidence rows, 1,516 CFBD team/entity observations, and 250 CFBD completed-game performance rows. The current production replica contains 0 CFBD evidence rows and 0 CFBD entity rows, so the new CFBD path is not production-proven.

The existing production NCAAF intelligence foundation remains separate: 789 `ncaaf-football-intelligence-v1` snapshots exist, all with blocked readiness state in the inspected production data. No legitimate production `FINAL_PREGAME` or internal prospective cohort assignment was visible in the production replica query.

No NCAAF forecast, probability, expected score, recommendation, unit, wager, current model, NFL behavior, or other sport was changed. No NCAAF V4 model logic was built.

## 2. CFBD credential verification

`CFBD_API_KEY` was confirmed present as a Replit server secret. Its value was never printed or returned.

Authentication succeeded against the live CFBD API with HTTP `200` on the games endpoint. The adapter sends:

- `Authorization: Bearer <server-only key>`
- `Accept: application/json`

The key is read only by the server-side CFBD client. It is not available to the client applications.

## 3. Account/quota information

No CFBD account tier was returned by the representative API responses. No provider tier, daily quota, monthly quota, or quota-reset metadata was observed.

No rate-limit/quota headers were observed in the probe responses. Therefore the report does not claim a tier or numerical quota.

The adapter uses conservative behavior regardless of undisclosed account tier: one bounded capture per dedicated NCAAF cycle, request idempotency, a 15-second timeout, and at most three attempts for retryable `429` or `5xx` responses.

## 4. Provider capability matrix

The following matrix distinguishes live endpoint verification from captured production evidence and historical point-in-time safety.

| Domain | Live representative response | Adapter endpoint | Captured by this task | Historical PIT-safe by default |
|---|---:|---|---:|---:|
| Games | 200 | `/games` | Yes, bounded current-season game capture | No, not without cutoff qualification |
| Teams | 200 | `/teams/fbs` | Not yet | No |
| Conferences | 200 | `/conferences` | Not yet | No |
| Venues | 200 | `/venues` | Not yet | No |
| Rosters | 200 | `/roster` | Not yet | No |
| Players | Available through roster/player payloads | roster/player endpoints | IDs preserved where supplied; no dedicated player-map table added | No |
| Player statistics | 200 | `/stats/player/season` | Not yet | No |
| Team statistics | 200 | `/stats/season` | Not yet | No |
| Plays | 200 | `/plays` | Not yet | No |
| Drives | No standalone capture implemented | Provider data may appear in compatible payloads | Not separately captured | No |
| Advanced team statistics | 200 | `/stats/season/advanced` | Not yet | No |
| Advanced player statistics | Not separately verified as a dedicated endpoint | No dedicated adapter endpoint | No | No |
| EPA | No separately captured/validated field contract | `/plays` or advanced payload if supplied | No | No |
| Success rate | No separately captured/validated field contract | advanced payload if supplied | No | No |
| Explosiveness | No separately captured/validated field contract | advanced payload if supplied | No | No |
| Line yards | Not separately verified as a supported field | advanced payload if supplied | No | No |
| Havoc | No separately captured/validated field contract | advanced payload if supplied | No | No |
| Pace | No separately captured/validated field contract | team/advanced payload if supplied | No | No |
| Special teams | Not separately captured | season/advanced/rating payloads if supplied | No | No |
| SP+ | 200 | `/ratings/sp` | Not yet | No |
| CORE/opponent-adjusted metrics | No distinct CORE contract verified | No dedicated CORE endpoint | No | No |
| SRS | 200 | `/ratings/srs` | Not yet | No |
| Elo | 200 | `/ratings/elo` | Not yet | No |
| FPI | 200 | `/ratings/fpi` | Not yet | No |
| Recruiting | 200 | `/recruiting/players` | Not yet | No |
| Talent composite | 200 | `/talent` | Not yet | No |
| Transfers | Intended `/player/portal` path returned 404 in the initial probe | `/player/portal` | No | No |
| Returning production | 200 | `/player/returning` | Not yet | No |
| Coaches | 200 | `/coaches` | Not yet | No |
| Weather | 200 | `/games/weather` | Not yet | No |
| Rankings | Not separately modeled as a dedicated adapter endpoint | Provider ratings may be related but are not interchangeable | No | No |
| FBS/FCS classification | Classification fields were observed/handled when supplied | games/teams payloads | Classification is normalized in compatible evidence | No |
| Historical seasons | Season-based endpoints responded | Multiple season endpoints | Full historical materialization not performed | No |

HTTP availability means only that the account returned a valid response. It does not establish that the payload is timestamped pregame evidence, complete for every historical game, or safe for retrospective model construction.

## 5. Endpoints verified

Representative live probes returned HTTP `200` for:

- Games
- Teams
- Conferences
- Venues
- Team statistics
- Advanced team statistics
- Plays
- Rosters
- Player statistics
- Recruiting
- Coaches
- SP+
- Elo
- SRS
- FPI
- Talent
- Returning production
- Weather

The initial transfer probe returned HTTP `404`. The adapter documents CFBD’s `/player/portal` path as the intended transfer endpoint, but transfer capture remains unavailable/not captured until the endpoint is verified safely.

## 6. Raw evidence architecture

The additive `ncaaf_college_football_data_evidence` table stores:

- Provider and endpoint
- Canonical request identity
- Season and optional week
- Optional CFBD game, team, and player IDs
- Provider-observed timestamp when supplied
- Capture timestamp and modeled-as-of timestamp
- SHA-256 payload hash
- Raw JSON payload
- Evidence state
- Explicit missing fields and missing reasons
- Schema version and append-only idempotency keys

Raw CFBD evidence is inserted before compatible derived game, entity, or performance rows. Duplicate payloads are ignored through a unique idempotency index. No prior provider payload is overwritten.

## 7. Canonical identity architecture

CFBD identity remains provider-specific. CFBD game IDs are not treated as ESPN IDs and are not forced into an ESPN-targeted canonical game row.

The implementation preserves provider event/team identity and keeps provider-separated rows. A future explicit mapping layer may link CFBD and ESPN/TBM identities only when team identity, home/away ordering, kickoff, season/week, and neutral-site evidence support the match.

Missing or ambiguous identity remains explicit. No fuzzy name-only merge is used.

## 8. Team mapping

CFBD team IDs, names, classification, and season context are preserved in entity observations and game evidence. The capture path does not silently map CFBD teams to ESPN/TBM teams.

Mapped-team and unmapped-team totals are not yet production-proven because CFBD entity rows are absent in the production replica. Development currently contains 1,516 CFBD entity observations generated from the bounded game capture; these are provider observations, not a claim that 1,516 unique canonical teams were mapped.

## 9. Game mapping

CFBD games are stored using CFBD provider identity. The bounded capture does not match ESPN event IDs and does not force a canonical cross-provider match.

Development contains 758 CFBD game-evidence rows. These are CFBD-provider game rows, not proven ESPN/TBM cross-provider matches. Production contains 0 CFBD game-evidence rows at the time of this report, so production mapped, unmatched, and ambiguous CFBD game totals are not available.

## 10. Player mapping

The adapter contract preserves CFBD player IDs when supplied, but this task did not create a name-based player merge or claim a complete TBM canonical-player mapping.

Stable provider IDs are available from the CFBD data shape where supplied. A canonical player mapping requires explicit identity evidence across provider ID, name, team, position, season, and mapping state. Name similarity alone is insufficient.

## 11. Historical games

CFBD returned season-based historical game data and the adapter can request season/week game evidence. The capture service intentionally materializes only games within a bounded ±14-day window around capture time when using the normal bulk-season request.

The full season response is retained as one raw payload, while only nearby games are normalized. This prevents uncontrolled historical backfill and reduces accidental use of later information. Historical-game availability therefore does not equal historical PIT safety.

## 12. Team stats

The team-statistics endpoint returned HTTP `200` and is represented in the isolated adapter capability contract. Broader team-stat capture was not implemented in this bounded integration.

The current derived performance rows contain explicitly completed-game points and provider provenance. They do not claim complete season aggregates, opponent-adjusted quality, or a model-ready team-stat history.

## 13. Play-by-play

The CFBD plays endpoint returned HTTP `200`. No broad immutable play-by-play materialization was performed in this task.

The implementation therefore does not claim complete play coverage, complete drive linkage, garbage-time classification, or historical play-level PIT safety. A future capture must preserve game/play/drive identity, period, clock, down, distance, yard line, teams, play type, yards, scoring state, provider timestamps, and any provider-supplied EPA/success fields without inventing missing values.

## 14. EPA

EPA was not activated as a captured or validated feature domain. A successful endpoint response alone does not establish that a provider-supplied EPA field is complete, historically timestamped, or semantically stable.

No TBM-derived EPA was added. No provider EPA was recalculated or reinterpreted.

## 15. Success rate

Success-rate evidence was not activated. Missing success values remain missing rather than being inferred from scores, down-and-distance assumptions, or later aggregates.

## 16. Explosiveness

Explosiveness evidence was not activated. No unsupported explosiveness rating or threshold was synthesized.

## 17. Havoc

Havoc evidence was not activated. The implementation does not claim a complete TFL/sack/forced-fumble/interception/pass-defense component set.

## 18. Line yards

Line-yard evidence was not activated. No line-yard metric was invented from incomplete rushing data.

## 19. Pace

Pace evidence was not activated as a persisted CFBD domain. No plays-per-game, seconds-per-play, or situation-adjusted pace value was synthesized.

## 20. Drives

No standalone CFBD drive-intelligence capture was completed. Existing compatible evidence remains provider-separated and does not imply that drives/game, points/drive, yards/drive, three-and-out rate, turnover-drive rate, red-zone efficiency, or explosive-drive rate are available for CFBD.

## 21. Special teams

Special-teams metrics were not activated. No special-teams quality rating was synthesized from incomplete field-goal, punting, return, field-position, or SP+ components.

## 22. SP+

The CFBD SP+ endpoint returned HTTP `200`. SP+ was not materially captured into the NCAAF intelligence snapshot layer.

If later captured, SP+ must remain an independent provider input with season/effective context and provenance. It must not be treated as the final model or converted directly into a probability.

## 23. CORE/opponent-adjusted data

No distinct CFBD CORE/opponent-adjusted metric contract was verified or captured. The report therefore makes no claim of opponent-adjusted rating coverage.

Any future rating use must be through-week/effective-date constrained and must preserve provider model/version metadata.

## 24. SRS

The CFBD SRS endpoint returned HTTP `200`, but SRS was not captured into canonical intelligence. It remains an available endpoint family, not a production-ready feature domain.

## 25. Elo

The CFBD Elo endpoint returned HTTP `200`, but Elo was not captured into canonical intelligence. It must remain a separate evidence source and must not be blindly averaged with other ratings.

## 26. FPI

The CFBD FPI endpoint returned HTTP `200`, but FPI was not captured into canonical intelligence. No post-cutoff FPI value is eligible for a pregame snapshot.

## 27. Recruiting

The CFBD recruiting endpoint returned HTTP `200`. Recruiting was not materialized into the canonical intelligence path.

Recruiting evidence may support a future early-season prior only after season alignment, effective-date handling, historical availability checks, and PIT review. Recruiting rankings are not probabilities.

## 28. Talent composite

The CFBD talent endpoint returned HTTP `200`. No season-specific talent composite rows were captured into canonical intelligence.

No talent weight or model adjustment was selected.

## 29. Transfers

The initial transfer probe returned HTTP `404`. The adapter records `/player/portal` as the intended CFBD path, but transfer data remains not captured and unavailable for readiness.

No player-impact weight was inferred from transfer information.

## 30. Returning production

The CFBD returning-production endpoint returned HTTP `200`, but no returning-production rows were captured or promoted into canonical intelligence.

No returning-production percentage was invented.

## 31. Rosters

The CFBD roster endpoint returned HTTP `200`. No immutable season/team roster materialization was completed.

A season roster would not be treated as a pregame active roster. Player ID, team, position, class/year, physical fields, jersey, and season would need to be preserved with explicit effective context.

## 32. QB history

CFBD player and roster/statistics endpoints were live-verified, so provider-level QB historical data may be available where player IDs and season statistics are supplied. This task did not complete a dedicated QB-history capture or canonical player mapping.

The implementation preserves the distinction between `KNOWN_STARTER`, `EXPECTED_STARTER`, `ROSTER_QB`, `HISTORICAL_QB`, and `UNKNOWN`. A roster quarterback or season passing leader is not automatically a confirmed starter.

## 33. Pregame starting QB

Timestamped pregame starting-QB verification was not established. This remains a critical blocker:

`MISSING / EXTERNAL_PROVIDER_REQUIRED`

Season passing leaders and roster quarterbacks cannot be substituted for an actual pregame starter designation.

## 34. Injuries

CFBD timestamped pregame injury/availability data was not verified or captured. This remains:

`INJURY_PROVIDER_STILL_REQUIRED`

Missing injury evidence never means healthy.

## 35. Depth charts

CFBD depth-chart/starter-state support was not verified or captured. Depth must remain unsupported rather than being fabricated from roster order.

## 36. Coaches

The CFBD coaches endpoint returned HTTP `200`. Coaching data was not captured into canonical intelligence.

No subjective coaching adjustment, coordinator assumption, continuity score, or tenure weight was added.

## 37. Weather

The CFBD weather endpoint returned HTTP `200`. No CFBD weather payload was captured into canonical intelligence.

Existing Open-Meteo infrastructure remains separate. A future source decision must compare coverage, timestamps, and historical behavior and must exclude postgame weather from pregame snapshots.

## 38. Venues

The CFBD venues endpoint returned HTTP `200`, and CFBD game payloads preserve venue IDs/names when supplied. A complete canonical venue materialization with city/state, coordinates, elevation, indoor/outdoor, and roof fields was not completed.

## 39. FBS/FCS

The capture path normalizes explicit CFBD classification values to `FBS`, `FCS`, `OTHER`, or `UNKNOWN`. It does not infer classification from a team name.

The normalized classification is stored in compatible provider evidence; no full canonical classification inventory was promoted.

## 40. Early-season prior foundation

CFBD provides endpoint families that could support recruiting, talent, returning production, ratings, and historical team evidence. Those endpoint responses were verified, but the complete chronological, versioned, PIT-safe prior foundation was not built.

Therefore a legitimate production early-season prior cannot yet be claimed. The model must not use a later-season aggregate or retrospective rating as if it were known before kickoff.

## 41. Historical PIT classification

CFBD capture timestamps and provider `Date` headers are preserved when available. That is necessary but not sufficient for historical PIT safety.

Retrospective season aggregates, ratings, recruiting, returning production, and roster data are not automatically pregame evidence. Every future snapshot must enforce:

- `captured_at < kickoff`
- provider effective/observed time at or before the snapshot cutoff
- no future week or later-season rating
- no postgame roster/injury state
- no closing market data

This task did not produce a production PIT-safe CFBD cohort.

## 42. Market firewall

CFBD evidence is kept outside the market layer. The compatibility path recursively removes keys matching market, odds, sportsbook, bookmaker, moneyline, spread, price, wager, bet, stake, unit, probability, forecast, projection, recommendation, or expected-score patterns.

Odds API remains downstream market-only. No odds, price, line, wager, unit, probability, expected score, or recommendation enters CFBD sports intelligence.

## 43. Football intelligence schema

The existing immutable `ncaaf-football-intelligence-v1` contract remains the canonical market-free snapshot schema. No incompatible schema change was introduced.

The schema is designed to carry team strength history, advanced offense/defense, pace, EPA, success, explosiveness, havoc, line yards, drives, special teams, QB state, roster, injuries, returning production, talent, recruiting, transfers, coaching, venue, weather, subdivision, prior evidence, readiness, and missingness where legitimately available.

CFBD evidence currently remains provider-separated and has not been wired into ESPN-targeted canonical snapshot domain enrichment.

## 44. Intelligence snapshot counts

Current queried counts:

| Environment | Intelligence snapshots |
|---|---:|
| Development | 1,612 |
| Production replica | 789 |

The 789 production snapshots are the existing NCAAF intelligence foundation and are not proof that CFBD is flowing into them. Production CFBD evidence count is 0.

## 45. READY/PARTIAL/BLOCKED counts

Production inspection found 789 `ncaaf-football-intelligence-v1` snapshots. Their persisted `quality_readiness` values are structured readiness objects whose state is `BLOCKED`; the query returned:

- `READY`: 0 proven
- `PARTIAL`: 0 proven as a separate persisted state
- `BLOCKED`: 789

The observed blockers include missing team performance, unsupported quarterback evidence, missing early-season prior, unsupported roster/injury domains, and unsupported advanced domains. This is an honest blocked state, not a failed attempt to hide missingness.

## 46. FINAL_PREGAME counts

No legitimate production `FINAL_PREGAME` assignment was visible in the inspected production replica. No CFBD-backed production `FINAL_PREGAME` assignment is proven.

The code retains the existing final-window cohort mechanism and strict pre-kickoff checks, but code presence is not counted as production activation.

## 47. Prospective cohort counts

No production `LIVE_SHADOW` or other NCAAF pregame cohort assignment was visible in the inspected production replica query.

The dedicated cycle retains the prospective, no-backfill boundary and can assign `LIVE_SHADOW` only after the activation boundary. Internal prospective evidence is not equivalent to an eventual public champion.

## 48. PIT violations

No new CFBD production PIT result can be claimed because production CFBD rows are absent. Existing NCAAF intelligence verification did not identify a CFBD-backed production PIT cohort.

The implementation preserves strict cutoff checks and rejects post-kickoff evidence from `FINAL_PREGAME`. Historical CFBD data must remain unclassified or non-PIT-safe until its effective chronology is proven.

## 49. Provider health

The Admin readiness response now exposes persisted CFBD health metadata without exposing the key:

- Credential configured boolean
- Raw evidence row count
- Last successful capture
- Endpoint counts

The live CFBD probe was removed from the Admin readiness route to avoid spending provider quota on every admin request.

Latency and HTTP status are available from capability probes and structured client errors. Durable per-call daily/monthly quota counters, auth-error counts, rate-limit-error counts, timeout counts, and payload-validation counts are not yet fully persisted as a provider-health ledger.

## 50. Scheduler health

The dedicated NCAAF evidence cycle performs one bounded CFBD capture per cycle. CFBD failure is isolated and logged; ESPN evidence processing continues.

The cycle retains:

- Process-local single-flight
- Duplicate invocation skip
- Per-game isolation
- Existing bounded concurrency behavior
- Timeout/retry behavior in the CFBD client
- Append-only/idempotent persistence
- Stale-run reconciliation

Production scheduler health is not fully proven for CFBD because the production CFBD evidence count remains 0. The current production evidence-run query returned 31 completed, 46 failed, 145 partial, and 2 running rows; those aggregate states are not evidence of a successful CFBD capture.

## 51. Rate-limit usage

No CFBD rate-limit or quota headers were observed, and no provider account quota was discoverable from the tested responses. Actual daily/monthly call usage is therefore unknown.

The implemented usage policy is conservative:

- One bulk current-season capture per NCAAF cycle
- ±14-day normalization window for ordinary bulk capture
- Raw bulk response retained once per request identity/payload hash
- At most three attempts for `429`/`5xx`
- Exponential delay capped at one second between attempts
- Fifteen-second request timeout
- No live provider probe on every Admin request

An exact monthly call estimate cannot be responsibly reported without a known scheduler cadence and provider quota telemetry.

## 52. ESPN coexistence

ESPN remains the authoritative path for existing schedule/event identity, status, scores, venue/context, and existing completed-game evidence where supported.

CFBD is additive and provider-separated. CFBD failures do not corrupt ESPN evidence or stop the rest of the NCAAF cycle. No forced CFBD-to-ESPN match was added.

Market evidence remains separate and downstream.

## 53. Remaining data gaps

The critical remaining gaps are:

1. Production CFBD schema/code publication and a successful production capture.
2. Durable CFBD provider-health ledger for latency, statuses, auth errors, rate-limit errors, timeouts, validation errors, and measurable call counts.
3. Explicit CFBD-to-TBM team/game/player mapping with safe ambiguity handling.
4. Broad but bounded capture of verified team stats, advanced stats, plays, rosters, player stats, recruiting, ratings, talent, returning production, coaches, and weather.
5. Complete play/drive/EPA/success/explosiveness/havoc/line-yard/pace/special-teams domain validation.
6. Timestamped pregame starting QB.
7. Timestamped pregame injuries/availability.
8. College depth charts/starter state.
9. Historical PIT-safe classification for every candidate feature family.
10. A legitimate early-season prior.
11. Canonical snapshot enrichment using CFBD evidence.
12. Production-proven `FINAL_PREGAME` and prospective cohort assignments.

## 54. Supplemental-provider recommendation

`SUPPLEMENTAL PROVIDER ACCESS REQUIRED` for critical pregame availability domains.

Pursue authenticated commercial NCAA coverage from **SportsDataIO College Football** or **Sportradar NCAAF**, subject to contractually verifying:

- Timestamped pregame starting QB/depth chart
- Timestamped injuries and availability
- Historical roster/state semantics
- Play-by-play completeness
- Historical PIT behavior

SportsDataIO should be pursued as a candidate, not assumed to solve every gap. Do not purchase credentials or fabricate coverage in this task.

CFBD remains useful as an additive source for games, teams, ratings, recruiting, talent, returning production, rosters, plays, coaches, and weather where each payload is separately validated.

## 55. DATA_PIPELINE_READY

`DATA_PIPELINE_READY = false`

Reason: CFBD access and development capture are verified, but CFBD data is not flowing in the inspected production database. Production raw evidence, canonical CFBD evidence, provider health, CFBD-enriched canonical snapshots, and production CFBD `FINAL_PREGAME` are not proven.

## 56. V4_BUILD_READY

`V4_BUILD_READY = false`

Reason: the independent football evidence foundation is not yet complete enough to begin the NCAAF V4 expected-score engine. Critical pregame QB, injury/availability, depth-chart, early-season-prior, broad advanced-stat, chronological PIT, and production snapshot gaps remain.

No V4 model logic was built in #221D.

## 57. Exact blockers if false

The exact blockers are:

- Production publication/capture has not been proven for CFBD; production currently has 0 CFBD evidence rows.
- CFBD-derived evidence is not yet enriched into the canonical NCAAF intelligence snapshot domain payload.
- No safe production team/game/player mapping counts are available.
- Full advanced football domains remain endpoint-verified but not captured/validated.
- Transfers remain unverified after the `/player/portal` probe returned `404`.
- Pregame starting-QB verification is missing.
- Timestamped injury/availability data is missing.
- College depth-chart/starter-state data is missing.
- Early-season prior construction is not yet PIT-safe and production-proven.
- Historical CFBD endpoint availability does not establish retrospective PIT safety.
- Provider-health persistence is incomplete for durable call/error/quota metrics.
- Legitimate production `FINAL_PREGAME` and prospective CFBD-backed cohort assignments are not proven.

## 58. Recommendation for #222

Do **not** begin #222.

First publish the verified CFBD schema and server changes through the normal Replit Publish flow, run a dedicated production CFBD capture, verify raw and canonical counts, prove provider health and scheduler behavior, and enrich only safely mapped CFBD evidence into canonical snapshots.

Then obtain or configure a legitimate supplemental pregame availability provider for QB, injuries, and depth charts, classify historical evidence with strict PIT semantics, and repeat the readiness audit. Only after `DATA_PIPELINE_READY` and `V4_BUILD_READY` are both honestly true should #222 be proposed.

### Completion answer 1

**Was CFBD authentication successful?** Yes. Live authentication succeeded with HTTP `200`.

### Completion answer 2

**Was the key exposed anywhere?** No. The key was used server-side only and was not printed, returned, committed, or exposed to clients.

### Completion answer 3

**What tier/quota is actually observable?** No tier, quota, or quota-reset information was observable. No quota headers were returned in the tested responses.

### Completion answer 4

**Which CFBD endpoints were successfully verified?** Games, teams, conferences, venues, team statistics, advanced team statistics, plays, rosters, player statistics, recruiting, coaches, SP+, Elo, SRS, FPI, talent, returning production, and weather returned HTTP `200`. The transfer probe returned `404` for the initial path.

### Completion answer 5

**How many raw CFBD evidence rows now exist?** Development: 2 rows in `ncaaf_college_football_data_evidence`. Production: 0 rows.

### Completion answer 6

**How many canonical CFBD evidence rows now exist?** Development: 758 CFBD game-evidence rows plus 1,516 CFBD entity observations plus 250 CFBD completed-game performance rows. Production: 0 CFBD game/entity/performance rows. These are provider-specific rows, not proven cross-provider canonical matches.

### Completion answer 7

**How many teams map correctly?** No production CFBD-to-TBM team mapping count is proven. Development has 1,516 provider entity observations, not 1,516 unique canonical team mappings.

### Completion answer 8

**How many teams remain unmapped?** Not measurable from the current provider-separated implementation; no production mapping ledger exists.

### Completion answer 9

**How many games map correctly?** No production CFBD-to-ESPN/TBM game mapping count is proven. Development has 758 CFBD-provider game rows, not cross-provider matches.

### Completion answer 10

**How many remain unmatched/ambiguous?** Not measurable because forced cross-provider matching was intentionally not implemented. Production has 0 CFBD rows.

### Completion answer 11

**Are stable player IDs available?** Yes, CFBD provider player IDs are available where supplied by payloads. A complete canonical player map was not built.

### Completion answer 12

**Is historical game data available?** Yes, season-based CFBD game responses are available. Historical PIT safety is not automatic and full historical materialization was not performed.

### Completion answer 13

**Is complete-enough play-by-play available?** Not proven. The plays endpoint returned `200`, but complete historical play/drive coverage was not captured or validated.

### Completion answer 14

**Is EPA available?** Not proven as a captured, complete, PIT-safe field contract.

### Completion answer 15

**Is success rate available?** Not proven as a captured, complete, PIT-safe field contract.

### Completion answer 16

**Is explosiveness available?** Not proven as a captured, complete, PIT-safe field contract.

### Completion answer 17

**Is havoc available?** Not proven as a captured, complete, PIT-safe field contract.

### Completion answer 18

**Are line yards available?** Not proven. No line-yard metric was captured or synthesized.

### Completion answer 19

**Is pace available?** Not proven as a captured CFBD domain.

### Completion answer 20

**Are drive metrics available?** Not proven as a separately captured and complete CFBD domain.

### Completion answer 21

**Are special-teams metrics available?** Not proven as a captured, complete CFBD domain.

### Completion answer 22

**Is SP+ available?** The endpoint returned HTTP `200`; SP+ is not yet captured into canonical intelligence or proven PIT-safe.

### Completion answer 23

**Is CORE/opponent-adjusted data available?** No distinct CORE/opponent-adjusted contract was verified or captured.

### Completion answer 24

**Is SRS available?** The endpoint returned HTTP `200`; SRS was not captured into canonical intelligence.

### Completion answer 25

**Is Elo available?** The endpoint returned HTTP `200`; Elo was not captured into canonical intelligence.

### Completion answer 26

**Is FPI available?** The endpoint returned HTTP `200`; FPI was not captured into canonical intelligence.

### Completion answer 27

**Is recruiting data available?** The endpoint returned HTTP `200`; recruiting was not materialized into canonical intelligence.

### Completion answer 28

**Is talent composite available?** The endpoint returned HTTP `200`; season-specific talent rows were not captured.

### Completion answer 29

**Is transfer data available?** Not verified. The initial transfer probe returned `404`, and transfer capture remains disabled.

### Completion answer 30

**Is returning production available?** The endpoint returned HTTP `200`; returning-production rows were not captured or promoted.

### Completion answer 31

**Are rosters available?** The endpoint returned HTTP `200`; no immutable roster materialization was completed.

### Completion answer 32

**Can QB historical performance be built?** Potentially from CFBD player/stat data where stable IDs and season rows are supplied, but a dedicated canonical QB-history capture was not completed.

### Completion answer 33

**Can pregame starting QB be verified?** No. This remains `MISSING / EXTERNAL_PROVIDER_REQUIRED`.

### Completion answer 34

**Are timestamped injuries available?** No verified CFBD timestamped pregame injury/availability feed is available. `INJURY_PROVIDER_STILL_REQUIRED`.

### Completion answer 35

**Are college depth charts available?** Not verified or captured.

### Completion answer 36

**Is coaching data available?** The coaches endpoint returned HTTP `200`; coaching data was not captured into canonical intelligence.

### Completion answer 37

**Is weather available?** The weather endpoint returned HTTP `200`; CFBD weather was not captured into canonical intelligence.

### Completion answer 38

**Is FBS/FCS classification available?** Yes, explicit classification values are normalized to `FBS`, `FCS`, `OTHER`, or `UNKNOWN` when supplied. A complete canonical classification inventory was not promoted.

### Completion answer 39

**Can a legitimate early-season prior now be built?** No, not yet. The required chronological, season-specific, PIT-safe evidence foundation is not production-proven.

### Completion answer 40

**Are historical PIT semantics sufficient?** No. Capture timestamps exist, but endpoint availability and capture time alone do not prove historical effective-time semantics.

### Completion answer 41

**Can market data enter sports intelligence?** No. The market firewall excludes market-shaped fields, and Odds API remains downstream market-only.

### Completion answer 42

**How many production intelligence snapshots exist?** 789 in the inspected production replica.

### Completion answer 43

**How many are READY?** 0 proven. The inspected production snapshots were blocked.

### Completion answer 44

**How many are PARTIAL?** 0 proven as a separate persisted readiness state in the inspected production data.

### Completion answer 45

**How many are BLOCKED?** 789 based on the inspected production `quality_readiness` state.

### Completion answer 46

**How many legitimate FINAL_PREGAME assignments exist?** 0 visible in the inspected production replica; no CFBD-backed production assignment is proven.

### Completion answer 47

**How many internal prospective cohort assignments exist?** 0 visible in the inspected production replica query; no CFBD-backed production assignment is proven.

### Completion answer 48

**Were any PIT violations detected?** No new CFBD production PIT result was detected or claimable because production CFBD rows are absent. Strict cutoff enforcement remains in code and tests.

### Completion answer 49

**Is the NCAAF scheduler healthy?** The dedicated cycle and its single-flight/isolated-failure behavior are implemented and locally tested. CFBD production scheduler health is not proven because production CFBD row count is 0.

### Completion answer 50

**Is another provider still required?** Yes, for timestamped pregame QB, injuries/availability, and depth-chart/starter-state coverage; additional coverage may also be needed for complete play-level historical evidence.

### Completion answer 51

**If yes, exactly which domains remain missing?** Pregame starting QB, timestamped injuries/availability, depth charts, broad validated play/drive/advanced metrics, complete PIT-safe historical semantics, early-season prior inputs, safe canonical mapping, and production CFBD capture/enrichment.

### Completion answer 52

**Should SportsDataIO commercial access be pursued?** Yes, as a candidate supplemental provider, subject to contractual verification of pregame QB, injuries, depth charts, historical PIT semantics, and play-by-play coverage. No credentials were purchased or fabricated.

### Completion answer 53

**Is DATA_PIPELINE_READY true or false?** False.

### Completion answer 54

**Is V4_BUILD_READY true or false?** False.

### Completion answer 55

**If V4_BUILD_READY is false, what exact blockers remain?** Production CFBD capture is unproven; CFBD is not enriched into canonical snapshots; team/game/player mapping is incomplete; advanced domains are not broadly captured; QB starter, injury, and depth data are missing; early-season priors and historical PIT semantics are not proven; durable provider-health metrics are incomplete; and production `FINAL_PREGAME`/prospective CFBD cohorts are not proven.

### Completion answer 56

**If true, should we begin #222?** Not applicable because `V4_BUILD_READY = false`. Do not begin #222.

### Completion answer 57

**Did this task alter any current NCAAF forecast?** No.

### Completion answer 58

**Did this task alter NFL?** No. CFBD integration is NCAAF-specific.

### Completion answer 59

**Did this task alter any other sport?** No. MLB, NBA, WNBA, NHL, NCAAMB, Soccer, and UFC behavior was not changed.

### Completion answer 60

**Did this task build any NCAAF V4 model logic?** No. No NCAAF V4 probabilities, expected points, recommendations, units, wagers, weights, or model logic were built.

## Verification record

The following checks were run:

- Full API Vitest suite: **54 files passed, 345 tests passed**
- API TypeScript typecheck: **passed**
- API production build: **passed**
- Admin TypeScript typecheck: **passed**
- Admin production build: **passed**
- `git diff --check`: **passed**
- Development schema push: **succeeded**
- Live CFBD authentication and representative endpoint probes: **succeeded except the initial transfer probe, which returned HTTP `404`**
- Development CFBD capture: **completed**
- Production read-only verification: **completed; production CFBD rows currently 0**

No new production deployment was performed by the agent. Production schema and code publication must use the normal Replit Publish flow.