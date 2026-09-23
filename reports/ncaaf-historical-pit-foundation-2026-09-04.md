# #221H-PROD — NCAAF Historical PIT Foundation Production Verification

**Verification date:** 2026-09-04  
**Environment:** Live production database, published deployment, deployment logs,
and current repository  
**Repository commit:** `fb9239519d84300f0aa9386e92c06f6f7167e163`  
**Commit time:** 2026-09-04T00:45:18Z  
**Commit subject:** `Published your App`

## Final status

| Decision | Result |
|---|---:|
| DEPLOYED | YES |
| HISTORICAL_PIT_FOUNDATION_READY | FALSE |
| DATA_PIPELINE_READY | FALSE |
| V4_BUILD_READY | FALSE |
| V4_VALIDATION_READY | FALSE |
| FULL_LIVE_PUBLICATION_DATA_READY | FALSE |
| Total PIT-safe training games | 0 |
| Seasons in training artifact | None |
| Final decision | **D. HISTORICAL FOUNDATION INSUFFICIENT — MORE PROSPECTIVE EVIDENCE REQUIRED** |

## Status legend

- **IMPLEMENTED:** The repository contains the contract or process.
- **DEPLOYED:** The production schema/runtime contains it.
- **PRODUCTION VERIFIED:** Live production rows/logs prove it operated correctly.
- **NOT VERIFIED:** Present but not proven by a completed live cycle.
- **BLOCKED:** Required evidence is absent or a production health gate fails.

## 1. Deployment

**Status: DEPLOYED**

- Deployment type: autoscale
- Visibility: public
- Current build status: successful
- Historical table `ncaaf_historical_training_rows`: exists in production
- Required evidence, mapping, performance, snapshot, and cohort tables: exist
- Historical builder: available and executed at startup
- Historical artifact key: `ncaaf-historical-2023-2026-pit-v1`
- Historical schema version: `ncaaf-historical-team-game-v1`
- Startup schema/migration failures observed: none
- Current scheduler: operational, but run-finalization health is not acceptable

Production startup logged the historical materializer at
2026-09-04T00:46:21.506Z.

## 2. Historical PIT foundation

**HISTORICAL_PIT_FOUNDATION_READY = FALSE**

| Season | PIT-safe training games |
|---|---:|
| 2023 | 0 |
| 2024 | 0 |
| 2025 | 0 |
| 2026 | 0 |

- Total historical games submitted to the builder: 100
- Total PIT-safe training games: 0
- FBS-vs-FBS training games: 0
- FBS-vs-FCS training games: 0
- Excluded: 100

Production materializer exclusions:

| Reason | Count |
|---|---:|
| Incomplete result | 92 |
| No eligible pregame lineage | 8 |

PIT evidence excluded by the materializer:

| PIT class | Excluded records |
|---|---:|
| A | 0 |
| B | 8,178 |
| C | 46 |
| D | 0 |

The 8,178 B-class records did not satisfy the strict pregame chronology required
for the target games. They were correctly excluded rather than relabeled.

## 3. Canonical historical team coverage

Live production mapping currently contains only season 2026:

- Historical teams encountered: 693
- Historical teams mapped: 138
- Current FBS teams encountered: 138
- Current FBS teams mapped: 138
- Current FBS mapping: 100%
- Overall encountered-team mapping: 19.91%

Complete FCS coverage is not required. Current FBS identity coverage is adequate
for current-team identity, but it does not establish historical 2023-2025
team-season coverage.

## 4. Historical game mapping

- Games considered: 760
- Games mapped: 100
- Games training-eligible: 0
- Games excluded from mapping: 660
- Mapping percentage: 13.16%

Mapping outcomes:

| Failure | Count |
|---|---:|
| Unmapped ordered team | 659 |
| Ambiguous team | 0 explicitly recorded |
| Kickoff issue | 0 explicitly recorded |
| Unique candidate not found after team mapping | 1 |
| Missing/incomplete result after mapping | 92 |
| PIT failure after mapping and result check | 8 |
| Other | 0 |

## 5. Atomic pregame reconstruction

**Status: BLOCKED**

No production training rows exist, so representative reconstructed games for
2023, 2024, 2025, or 2026 cannot be shown. There is no target-game row whose
cutoff, prior-game window, and exclusion lineage can be validated end to end.

The materializer did enforce the atomic rule by rejecting all candidates. This
proves fail-closed behavior, not a usable reconstruction foundation.

## 6. Season-to-date team performance

Production has 1,928 normalized 2026 team-game performance rows covering 383
provider teams and 925 provider games. Source-field coverage is:

