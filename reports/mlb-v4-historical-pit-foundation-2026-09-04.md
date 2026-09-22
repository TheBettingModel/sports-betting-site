# TASK #224B — MLB V4 HISTORICAL PIT FOUNDATION REPORT

## 1. Final classification

**C — PARTIAL FOUNDATION**

The development database now contains a large, sealed, chronological MLB score/offense foundation, but it is **not training-safe** and is **not a complete MLB V4 core dataset**. Authoritative historical completion times are absent, so all 18,786 feature rows retain an explicit `NORMAL_GAME_PROXY` completion boundary. Core-eligible games: **0**. Enhanced-eligible games: **0**.

## 2. Scope completed

Implemented additive MLB research infrastructure for 2023 through the September 4, 2026 retrieval cutoff:

- canonical game and team identity ledgers;
- versioned team-game offense/environment rows;
- separate immutable outcome rows;
- explicit exclusions and missingness;
- sealed source/foundation manifest;
- checksum-bound chronological split assignments;
- deterministic persisted-data audit.

No model was trained, tuned, calibrated, promoted, deployed, or published.

## 3. Boundaries preserved

The diff does not modify:

- production champion `tbm-mlb-moneyline-v1`;
- shadow V4/V4.1 scoring, clamps, priors, weights, or calibration;
- production pick persistence or the global six-pick cap;
- NCAAF services, routes, schemas, hashes, schedules, or UI behavior;
- push notifications;
- Git history or the protected contaminated ref;
- Apple, EAS, Expo signing, or mobile release configuration;
- production database data.

## 4. Existing architecture reused

The existing live-forward MLB PIT design remains intact. The new historical structures are additive and isolated from production reads. Existing V4/V4.1 code was used only as an architectural reference; no production or shadow forecast path imports the new historical foundation.

## 5. New historical structures

Added development schema for:

1. sealed historical artifact manifests;
2. canonical historical games;
3. deterministic team identity by official MLB numeric ID;
4. versioned chronological team-game feature rows;
5. separate final outcome rows;
6. exclusion/quarantine evidence;
7. immutable chronological split assignments bound to the foundation checksum.

## 6. Source inventory

Source: public MLB Stats API schedule endpoint with team, probable-pitcher, and linescore hydration.

| Season | Requested range | Parsed provider rows |
|---|---:|---:|
| 2023 | Mar 1–Nov 30 | 2,517 |
| 2024 | Mar 1–Nov 30 | 2,512 |
| 2025 | Mar 1–Nov 30 | 2,511 |
| 2026 | Mar 1–Sep 4 | 2,152 |
| **Total** |  | **9,692** |

Two returned rows carried a season label outside their requested season and were ignored. The in-season source population was 9,690 rows.

## 7. Source capability conclusion

The schedule endpoint can reconstruct official game/team/player IDs, scheduled first pitch, game type, venue, final score, innings, doubleheader metadata, postseason status, and postgame probable-pitcher identity.

It does **not** provide authoritative completion times in the recovered cohort, does not prove when probable pitchers became known, and does not supply historically timestamped confirmed lineups or weather forecasts.

## 8. Recovered canonical games

| Season | Admitted final games | Partial core candidates | Core eligible | Enhanced eligible | Quarantined unique games |
|---|---:|---:|---:|---:|---:|
| 2023 | 2,425 | 2,347 | 0 | 0 | 46 |
| 2024 | 2,435 | 2,353 | 0 | 0 | 38 |
| 2025 | 2,443 | 2,363 | 0 | 0 | 34 |
| 2026 | 2,090 | 2,013 | 0 | 0 | 35 |
| **Total** | **9,393** | **9,076** | **0** | **0** | **153** |

The 317 admitted but non-candidate games fail early-season sample gates.

## 9. Team-game row counts

- Canonical games: **9,393**
- Team-game feature rows: **18,786**
- Separate outcome rows: **9,393**
- Duplicate persisted `(game, team side)` rows: **0**
- Empty compatibility target objects in features: **18,786**
- Outcomes embedded in feature payloads: **0**

