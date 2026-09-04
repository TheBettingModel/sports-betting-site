# NCAAF Historical Atomic Replay — 2026-09-04

## 1. Executive summary

The 2023–2025 core historical foundation is implemented and populated in development from immutable CFBD atomic game records. The artifact contains 2,398 completed FBS-vs-FBS games replayed strictly by kickoff and stable game ID. Pregame features are frozen before each target is attached and before game state is advanced.

Development verification found zero PIT violations, zero market-firewall violations, and zero duplicate game rows. Production remains pending until the new build is published and the same bounded three-request backfill is executed there.

## 2–4. Historical source audit, availability, and PIT classes

The audit made 48 bounded logical calls (52 transport attempts). It did not persist payloads.

| Domain | 2023 | 2024 | 2025 | Temporal decision | PIT |
|---|---:|---:|---:|---|---|
| Games | 3,734 | 3,801 | 3,831 | Stable atomic event IDs, kickoff, teams, final result | B |
| Plays, representative week 1 | 28,872 | 31,168 | 33,449 | Atomic game/play IDs; query each week for exact coverage | B |
| Season team stats | 8,376 | 8,442 | 8,568 | Retrospective season aggregate | C |
| Advanced team stats | 133 | 134 | 136 | Retrospective season aggregate | C |
| Player season stats | timeout | 135,108 | 141,519 | No per-game effective timestamp | C |
| Rosters | 22,465 | 22,843 | 30,070 | Season/year only; no pregame snapshot proof | C |
| SP+ | 134 | 135 | 137 | Season/year only | C |
| Elo feed | 133 | 134 | 136 | Season/year only; TBM replay Elo used instead | C |
| SRS | 261 | 265 | 266 | Season/year only | C |
| FPI | 133 | 134 | 136 | Season/year only | C |
| Recruiting | 4,166 | 4,236 | 4,120 | Annual reference; exact pregame state unproven | C |
| Talent | 238 | 134 | 134 | Annual reference; exact pregame state unproven | C |
| Returning production | 131 | 133 | 134 | Season reference; publication timing unproven | C |
| Coaches | 143 | 152 | 161 | No effective timestamp in sampled row | C |
| Transfers | 2,502 | 3,378 | 4,499 | Mutable/late-reported personnel history | D |

Teams (138), conferences (256), and venues (852) are current reference feeds with no historical time key. They are not treated as historical snapshots. The only failed audit call was 2023 player season stats: `CFBD request timed out` after two retries.

## 5. Backfill architecture

- Historical work is manual-only and never acquires the live NCAAF advisory lock.
- Core ingestion is exactly one bulk `games?year=` request per season: three requests total.
- Optional plays are separately phased in 16-week season batches.
- Secondary aggregates are separately phased and explicitly C/D.
- Raw and normalized evidence are append-only and payload-hash idempotent.
- Replay and materialization use deterministic versioned cursors and batches of at most 500 rows.

## 6–7. Canonical identity and atomic game evidence

Historical canonical identity is the exact provider-native CFBD game/team ID. No fuzzy name mapping or ESPN dependency is used. All 11,366 returned games were normalized without malformed rows. Eligibility requires the provider's exact `fbs` classification on both ordered sides, completion, stable IDs, kickoff, and final scores.

## 8–10. Team performance, PBP, and QB/player history

The production-eligible core currently uses only prior atomic score results. Season-to-date offense and defense are points scored/allowed; optional play-by-play, team-game efficiency, and player/QB history remain unmaterialized. Retrospective season aggregates and player-season rows are not promoted to pregame evidence. Confirmed pregame starter remains unsupported.

## 11. Chronological replay methodology

Games sort by kickoff and then stable provider event ID. For each game:

1. Load state built only from earlier completed games.
2. Freeze context, season-to-date, rolling, prior-season, Elo, and opponent-adjusted state.
3. Attach outcome targets.
4. Advance both teams' state and Elo.

The persisted cutoff is kickoff minus one millisecond. Same-game outcome fields never enter the feature object.

## 12–17. Reconstructed state

- Offense: prior points per game, last 3, and last 5.
- Defense: prior points allowed per game, last 3, and last 5.
- Prior season: completed prior-season scoring and points-allowed summaries.
- Elo: initialized at 1500 each season and snapshotted before each update.
- Opponent adjustment: uses only each opponent's offense/defense known at that earlier game's kickoff.
- Context: home-field versus neutral site.

## 18–24. Optional priors and context decisions

SP+/FPI/SRS, talent, recruiting, returning production, and coaching remain C until an exact historical publication/effective boundary is proven. Transfers remain D. Venue/travel is not yet derived. Historical observed weather is omitted because it is not a historical pregame forecast. None of these optional omissions block the core artifact.

## 25–26. Training artifact and dataset counts

Artifact key: `ncaaf-v4-training-foundation-v2`