| Metric | Status | Source-row coverage |
|---|---|---:|
| Points scored | AVAILABLE | 100.00% |
| Points allowed | AVAILABLE | 100.00% |
| Scoring margin | AVAILABLE when both scores exist | 100.00% |
| Yards/play | PARTIAL | at most 0.83% typed yards; plays 0.00% |
| Yards allowed/play | PARTIAL | at most 0.83% typed yards |
| Passing efficiency | MISSING from verified typed foundation | 0% verified |
| Rushing efficiency | MISSING from verified typed foundation | 0% verified |
| Turnovers | PARTIAL | 0.83% |
| PPA | PARTIAL | 16-team advanced domain only |
| Success metrics | PARTIAL | 16-team advanced domain only |
| Explosiveness | PARTIAL | 16-team advanced domain only |
| Pace | PARTIAL | 16-team advanced domain only |
| Drive efficiency | MISSING from verified artifact | 0% verified |

These are source-data observations. Coverage in the PIT-safe training artifact
is 0% for every metric because the artifact has no rows.

## 7. Rolling performance

**Status: BLOCKED**

No last-3, last-5, season-to-date, or prior-season training rows are production
verified. With no 2023-2025 evidence and no eligible target rows, no rolling
window can be proven to terminate before its target kickoff.

## 8. Opponent adjustment

**OPPONENT_ADJUSTMENT_READY = FALSE**

No chronological opponent-strength sequence exists in the training artifact.
Final-season ratings are not entering training because no rows enter training,
but no usable leakage-safe opponent adjustment has been demonstrated.

## 9. Pregame Elo

**PREGAME_ELO_READY = FALSE**

Only 16 teams have 2026 Elo domain evidence. No production artifact proves:

- a pregame frozen rating;
- a postgame update;
- a stored formula/version;
- exclusion of the target result.

## 10. Other ratings

| Rating | Production classification | Coverage |
|---|---|---:|
| SP+ | PIT B | 139 rows / 138 teams, 2026 only |
| SRS | MISSING as a verified historical sequence | 0% |
| FPI | PIT C | 138 teams, 2026 only |

FPI is not promoted into A/B training features. SP+ is a usable source prior only
when its target-game chronology can be established; no training rows currently
prove that chronology.

## 11. Preseason / early-season prior

**EARLY_SEASON_PRIOR_FOUNDATION_READY = FALSE**

| Input | Production coverage/status |
|---|---|
| Prior-season performance | MISSING for 2023-2025 training chronology |
| Pregame Elo | 16 teams; not ready |
| Talent | 138 teams, PIT C, 2026 only |
| Recruiting | 7,974 rows, 13 linked teams, PIT C |
| Returning production | 136 teams, PIT C |
| Coaching continuity | 138 records, PIT B; no verified historical tenure sequence |
| QB continuity | MISSING from training artifact |
| Conference/subdivision | Present as source evidence; historical sequence not verified |

No weights were created.

## 12. Historical QB evidence

**HISTORICAL_QB_EVIDENCE = MISSING**

- QB rows in historical training artifact: 0
- Stable player/team/game chronology in artifact: 0%
- Attempts, completions, yards, YPA, TD, INT, rushing, PPA, games played,
  and continuity: 0% artifact coverage

**CONFIRMED_PREGAME_STARTER = UNSUPPORTED**

QB may remain optional for initial V4 construction, but there is currently no
usable historical QB feature family.

## 13. Talent, recruiting, and returning production

| Domain | Coverage | PIT | Eligible now |
|---|---:|---|---|
| Talent | 138 teams, 2026 | C | No |
| Recruiting | 7,974 rows; 13 linked teams | C | No |
| Returning production | 136 teams, 2026 | C | No |

No later-season information was admitted into the A/B training artifact.

## 14. Coaching

- Team-season records: 138
- Seasons: 2026 only
- PIT class: B
- Coach-tenure coverage: not verified
- Effective state before historical kickoff: not verified

**Status: PARTIAL source evidence, MISSING training-artifact coverage**

## 15. Home, travel, and venue

Production game evidence for 2026:

- Games: 1,899
- Kickoff present: 1,899 (100%)
- Venue present: 1,894 (99.74%)
- Neutral: 37
- Non-neutral: 1,862
- Travel distance: not verified
- Timezone change: not verified
- Altitude: not verified

Artifact coverage remains 0%.

## 16. Weather

**HISTORICAL_PREGAME_WEATHER = MISSING**

Nine 2026 B-class weather rows exist as source evidence, but no training row
proves that a pregame forecast was frozen before a target kickoff. Observed
historical weather is not treated as forecast weather.

**IS WEATHER REQUIRED FOR INITIAL V4 = NO**

## 17. Training artifact

**Status: DEPLOYED, PRODUCTION VERIFIED EMPTY**