## 10. Identity coverage

Identity authority is the official numeric MLB Stats API ID only.

- Resolved team identities: **30 per season**, **120 season-team rows**
- Unresolved admitted teams: **0**
- Fuzzy name/abbreviation matches: **0**
- Duplicate persisted canonical games: **0**
- Duplicate persisted provider-game IDs: **0**

## 11. Duplicate-source handling

The provider returned 144 extra conflicting records for duplicate game IDs. Conflicting duplicate groups are quarantined in full; the implementation never accepts “first row wins.” The duplicate rows are reported separately from unique excluded games.

## 12. Game chronology policy

Features use only admitted outcomes from earlier official dates in the same season. Same-day games are never treated as prior knowledge, so doubleheader game one is not assumed available to game two. Ambiguous suspended/resumed chronology is quarantined.

This is a conservative reconstruction rule, but it is still a proxy because authoritative completion timestamps are unavailable.

## 13. Completion-boundary finding

- Rows with authoritative provider completion time: **0**
- Rows with `NORMAL_GAME_PROXY`: **18,786**
- Admitted ambiguous suspended/resumed games: **0**
- Observed violations of the implemented cutoff rule: **0**
- Proven historical PIT-safe rows: **0**

The zero observed-rule violations must not be interpreted as proof of PIT safety.

## 14. Starter identity coverage

Final historical schedule responses supplied actual-only starter identities for both teams in **9,384 of 9,393 games**. Nine games have at least one unknown starter.

Every recovered starter is classified `ACTUAL_ONLY`, never `CONFIRMED_PREGAME`. Starter identity is outcome/context evidence and is not used as a same-game pregame feature.

## 15. Bullpen outcome coverage

Historical reliever appearances, workload, inherited runners, and bullpen performance were not materialized. The schedule endpoint does not inline boxscores; completing this family requires roughly one separately cached/audited game feed or boxscore request per admitted game.

Bullpen feature eligibility: **0 games**.

## 16. Team offense foundation

For each team and target game, the foundation reconstructs from earlier official dates only:

- runs per game over trailing 5/10/20/30 games;
- season-to-date runs per game;
- season-to-date runs allowed per game;
- home/road scoring split for the target side.

These rows are labeled `PARTIAL_CORE_CANDIDATE`, not core-ready.

## 17. League run environment

The foundation reconstructs prior-only league runs per team-game over:

- trailing 7 days;
- trailing 14 days;
- trailing 30 days;
- season to date.

Target-game scores and future games are excluded. The league ledger hash and cutoff rule are persisted per team-game row.

## 18. Park and venue coverage

Official venue identity is present for **9,393 of 9,393 games**.

Historical park factors were not derived. Venue availability is not equivalent to a PIT-safe park-factor feature, so park-adjusted core eligibility remains unavailable.

## 19. Lineup coverage

Historically timestamped confirmed batting orders were not found in the recovered source. Final/postgame lineups were not relabeled as pregame evidence.

Historical lineup feature eligibility: **0 games**. Lineups remain prospective-only.

## 20. Weather coverage

Historically timestamped pregame forecasts were not found. Current/reanalysis weather was not backfilled or mislabeled as a forecast.

Historical weather feature eligibility: **0 games**. Weather remains prospective-only.

## 21. Advanced-metric coverage

No Statcast, Stuff+, pitch quality, barrel/hard-hit, xwOBA, defensive, baserunning, catcher, travel, rest, or matchup-detail feed was added. No unstable or identity-unsafe feature was admitted.

Advanced/enhanced eligibility: **0 games**.

## 22. Outcome ledger

Outcomes are physically separated from feature rows and include final home/away runs, winner side, run differential, total runs, innings, extra-inning state, settlement state, source payload hash, and independent outcome hash.

Outcome hash failures: **0**.

## 23. Market firewall

