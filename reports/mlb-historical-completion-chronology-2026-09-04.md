# MLB Historical Completion-Time & Chronology Proof

**Task:** #224B-1  
**Report date:** September 4, 2026  
**Final artifact:** `mlb-historical-2023-2026-completion-v3-raw-bound`  
**Schema:** `mlb-completion-chronology-v3`

## 1. Executive Summary

The completion-time gate is safe for **9,390 of 9,393** admitted MLB games. The rebuilt artifact applies the strict predicate:

`completion_time(prior_game) < feature_cutoff(target_game)`

No schedule ordering, retrieval timestamp, database insertion timestamp, or estimated duration is accepted as proof. Three rain-shortened completed-early games remain unresolved and quarantined. The safe original-candidate cohort contains **9,073** games.

## 2. Source Discovery Matrix

| Source | Coverage | Usable evidence | Limitation |
|---|---:|---|---|
| MLB schedule feed | 9,393 | Provider identity, official game date, scheduled first pitch, status, score, game number, doubleheader metadata | No reliable historical completion timestamp |
| MLB `feed/live` with fixed `fields` projection | 9,393 | Official final status, first-play start, terminal-play end/completion flag, innings | No separate explicit completion marker in this cohort |
| MLB play-by-play | 9,393 | Same play chronology represented in `feed/live` | No dedicated game-completion field |
| MLB boxscore | 9,393 | Final statistics | No reliable completion timestamp |

The final artifact archives **9,393 exact provider-projected response bodies** totaling **167,327,838 bytes**. Each is stored with endpoint, retrieval time, exact-body SHA-256, byte length, and normalized-evidence hash. The audit re-hashes, JSON-parses, and re-derives every snapshot.

## 3. Canonical Timestamp Design

Completion hierarchy:

1. Explicit official `gameEndDate`, when present: `AUTHORITATIVE`.
2. Official final status plus the actual terminal completed play’s `about.endTime`: `HIGH_CONFIDENCE_DERIVED`.
3. Otherwise: `UNRESOLVED` and quarantined.

Results:

- Authoritative: **0**
- High-confidence derived: **9,390**
- Unresolved: **3**

The feature cutoff is the official first play’s `about.startTime` minus one millisecond. The actual final element of `allPlays` is the only eligible terminal event; the resolver never searches backward for an earlier completed play.

## 4. Season-by-Season Completion Coverage

| Season | Games | High-confidence derived | Unresolved | Core eligible |
|---|---:|---:|---:|---:|
| 2023 | 2,425 | 2,425 | 0 | 2,347 |
| 2024 | 2,435 | 2,435 | 0 | 2,353 |
| 2025 | 2,443 | 2,441 | 2 | 2,361 |
| 2026 | 2,090 | 2,089 | 1 | 2,012 |
| **Total** | **9,393** | **9,390** | **3** | **9,073** |

## 5. Same-Day / Doubleheader Chronology

- Doubleheader-flagged game records: **120**
- Unique admitted same-team/same-official-date pairs: **9**
- Directed same-day relationships audited: **18**
- Eligible directions: **9**
- Denied directions: **9**

The direction is determined only by strict timestamps. Game number and doubleheader labels are advisory metadata and never make an outcome eligible. Equality is denied. The official MLB date is preserved explicitly, including a passing fixture where two games share an official date while crossing a UTC date boundary.

## 6. Suspended / Resumed Games

The admitted sealed v1 cohort contains **0 suspended** and **0 resumed** rows. The rule remains fail-closed:

- a suspended or incomplete game cannot contribute an outcome;
- a resumed game becomes eligible only after official final status and terminal completion evidence establish a completion time before the later target cutoff.

Fixtures cover both unresolved suspension and a resumed game that later reaches a valid final state.

## 7. Postponed / Special Cases

- Admitted postponed games: **0**
- Completed-early games: **13**
- Completed-early games resolved by a complete terminal play: **10**
- Completed-early games quarantined: **3**
- Extra-inning games: **801**
- Games crossing UTC midnight: **3,506**
- v1 source exclusions: **144 duplicate provider IDs**, **7 unfinished games**, and **2 missing-score games**

The three unresolved provider game IDs are `777188`, `777474`, and `824807`. Each has official final status and a terminal `game_advisory` end timestamp, but the terminal event is marked `isComplete=false`; the resolver does not reinterpret that provider state.

## 8. Feature Cutoff Design

All **9,393** admitted targets have a cutoff derived from the official first play:

`feature_cutoff = first_play.about.startTime - 1ms`

Scheduled-start fallback usage is **0**. The schema and feature builder permit a null cutoff when first-play chronology is unavailable, and the persisted audit independently verifies exact evidence-to-feature cutoff binding. Violations: **0**.

## 9. Outcome Eligibility Logic

The replay uses independent clocks:

1. Freeze target features at the target cutoff.
2. Admit a prior outcome only after its canonical completion time.

It explicitly denies:

- the target game’s own outcome;
- any future outcome;
- any equal completion/cutoff timestamp;
- any non-final, quarantined, or unresolved prior game;
- any target with an unresolved cutoff.

Observed PIT violations: **0**.

## 10. Rebuilt Historical Dataset

The final additive artifact contains:

- Source games: **9,393**
- Persisted v3 games: **9,393**
- Raw completion snapshots: **9,393**
- Completion-evidence rows: **9,393**
- Chronology-decision rows: **9,393**
- Team-game feature rows: **18,786**
- Separate outcome rows: **9,393**
- Source exclusions copied immutably: **153**

Every game has exactly one raw snapshot, one evidence row, one decision, one outcome row, and two feature-side rows. Coverage, identity, hash, cutoff, outcome, and market-firewall violations are all **0**. The three unresolved outcomes remain separately recorded for audit but are never admitted as prior-game evidence.

## 11. Revised Eligibility

The unchanged v1 candidate set is the upper bound:

- Original core candidates: **9,076**
- Core eligible after chronology: **9,073**
- Partial core candidates: **3**
- Other excluded feature games: **317**
- Enhanced eligible: **0**

Final safe splits:

| Cohort | Games |
|---|---:|
| TRAIN | 4,700 |
| VALIDATION | 2,361 |
| LOCKED_OOS | 2,012 |

Chronology removes unsafe rows; it does not add new candidates.

## 12. Locked 2026 OOS Preservation

- Original locked OOS: **2,013**
- Chronology-safe locked OOS: **2,012**
- Quarantined from locked OOS: **1**
- New locked-OOS members: **0**

The locked 2026 cohort only contracted. No membership expansion or reshuffle occurred.

## 13. Test and Fixture Results

- Focused chronology/foundation tests: **20 passed, 0 failed**
- Full API suite: **76 files, 468 tests passed, 0 failed**

Covered cases include strict inequality, equality denial, timestamp-driven doubleheaders, official-date UTC boundaries, rain-shortened finals, suspended/postponed states, completed resumptions, extra innings, midnight crossings, missing timestamps, incomplete terminal events, retrieval-time leakage, future outcomes, locked OOS preservation, deterministic input ordering, null unresolved cutoffs, and market-family isolation.

## 14. Deterministic Replay

The first materialization sealed the artifact. The second run returned `VERIFIED_SEALED_ARTIFACT` with the same values:

- Source manifest: `3a208fd04a80a96b9da136a46db6a12df33b514df3e59be2a6d98b6fbc7e2f7c`
- Foundation: `97f989cb58217d3508caa2fd8d9ad596e1c3f5f366e762cab6aef2429d28e56f`
- Builder replay: `cc7b78d3a3fd16409f07aeab80b2a48c66df84a9743bf27c621a3a3147341588`
- Persisted replay: `cc7b78d3a3fd16409f07aeab80b2a48c66df84a9743bf27c621a3a3147341588`

Mismatch count: **0**.

## 15. Cross-Sport and Production Safety

- MLB V4/V4.1 trained or retuned: **No**
- Production MLB V1 modified: **No**
- NCAAF or another sport modified: **No**
- Publication or recommendation behavior modified: **No**
- Deployment performed: **No**
- Git history rewritten or pushed: **No**
- Apple/EAS credentials touched: **No**
- Signing-credential scan: **Pass**

## 16. Commands and Artifacts

Registered commands:

- `collect:mlb-historical-completion`
- `build:mlb-historical-completion`
- `audit:mlb-historical-completion`

Validation also ran the v1 audit, full API tests, task-scoped typechecks, API build, signing scan, and diff check. The v3 persisted audit passed with **0 violations** and all **20 append-only guards** present. The sealed v1 audit remains `PASS_PARTIAL`.

An interrupted version-binding attempt wrote **5,400** append-only evidence/snapshot rows under schema `mlb-completion-chronology-v2` and artifact key `mlb-historical-2023-2026-completion-v3`. They were not mutated or deleted. They are excluded from the final raw-bound key, source manifest, materialization, split, and audit.

## 17. Open Blockers

**High:** None for use of the explicitly quarantined 9,073-game safe candidate cohort.

**Medium:**

- The provider supplied no explicit `gameEndDate` in this cohort, so the 9,390 safe completion times are high-confidence derived rather than authoritative.
- Three rain-shortened completed-early games remain unresolved.

**Low:**

- The superseded 5,400-row version-mismatched collection attempt remains in append-only storage under its abandoned key.
- The task-scoped DB/API typechecks pass. Workspace-wide typecheck remains blocked by pre-existing errors in untouched `artifacts/mockup-sandbox` files.

## 18. Final Classification

**B — Completion-Time Gate Mostly Resolved**

Basis: 9,390 of 9,393 admitted games have point-in-time-safe completion chronology; the remaining three are explicitly quarantined, all persisted integrity checks pass, and the locked OOS cohort only contracts.

## 19. Next Task

The next task remains **#224B-2**. It was **not started**. No model training, retuning, promotion, or downstream replay work begins here.