Schema: `ncaaf-chronological-team-game-v2`

| Season | Provider games | FBS-vs-FBS PIT-safe rows |
|---|---:|---:|
| 2023 | 3,734 | 792 |
| 2024 | 3,801 | 798 |
| 2025 | 3,831 | 808 |
| **Total** | **11,366** | **2,398** |

Exact team IDs represented: 136. Duplicate artifact rows: 0.

## 27. Feature coverage

| Family | A | B | C | D | Missing |
|---|---:|---:|---:|---:|---:|
| Score-derived offense/defense | 0% | 93.37% | 0% | 0% | 6.63% first-game rows |
| Pregame Elo | 0% | 100% | 0% | 0% | 0% |
| Opponent adjustment | 0% | 93.37% | 0% | 0% | 6.63% |
| Prior-season state | 0% | 66.97% | 0% | 0% | 33.03% |
| Home/neutral | 100% | 0% | 0% | 0% | 0% |
| QB history | 0% | 0% | 0% | 0% | 100% |
| Talent/recruiting/returning production/coaching | 0% | 0% | available research rows | 0% | not in artifact |
| Travel/weather forecast | 0% | 0% | 0% | 0% | 100% |

Counts underlying the percentages: 2,239 rows have prior-game offense/defense and opponent-adjusted state; 1,606 have at least one ordered side with prior-season state.

## 28–29. Leakage audit and market firewall

- Features frozen before targets: 2,398
- State updates after targets: 2,398
- Post-kickoff PIT evidence accepted: 0
- Invalid PIT evidence accepted: 0
- Duplicate rows: 0
- PIT violations: 0
- Market leakage violations: 0

The recursive production market firewall was run against every persisted feature object. Outcome margin and total points exist only in `targets`.

## 30. Representative forensic games

| Season | Event | Kickoff | Pregame samples | Prior-season samples | Pregame Elo | Target excluded from features | Future excluded |
|---|---|---|---|---|---|---|---|
| 2023 | 401525434 | 2023-08-26 18:30Z | 0/0 | 0/0 | 1500/1500 | TRUE | TRUE |
| 2024 | 401635525 | 2024-08-24 16:00Z | 0/0 | 12/13 | 1500/1500 | TRUE | TRUE |
| 2025 | 401756846 | 2025-08-23 16:00Z | 0/0 | 12/13 | 1500/1500 | TRUE | TRUE |

Each cutoff is one millisecond before kickoff. Later-season rows provide rolling and season-to-date proof; the audit counted 2,239 such rows.

## 31. Walk-forward recommendation

No random split:

- Train: all 2023 plus 2024 regular/postseason, 1,590 rows.
- Validation: 2025 weeks 0–8.
- OOS: remaining 2025 games.
- Prospective confirmation: untouched 2026 frozen snapshots.

Exact 2025 validation/OOS counts should be fixed by week before #222 begins. No model was trained in this task.

## 32. Production backfill status

Development: complete, 2,398 rows.

Production at last query: 0 rows. The deployed build is healthy but predates this implementation. Publish and bounded production execution are still required before #221I can be closed.

## 33–34. Live scheduler and NFL isolation

Historical ingestion/replay is not scheduled and does not use the live NCAAF global lock. NFL code, tables, weights, calibration, feature configuration, and learning state were not changed.

## 35. Readiness matrix

| Gate | Development | Production-verified |
|---|---|---|
| HISTORICAL_ATOMIC_BACKFILL_READY | TRUE | FALSE pending publish/backfill |
| HISTORICAL_PIT_FOUNDATION_READY | TRUE | FALSE pending production verification |
| DATA_PIPELINE_READY | TRUE | FALSE pending production execution |
| V4_BUILD_READY | TRUE with optional limitations | FALSE until production verification |
| V4_VALIDATION_READY | TRUE with chronological split | FALSE until production verification |
| FULL_LIVE_PUBLICATION_DATA_READY | FALSE | FALSE |

## 36. Provisional decision

Pending mandatory production verification:

**C. #221I PARTIAL — ONE SPECIFIC RECOVERABLE HISTORICAL BLOCKER REMAINS**

The one blocker is publishing this build and running the bounded three-request production atomic backfill plus deterministic materialization. Once production reproduces 792/798/808 rows with zero PIT and market violations, the expected decision is:

**B. #221I CORE FOUNDATION READY — BEGIN #222 WITH DOCUMENTED OPTIONAL DATA LIMITATIONS**

Production-eligible #222 families would then be score-derived prior offense/defense, rolling form, prior-season state, TBM pregame Elo, simple chronological opponent adjustment, and home/neutral context. PBP/team-game efficiency and QB history are optional follow-ons. Retrospective ratings/aggregates remain research-only. Confirmed starters, injuries, and depth/availability remain live-publication eligibility features.