- Artifact key: `ncaaf-historical-2023-2026-pit-v1`
- Schema version: `ncaaf-historical-team-game-v1`
- Builder/report version: current published #221H implementation
- Rows: 0
- Seasons: 0
- Teams: 0
- Games: 0
- Startup materialization timestamp: 2026-09-04T00:46:21.506Z
- Attempted inserts: 0
- Inserted: 0
- Already materialized: 0

The schema enforces one row per canonical target game, but no row exists to
verify the populated-row contract.

## 18. Training feature groups

Because the training artifact has zero rows:

| Feature group | Coverage | PIT A | PIT B | PIT C | PIT D | Missing |
|---|---:|---:|---:|---:|---:|---:|
| Team true talent | 0% | 0% | 0% | 0% | 0% | 100% |
| Offense | 0% | 0% | 0% | 0% | 0% | 100% |
| Defense | 0% | 0% | 0% | 0% | 0% | 100% |
| QB historical | 0% | 0% | 0% | 0% | 0% | 100% |
| Talent | 0% | 0% | 0% | 0% | 0% | 100% |
| Returning production | 0% | 0% | 0% | 0% | 0% | 100% |
| Recruiting | 0% | 0% | 0% | 0% | 0% | 100% |
| Coaching | 0% | 0% | 0% | 0% | 0% | 100% |
| Matchup | 0% | 0% | 0% | 0% | 0% | 100% |
| Home | 0% | 0% | 0% | 0% | 0% | 100% |
| Travel | 0% | 0% | 0% | 0% | 0% | 100% |
| Weather | 0% | 0% | 0% | 0% | 0% | 100% |

## 19. Targets

The artifact has zero populated targets:

- Home points: 0
- Away points: 0
- Margin: 0
- Total: 0
- Home win: 0

The builder rejected 92 incomplete outcomes and did not attach any target before
feature eligibility. Target-after-freeze behavior is implemented but cannot be
production verified on a populated row.

## 20. Leakage audit

For the existing market-free feature snapshot table:

| Check | Violations |
|---|---:|
| Snapshot cutoff at/after kickoff | 0 |
| Evidence modeled after snapshot cutoff | 0 |
| Forbidden market-shaped keys in feature snapshots | 0 |
| FINAL_PREGAME assigned at/after kickoff | 0 |

For the historical training cohort:

| Check | Violations |
|---|---:|
| Target-game-stat leakage | 0 |
| Future-game leakage | 0 |
| Future-week rating leakage | 0 |
| Post-cutoff evidence leakage | 0 |
| Future roster leakage | 0 |
| C/D evidence entering A/B features | 0 |
| Sportsbook/market leakage | 0 |

**TOTAL VIOLATIONS = 0**

The historical result is vacuous because the cohort is empty. It proves no unsafe
row entered, not that safe populated rows are available.

## 21. Market firewall

No forbidden key was found in the 2,407 existing
`ncaaf-market-free-v1` feature snapshots. The historical artifact has zero rows.

The repository's normalized exact-key firewall is deployed. However, live
production has not created a new canonical v2 snapshot after publication, so the
new path is not production verified. Existing source payloads contain the
legitimate nested football metric `defense.havoc.total`; the current exact leaf
key `total` rule can reject that path. The local runtime has emitted that exact
rejection, while deployment-log search found no production occurrence yet.

This is a **NOT VERIFIED / latent collision**, not permission to weaken the
sportsbook firewall.

## 22. Current prospective pipeline

- Canonical v2 snapshots: 661
- Canonical v2 with CFBD team performance: 0
- READY: 0
- PARTIAL: 0
- BLOCKED: 661
- LIVE_SHADOW: 650
- FINAL_PREGAME: 1
- Latest canonical v2 timestamp: 2026-09-03T23:34:55.840756Z
- Latest cohort assignment: 2026-09-03T21:55:09.229Z

No canonical v2 snapshot newer than the 2026-09-04T00:45 publication was present
at verification time. #221H prospective snapshot behavior is therefore not
production verified.

## 23. FINAL_PREGAME

- Existing assignments: 1
- New assignments since publication: 0
- Backfilled assignments detected: 0
- Post-kickoff assignments detected: 0
- 45-minute cutoff violations detected: 0

Existing assignment timing remains intact. Database rows do not provide an
update-history ledger, so physical immutability after publication is not
independently provable beyond unchanged counts/timestamps.

## 24. Scheduler

The historical materializer completed quickly enough to log at startup and did
not await the live run. It processed 100 candidate games and inserted zero rows.

Evidence-run state at verification:

- Completed: 31
- Partial: 147
- Failed: 55
- Running: 1
- Stale running at query time: 0
- Latest completed: 2026-09-03T15:05:22.004Z
- Latest partial: 2026-09-03T21:55:08.831Z
- Latest failed: 2026-09-04T00:45:05.385Z
- Current run started: 2026-09-04T00:52:02.251Z
- Most recent completed useful duration: 43.13 minutes

