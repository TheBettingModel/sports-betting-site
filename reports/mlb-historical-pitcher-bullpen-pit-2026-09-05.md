# TASK #224B-2 — MLB HISTORICAL PITCHER & BULLPEN PIT REPORT

## 1. EXECUTIVE SUMMARY

- **Classification:** **B — MLB V4 BASELINE TRAINING FOUNDATION READY**
- **Authoritative artifact:** `mlb-historical-2023-2026-pitcher-bullpen-pit-v5`
- **Games audited:** 9,393
- **Chronology-safe:** 9,390
- **Full-core eligible:** 0
- **Pitcher-core eligible:** 0
- **Bullpen-core eligible:** 9,073
- **Enhanced eligible:** 0
- **Locked OOS full-core:** 0
- **PIT violations:** 0
- **Market leakage:** 0

The sealed foundation is safe for a later offense-plus-bullpen expected-runs baseline. It is not safe for starter-dependent or full-core training because no recoverable timestamped historical pregame starter evidence was found. Actual starters remain outcome-only facts and never become pregame features.

The final independent architecture review found no blocking correctness or safety issue. It approved classification B and confirmed that TASK #224B-2 is complete. No model was trained, tuned, promoted, or published.

## 2. SOURCE INVENTORY

| Source | Use | PIT treatment | Result |
|---|---|---|---|
| MLB Stats API exact game boxscores | Pitcher identities, appearance order, starter outcomes, conventional pitching lines, pitch counts, bullpen aggregation | Exact response bodies archived before derivation; raw SHA-256, byte length, endpoint, provider game ID, and source-manifest binding verified | 9,393/9,393 archived; 1,599,369,579 bytes |
| Sealed MLB completion chronology v3 | Official baseball date, feature cutoff, canonical completion time, final/quarantine state | Admission requires `canonical_completion_time(prior_game) < feature_cutoff(target_game)` | 9,390 safe; 3 quarantined |
| Sealed MLB offense/team-game rows v3 | Canonical team identity and offense-core eligibility | Exact artifact/checksum binding | 18,786 team-game rows |
| Sealed chronology split v3 | TRAIN / VALIDATION / LOCKED_OOS membership | Immutable foundation-checksum binding | 9,073 candidates |
| Historical probable/confirmed starter evidence | Pregame starter identity | Investigated but no timestamped historical evidence was recoverable | Unavailable; not inferred |
| Historical roster/injury/availability evidence | Individual reliever availability/depth | No defensible timestamped roster evidence was recoverable | Explicitly unavailable |
| Market/sportsbook data | Not permitted for this reconstruction | Rejected by recursive market firewall and independent audit | 0 fields |

Raw collection was resumable and reused the immutable v1 archive for every later derived artifact; no 1.6 GB redownload was performed.

## 3. PITCHER IDENTITY

- **Unique pitchers:** 1,473
- **Identity rows:** 80,298
- **Resolved:** 80,298
- **Unresolved:** 0
- **Ambiguous:** 0
- **Duplicate identity keys:** 0
- **Games affected by ambiguity:** 0
- **Rule:** exact MLB person ID only, `mlb:{providerPlayerId}`
- **Fuzzy matching:** prohibited and unused

Player history follows the exact person ID across trades and team changes. Bullpen history remains team-bound. Handedness was unavailable in the archived player objects and is null rather than inferred.

## 4. STARTER STATE

| Season | Confirmed pregame | Projected pregame | Actual only | Unknown |
|---|---:|---:|---:|---:|
| 2023 | 0 | 0 | 4,850 | 0 |
| 2024 | 0 | 0 | 4,870 | 0 |
| 2025 | 0 | 0 | 4,882 | 4 |
| 2026 | 0 | 0 | 4,178 | 2 |
| **Total** | **0** | **0** | **18,780** | **6** |

Actual starter identity is retained only as an outcome fact. Pregame starter ID, handedness, role, workload, and rate features remain null. The state `LEAGUE_PRIOR_REQUIRED` replaces any label that could falsely imply rookie status when pre-2023 MLB history was simply outside the archive. No starter-dependent row is eligible.

## 5. PITCHER OUTCOME LEDGER

- **Appearances:** 80,298
- **Actual starts:** 18,780
- **Relief appearances:** 61,518
- **Coverage:** all 9,390 chronology-safe parsed games
- **Quarantined pitching outcomes:** 3 games
- **Missing pitch count/IP/BF/HBP:** 0 appearance rows
- **Handedness missing:** all 80,298 identity rows
- **High-leverage usage:** unavailable
- **Appearance group hash:** `94e5b4f0600831d212fc1f65562de243bc6e783f6c29818e2af29be542cf632f`
- **Combined pitcher-ledger hash:** `3c13e8f6a834212f726c5e4bd11af62ecc36504e9ba5a0af3cc687acff3f3906`