Sportsbook prices, implied probabilities, closing lines, moneylines, totals, run lines, and market-derived values are absent from every sports feature payload.

- Market-leakage audit failures: **0**
- Feature rows claiming sportsbook fields present: **0**

Historical market data remains a separate future comparison dataset and is not a sports feature source.

## 24. Special-game handling

Admitted coverage includes:

- postseason games: **131**
- doubleheader games: **120**
- extra-inning games: **801**
- shortened finals below nine innings: **12**
- neutral-site games: **0**

Postseason and doubleheader metadata remain explicit. Ambiguous suspended/resumed chronology is excluded rather than guessed.

## 25. Exclusions and missingness

Unique quarantined games: **153**.

- conflicting duplicate provider-game IDs: **144**
- missing final score: **2**
- unfinished game: **7**

All missing starter, lineup, weather, bullpen, advanced, completion, and market-family states are explicit. Missing values are not silently imputed.

## 26. Determinism, split, and verification

Sealed identifiers:

- Artifact key: `mlb-historical-2023-2026-v1`
- Schema version: `mlb-chronological-team-game-v1`
- Source manifest SHA-256: `3d6132945d04452d12c7b2e58891cdb13ebbd3d14c7f723d86c6eb4960eb0a1f`
- Foundation SHA-256: `bc7c6aaa778bce0c1a078aaac14536a32bc77e0d125324ce906a672ae46792cf`
- Persisted replay SHA-256: `64f75e6ad20100a61c712dfcf79909d8577999220adb756cc33187c2042fc42e`

Candidate split assignments:

- 2023–2024 train candidate: **4,700 games**
- 2025 validation candidate: **2,363 games**
- 2026 locked OOS candidate: **2,013 games**

These assignments preserve chronology but do not authorize training while completion boundaries remain unverified.

Verification:

- persisted artifact audit: `PASS_PARTIAL`
- replay checksum matched on repeated audits;
- source-manifest mismatch: 0;
- replay-manifest mismatch: 0;
- split coverage/checksum/assignment violations: 0;
- invalid feature cutoffs: 0;
- duplicate persisted rows: 0;
- focused historical tests: 10/10;
- full API tests: 448/448 across 74 files;
- DB/API/library TypeScript checks: pass;
- API production build: pass;
- signing-credential security check: pass.

Materialization is advisory-lock protected and transactional. Database triggers reject updates, deletes, and truncation of the seven historical tables after sealing. The audit recomputes feature, outcome, exclusion, split, source-manifest, and replay integrity. A changed source/foundation hash under the sealed artifact key fails closed and requires a new artifact version.

Raw MLB provider response bodies were not archived; request-level and normalized-row hashes were sealed instead. This remains a C-level provenance limitation.

## 27. Readiness decision and next task

**Decision: C — PARTIAL FOUNDATION.**

What is ready:

- large canonical game/outcome ledger;
- exact team/starter/venue identity;
- prior-date score/offense/environment reconstruction;
- explicit missingness and quarantine;
- sealed provenance, deterministic audit, and locked candidate cohorts.

What is not ready:

- authoritative event-completion boundaries;
- true pregame starter state;
- starter/bullpen outcome enrichment;
- park factors;
- historical confirmed lineups;
- historical weather forecasts;
- advanced metrics;
- any model training, calibration, comparison, promotion, or deployment.

2021–2022 were not fetched because adding more rows with the same unverified completion boundary would increase volume without increasing trustworthiness.

**Recommended next task, not executed:** recover and seal authoritative completion timestamps plus starter/bullpen outcome ledgers for the admitted games, rerun the PIT audit, and promote rows from `PARTIAL_CORE_CANDIDATE` only when the completion boundary is proven. Do not begin MLB V4 training until that gate passes.

The previously observed V4 low-total bias remains untouched for future comparison. Production V1 remains unchanged. Release/deployment remains independently blocked by the protected contaminated Git ref awaiting Replit Support deletion.