Multiple preceding runs exceeded the 30-minute stale threshold and were
reconciled as FAILED. The DB-backed lock prevents duplicate ownership, but the
critical cycle remains too slow to call scheduler health satisfactory.

## 25. Evidence-run finalization

**RUN_FINALIZATION_HEALTHY = FALSE**

Production contains repeated stale-running reconciliations. The newest run was
still RUNNING approximately 11 minutes after capture began and was not stale at
the observation point, but no completed post-publication cycle was available.
Consecutive healthy terminal cycles were not demonstrated.

## 26. NFL and other-sport isolation

- Repository working tree contained no NFL, MLB, or other-sport modifications
  from this verification.
- The published #221H implementation is scoped to NCAAF historical services and
  additive NCAAF schema.
- Legacy NCAAF actionable recommendations in production: 0.
- No model state, promotion state, public wager state, or other sport was changed
  during verification.

## 27. V4 construction readiness

**V4_BUILD_READY = FALSE**

The reason is not missing optional QB, weather, injury, or depth-chart data. The
core expected-score foundation itself is absent:

- zero PIT-safe historical games;
- zero chronological offense/defense rows;
- zero opponent-adjusted rows;
- zero pregame Elo sequence;
- zero training targets attached to eligible feature rows;
- no multi-season train/validation boundary.

## 28. V4 validation readiness

**V4_VALIDATION_READY = FALSE**

No chronological split is currently possible. A random split is prohibited.

Minimum prospective foundation recommended before reassessment:

- At least **1,000 PIT-safe FBS-vs-FBS games**;
- At least **two complete seasons** or equivalent chronological eras;
- At least **10 regular-season weeks per included season**;
- At least **95% of current FBS teams canonically mapped**;
- At least **90% two-team coverage** for points, opponent points, plays, yards,
  turnovers, home/away/neutral, and kickoff/cutoff lineage;
- At least **80% coverage** for one advanced efficiency family such as PPA or
  success rate;
- **100%** of included evidence effective/captured before target cutoff;
- **0** market, future-game, target-game, C/D-to-A/B, or post-cutoff violations.

At 1,000 games, a prospective structure could reserve approximately:

- first 600 chronological games for training;
- next 200 for validation;
- final 200 untouched for out-of-sample evaluation;
- rolling-origin/walk-forward folds inside the first 800.

Season boundaries are preferred over raw counts. If only 2026 accumulates,
hold out the final chronological segment and continue through 2027 before
claiming multi-season validation.

## 29. Readiness matrix

**HISTORICAL_PIT_FOUNDATION_READY = FALSE**  
The deployed artifact is empty and represents no seasons.

**DATA_PIPELINE_READY = FALSE**  
Schema and fail-closed materialization work, but canonical performance remains
missing and post-publication run finalization is not proven.

**V4_BUILD_READY = FALSE**  
Core offense, defense, matchup, and target rows are absent—not merely optional
supplemental inputs.

**V4_VALIDATION_READY = FALSE**  
There is no chronological sample to split or walk forward.

**FULL_LIVE_PUBLICATION_DATA_READY = FALSE**  
The model is not constructible or validated, and live eligibility supplements
remain incomplete.

## 30. Optional-data release distinction

Missing confirmed starting QB, injuries, depth charts, and weather do not by
themselves block V4 construction. They currently affect:

- model construction: optional, except QB history may improve accuracy;
- historical validation: optional/missing indicators are acceptable;
- specific-game eligibility: potentially required for high-confidence release;
- full public publication: unresolved live availability can require
  fail-closed eligibility.

The current FALSE build decision is caused by missing core chronological
offense/defense/target evidence.

## 31. Final decision

**D. HISTORICAL FOUNDATION INSUFFICIENT — MORE PROSPECTIVE EVIDENCE REQUIRED**

## 32. Required prospective accumulation

Before another V4 readiness decision:

- Minimum games: 1,000 PIT-safe FBS-vs-FBS games
- Minimum weeks: 20 total regular-season weeks spanning at least two seasons
- Minimum team coverage: 95% of FBS teams mapped; 90% two-team core-feature
  coverage per eligible game
- Minimum core feature coverage: 90%
- Minimum advanced feature coverage: 80% for at least one stable efficiency
  family
- PIT and market violations allowed: 0

Historical reconstruction is insufficient because all existing normalized CFBD
evidence is season 2026 and the retrospective records fail the target-game
pregame chronology gate. The system must accumulate genuine prospective
snapshots or obtain a separately proven archived pregame source; chronology
cannot be repaired by relabeling capture time.

## 33. Next action boundary

Do not begin #222, train a model, promote a challenger, enable public NCAAF
wagers, or modify another sport. Continue prospective collection and reassess
only after the quantitative thresholds above are met or a legitimate archived
pregame source supplies equivalent coverage.