The independent verifier directly reparsed every exact raw body without importing the production parser and matched every persisted appearance field.

## 6. STARTER PIT FEATURES

Reconstructed rate/workload schema:

- career, current-season, recent-3, recent-5, and recent-10 appearances;
- innings, starts, ERA, WHIP, K%, BB%, K-BB%, HR rate, HBP, and FIP;
- days since last appearance and last start;
- last appearance pitch count;
- last start pitch count and innings;
- prior-state, sample size, stat-through time, source-game IDs, and missingness.

**Historical pregame coverage:** 0 games, because no timestamped pregame starter identity was available. Therefore all starter rate/workload metrics are null in training snapshots, sample counts remain zero, pitcher-core eligibility is false, and empty states never encode fake zero performance. The fixed descriptive FIP constant is 3.10 and was not trained.

## 7. EXPECTED STARTER WORKLOAD FOUNDATION

- **Historical inputs available after a legitimate starter identity:** rolling appearances/starts, rest, recent innings, and recent pitch counts.
- **Historical pregame starter identities available:** 0.
- **Historical outcomes available:** complete IP and pitch-count outcomes for 18,780 actual starts.
- **Coverage:** outcome foundation complete; pregame workload-training pairs unavailable.
- **Limitations:** no retrospective actual starter may be substituted for pregame identity.

No expected-innings or expected-pitch-count model was trained. Starter workload enhancement must be built prospectively from timestamped pregame evidence.

## 8. BULLPEN OUTCOME LEDGER

- **Games:** 9,390 chronology-safe games
- **Team outcomes:** 18,780
- **Relief appearances:** 61,518
- **Coverage:** complete conventional and pitch-count outcomes for all admitted team-game bullpens
- **Bullpen outcome group hash:** `1a735c692a29046d8db072f9e20a45b214a73677913ff782b98ca67faebbe648`
- **Combined bullpen-ledger hash:** `bf29980dc40dd4f134a48a7e905b52737c9f285cc8b9e9369aac4c70ef730180`

Bullpen outcomes are aggregated from all appearances after the first listed pitcher for each team. The independent verifier reconstructed and matched every persisted bullpen field.

## 9. BULLPEN PIT FEATURES

**Quality:** season, last-3, last-5, and last-10 innings/rate state; ERA, WHIP, K%, BB%, K-BB%, HR rate, HBP, and fixed-constant FIP.

**Workload:** pitches and innings over trailing 1/2/3 elapsed-day windows; relievers used over trailing 1/2 days.

**Fatigue:** fixed non-trained three-day pitch thresholds:

- WORKED: 40+
- TIRED: 80+
- VERY_TIRED: 120+

**Consecutive use:** back-to-back and three-day counts require the same reliever to appear on every immediately preceding official baseball date. Completion timestamps still independently control PIT admission. Doubleheaders on one official date do not manufacture multiple consecutive dates.

**Availability/depth:** `UNAVAILABLE_NO_ROSTER_EVIDENCE`; no individual availability was inferred.

**Coverage:** 18,786 snapshots, of which 18,426 are complete. Bullpen-core eligibility is 9,073 games.

## 10. EARLY-SEASON PRIORS

- **Pitcher:** `LEAGUE_PRIOR_REQUIRED` only when an evidenced pitcher lacks current/archive history; `UNAVAILABLE` when no pregame starter identity exists. Metrics remain null.
- **Bullpen:** current-season state is used only after completed current-season games. Empty season rate states retain zero sample counts but null all statistical metrics. Prior-season/team history may remain in recent workload windows only when its completion is strictly before the target cutoff.

No league-average values, rookie assumptions, future season totals, or retrospective identities were fabricated.

## 11. TRADES / ROLE CHANGES

- **Cases:** handled deterministically wherever the same MLB person ID appears for different teams or roles.
- **Resolution:** pitcher history follows `mlb:{personId}`; bullpen history follows canonical team ID.
- **Role treatment:** actual starter/reliever role is an outcome fact for that appearance; it does not confirm a future role.
- **Violations:** 0.

## 12. DOUBLEHEADERS / SPECIAL GAMES

- **Doubleheader games in sealed chronology:** 120
- **Same-day relationships audited:** 18
- **Same-day relationships admitted:** 9
- **Same-day relationships denied:** 9
- **Cross-midnight-UTC games:** 3,506
- **Quarantined games:** 3 rain-shortened/unresolved games
- **Violations:** 0

Official `game_date` governs baseball-date adjacency. Canonical completion time governs information availability. A same-day prior game contributes only if it completed strictly before the target feature cutoff.

## 13. ELIGIBILITY BY SEASON

| Season | Chronology-safe | Offense-core | Pitcher-core | Bullpen-core | Full-core | Enhanced | Quarantined |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2023 | 2,425 | 2,347 | 0 | 2,347 | 0 | 0 | 0 |
| 2024 | 2,435 | 2,353 | 0 | 2,353 | 0 | 0 | 0 |
| 2025 | 2,441 | 2,361 | 0 | 2,361 | 0 | 0 | 2 |
| 2026 | 2,089 | 2,012 | 0 | 2,012 | 0 | 0 | 1 |
| **Total** | **9,390** | **9,073** | **0** | **9,073** | **0** | **0** | **3** |

## 14. LOCKED 2026 OOS

- **Original locked cohort:** 2,013
- **Chronology-safe locked cohort:** 2,012
- **Pitcher-core:** 0
- **Bullpen-core:** 2,012
- **Full-core:** 0
- **Excluded:** 1 quarantined game
- **New members added:** 0

No locked OOS outcome was used for model training, tuning, threshold selection, or promotion. No model work occurred in this task.

## 15. MARKET FIREWALL

**PASS**

- Sportsbook leakage count: 0
- Target: 0

The replay rejects recursive market keys, and the independent persisted audit scanned identities, outcomes, snapshots, and eligibility rows with zero market fields found.

## 16. PIT / LEAKAGE AUDIT

| Check | Result |
|---|---|
| Strict `canonicalCompletionTime < featureCutoff` | PASS |
| Target game excluded from source-game IDs | PASS |
| Future-information violations | 0 |
| Target-outcome leakage | 0 |
| Invalid starter confirmation | 0 |
| Actual starter promoted to pregame evidence | 0 |
| Target bullpen usage leakage | 0 |
| Invalid chronology | 0 |
| Market leakage | 0 |
| Trade identity contamination | 0 |
| Team bullpen cross-contamination | 0 |
| Doubleheader completion-order leakage | 0 |
| Official-date adjacency errors | 0 |
| Quarantined outcomes admitted | 0 |
| Append-only guard violations | 0 |

The production audit passed with zero violations. A separate verifier that imports none of the production parser, replay, REAL normalizer, or hash helpers also passed every category with zero violations.

## 17. DETERMINISM

- **Dataset/foundation hash:** `cec426281151791d8018ada96990c76c0ba07a585b57333382bc5fbe9489a050`
- **Pitcher ledger hash:** `3c13e8f6a834212f726c5e4bd11af62ecc36504e9ba5a0af3cc687acff3f3906`
- **Bullpen ledger hash:** `bf29980dc40dd4f134a48a7e905b52737c9f285cc8b9e9369aac4c70ef730180`
- **Replay hash:** `a1fb96b3ec8abff49a69c56ceefdecef038ccc46aef150779abf19a286e2fe42`
- **Source-manifest hash:** `8da8c322a3ec1ac6723d267cc9aa4b922c185654f809f26246934bbefd8a6d98`
- **Second-run foundation hash:** `cec426281151791d8018ada96990c76c0ba07a585b57333382bc5fbe9489a050`
- **Second-run replay hash:** `a1fb96b3ec8abff49a69c56ceefdecef038ccc46aef150779abf19a286e2fe42`
- **Mismatch count:** 0

Immutable lineage:

| Version | Role | Foundation | Replay | Status |
|---|---|---|---|---|
| v1 | Superseded serialization attempt | `e4096d4d394361bfe1d8a2015354801959a23e84c0f811d22a408f0d844009b1` | `f10356456d67f4399c55d20023416b51bab3a3038d8e2e7d2065b0d4632707e0` | Preserved, non-authoritative |
| v2 | Superseded serialization attempt | `c29586ef23cf56ace74a1470fc4f077c4e22a8191ecbd5fb3c3e7386e8e00bdc` | `f10356456d67f4399c55d20023416b51bab3a3038d8e2e7d2065b0d4632707e0` | Preserved, non-authoritative |
| v3 | REAL-normalized, superseded after architecture review | `cd6e30be5af03376cec7ad7902c8f33563e9242a7067d7a793c9af86cf42ee4f` | `f10356456d67f4399c55d20023416b51bab3a3038d8e2e7d2065b0d4632707e0` | Preserved, non-authoritative |
| v4 | Corrected official-date adjacency, superseded for empty-rate missingness | `ea6a7d505eb0b0c8a9d43bba2bfff4b2b8f57738a85fbdc904e3ef05b5dd6ecf` | `1d0ac8283878b796102198fad686acf914c525c56427c734f0193d33325f5364` | Preserved, non-authoritative |
| **v5** | **Authoritative corrected artifact** | `cec426281151791d8018ada96990c76c0ba07a585b57333382bc5fbe9489a050` | `a1fb96b3ec8abff49a69c56ceefdecef038ccc46aef150779abf19a286e2fe42` | **Verified sealed artifact** |

All versions remain immutable; no prior artifact was mutated.

## 18. PERFORMANCE / SCALE

- **Games:** 9,393
- **Raw bytes:** 1,599,369,579
- **Provider calls/endpoints:** 9,393
- **Appearances:** 80,298
- **Derived persisted rows:** 226,341 across seven tables
- **v5 first build:** 161,823 ms
- **v5 deterministic second build:** 136,653 ms
- **Production audit:** 147,348 ms, 63.75 games/second
- **Independent audit:** 83,966 ms
- **DB impact:** additive append-only tables and one sealed artifact version; indexed in-memory histories avoid per-target DB queries

## 19. CROSS-SPORT REGRESSION

- NCAAF unchanged: confirmed by changed-file scope.
- NFL unchanged: confirmed by changed-file scope.
- NBA unchanged: confirmed by changed-file scope.
- WNBA unchanged: confirmed by changed-file scope.
- NHL unchanged: confirmed by changed-file scope.
- Soccer unchanged: confirmed by changed-file scope.
- UFC unchanged: confirmed by changed-file scope.

No UI, publication, other-sport, Apple/EAS, deployment, or model-production files were changed.

## 20. TEST / BUILD RESULTS

| Command/check | Result |
|---|---|
| Focused parser/replay tests | PASS — 11/11 |
| `pnpm --filter @workspace/api-server test` | PASS — 479/479 across 78 files |
| API TypeScript check | PASS |
| DB TypeScript check | PASS |
| `pnpm --filter @workspace/api-server run build` | PASS |
| Sealed completion chronology audit | PASS — zero violations |
| v5 production pitcher/bullpen audit | PASS — zero violations |
| v5 independent persisted audit | PASS — zero violations |
| Deterministic second v5 materialization | PASS — exact hashes |
| Append-only trigger validation | PASS — 34/34 expected guards |
| `git diff --check` | PASS |
| Independent architecture follow-up | PASS — no blockers |
| HoundDog credential/privacy scan | PASS — 0 findings |
| Security findings in changed MLB scope | 0 |

Project-wide scanners also reported existing dependency advisories (32 high, 23 moderate, 3 low) and two high SAST path-traversal warnings in `artifacts/mobile/server/serve.js`. They are outside this task’s changed scope and were not modified under the no-unrelated/mobile-change boundary.

## 21. KNOWN V4 LOW-RUN FAILURE

- No tuning was performed.
- No V4/V4.1 coefficients were changed.
- The known **-2.327 runs/game** diagnostic bias is preserved for later comparison.
- The present work reconstructs evidence only; it does not claim to fix expected-runs calibration.

## 22. PRODUCTION STATE

- `tbm-mlb-moneyline-v1` unchanged.
- MLB V4 remains shadow-only.
- MLB V4.1 remains shadow-only.
- No publication changes.
- No projected-score UI changes.
- No six-pick-cap changes.
- No deployment.
- No push.
- No Git-history manipulation.
- No Apple/EAS credential changes.

## 23. RISKS / REMAINING GAPS

**CRITICAL**

- None in the sealed v5 foundation.

**HIGH**

- Historical timestamped pregame starter identity was not recovered. Starter-dependent/full-core training remains prohibited until prospective evidence exists.

**MEDIUM**

- Individual reliever roster availability, injury state, high-leverage usage, pitch mix, and advanced Statcast-style metrics are unavailable.
- The archive begins in 2023, so no-history states cannot distinguish a true MLB rookie from pre-archive MLB experience; `LEAGUE_PRIOR_REQUIRED` makes this explicit.
- Project-wide dependency/SAST findings exist outside the changed MLB scope and should be handled as a separate security maintenance task.

**LOW**

- Three unresolved rain-shortened games remain quarantined.
- The build emits a non-blocking `pg` deprecation warning on deterministic second materialization.

## 24. FINAL CLASSIFICATION

**B — MLB V4 BASELINE TRAINING FOUNDATION READY**

This is the exact fit because 9,073 games have chronology-safe offense-plus-bullpen core evidence, zero market leakage, deterministic replay, and independent persisted verification. A simpler expected-runs baseline may later use that eligible evidence without hindsight starter identity. The classification is not A because pitcher-core, full-core, and enhanced eligibility are all zero. Starter enhancement must remain prospective-only.

## 25. NEXT RECOMMENDED TASK

Recommended only after owner review:

**#224C — MLB V4 EXPECTED-RUNS MODEL BUILD, TRAINING & CHRONOLOGICAL VALIDATION**

#224C was not started, proposed, trained, tuned, or executed here. Work stops at this report.