# NCAAF Canonical Recovery Completion & V4 Build Readiness

**Audit date:** 2026-09-04  
**Task:** #221G-FINAL  
**Scope:** NCAAF only. No NFL changes. No NCAAF V4 model training or #222 implementation.

## 1. Executive summary

#221G remains incomplete. The repaired development build fixes the
`pointsPerOpportunity` firewall false positive, keeps exact sportsbook fields
blocked recursively, makes missing confirmed-QB evidence optional rather than a
universal blocker, composes eligible early-season priors, separates the
prospective scheduler path from historical work, and makes evidence-run terminal
updates conflict-aware.

The repository now also has a bounded, immutable 2023-2026 historical training
artifact contract and materializer. It deliberately produced zero rows from the
currently available database because the existing historical evidence was
captured retrospectively and therefore does not establish what was available
before the historical kickoffs.

The repaired build passed 44 focused tests plus API and database-library type
checks. Production verification is pending publication of this build. The live
deployment at the time of this report still serves the preceding build.

## 2. `pointsPerOpportunity` root cause

The market firewall used one broad substring regular expression against every
nested key. Legitimate football-statistic keys were therefore judged by lexical
fragments rather than exact semantics. This caused the advanced defensive field
`pointsPerOpportunity` to abort snapshot creation.

## 3. Market-firewall fix

The recursive traversal remains in place, but market classification now uses
normalized exact keys. The firewall explicitly rejects:

- odds
- price
- line
- spread
- total
- moneyline
- impliedProbability
- book
- sportsbook
- marketPrice
- openingLine
- closingLine
- related exact market/betting keys

It permits confirmed football metrics including:

- pointsPerOpportunity
- pointsPerDrive
- yardsPerPlay
- successRate
- explosiveness
- havoc
- lineYards
- ppa

Regression tests cover allowed football metrics, every explicitly required
market key, and recursively nested market keys.

## 4. Team-performance root cause

Two conditions produced the all-MISSING production state:

1. Native team-game performance joins require the evidence provider team ID to
   equal the target provider team ID. CFBD evidence uses CFBD IDs while snapshot
   targets use canonical ESPN IDs.
2. CFBD team-stat enrichment occurs only while constructing a new immutable
   snapshot. Existing v2 rows are never rewritten, and new enriched attempts
   containing `pointsPerOpportunity` were aborted by the firewall before they
   could persist.

Raw performance rows therefore existed without becoming canonical v2
team-performance payloads.

## 5. Canonical team-performance implementation

The snapshot loader continues to require an explicit MAPPED CFBD-to-canonical
team ledger entry. Eligible CFBD team-stat evidence is transformed into the
canonical `teamPerformance` domain only when:

- the canonical team mapping is explicit and MAPPED;
- the evidence season equals the target game season;
- capture time is before the snapshot cutoff;
- provider effective time, when present, is before the cutoff;
- PIT class is A or B;
- the recursive market firewall passes.

There is no name fallback and no post-kickoff evidence promotion.

Production counts cannot be updated until the repaired build is published and a
new prospective cycle completes.

## 6. Historical mapping

Latest verified production state before this build:

- Teams encountered: 693
- Teams mapped: 138
- Current FBS mapped: 138/138
- Games considered: 760
- Games mapped: 100
- Games invalid because of unresolved ordered teams: 659
- Games unmatched after team mapping: 1

The new historical artifact accepts only explicit canonical event/team IDs and
both teams must be explicitly classified FBS. It does not add fuzzy historical
identity matching. Historical mapping has therefore not yet materially improved
in production.

## 7. Multi-season coverage

The artifact is bounded to 2023, 2024, 2025, and 2026. Current normalized
production CFBD evidence remains effectively 2026-only. Defining the range is not
the same as possessing legitimate rows for all four seasons.

Current legitimate training seasons: **0**

## 8. PIT classification

Only A/B evidence may enter a historical training row. Every included item must
have a valid effective timestamp and capture timestamp strictly before the
target game's pregame cutoff. C/D, missing-time, and post-cutoff evidence is
counted as excluded.

The development materialization audit found:

- PIT A included: 0
- PIT B included: 0
- PIT B excluded: 9,609
- PIT C excluded: 46
- PIT D excluded: 0

No retrospective evidence was promoted to pregame truth.

## 9. Historical QB foundation

The artifact can attach historical QB evidence only with:

- stable CFBD player ID;
- stable CFBD team ID;
- exact canonical team linkage;
- explicit QB position;
- dated statistics;
- effective and capture timestamps before the target cutoff.

It never infers a future starter.

Current usable PIT-safe QB rows: **0**

Confirmed pregame starter remains **UNSUPPORTED**.

## 10. Early-season prior

Eligible CFBD prior components are now composed rather than arbitrarily selecting
one row by query order. Evidence and provenance are retained for each component.
No model weights are assigned.

The prior is still insufficient for V4 because production lacks a multi-season
PIT-safe team-performance foundation and broad historical chronology.

## 11. Elo/SRS/team-stat coverage

Latest verified production coverage remains:

- Elo: 16 teams
- SRS: 16 teams
- Team stats: 892 rows across 16 teams
- Advanced stats: 16 teams
- SP+: 139 rows / 138 teams
- FPI: 138 teams

This build does not claim those sparse domains are broadened.

## 12. Recruiting linkage

Recruiting remains partial. No cross-provider player-name matching was added.
Existing production evidence has 3,987 recruiting rows but only limited
normalized team linkage.

## 13. Transfer linkage

Transfers remain research-only where chronology or explicit provider team
identity is insufficient. No player-name bridge was added. Existing production
evidence has 4,470 rows.

## 14. V2 snapshot status

Pre-publish production baseline:

- Total snapshots: 1,450
- v1: 789
- v2: 661
- CFBD-enriched v2: 649

The repaired code can create new v2 snapshots without rejecting
`pointsPerOpportunity`; it does not rewrite historical snapshots.

## 15. READY/PARTIAL/BLOCKED

The new semantics are:

- BLOCKED: required team performance is MISSING, INVALID, or UNSUPPORTED.
- PARTIAL: core performance exists but is partial or optional/important
  evidence is missing.
- READY: required team performance is valid and no important-domain gap remains.

Confirmed QB and early-season prior are optional under this research/build
contract. Their absence is still recorded and may later reduce confidence or
make a live game ineligible under a stricter publication contract.

Pre-publish production remains:

- READY: 0
- PARTIAL: 0
- BLOCKED: 1,450

## 16. Evidence-run finalization

Terminal updates now use compare-and-set semantics from RUNNING and inspect the
affected-row result.

- If the update succeeds, the intended terminal state is durable.
- If zero rows update after an ambiguous commit, the durable row is read.
- The retry is accepted only when the durable state equals the intended state.
- A conflicting stale-reconciler state is surfaced as an error rather than
  falsely reported as successful completion.

Regression tests cover both the conflicting and matching terminal-state cases.

## 17. Scheduler duration

The last audited useful production cycle took approximately 43 minutes. This
build does not claim that production duration has already improved.

## 18. Critical/backfill split

The prospective evidence cycle now starts independently at scheduler startup.
Historical completed-game repair and historical training materialization run
outside that awaited critical path.

Historical materialization remains bounded and fail-closed. It cannot delay the
initial FINAL_PREGAME-critical invocation.

## 19. FINAL_PREGAME

The established 45-minute prospective window, strict pre-kickoff cutoff, and
anti-backfill rules were not redesigned.

Latest verified production baseline:

- FINAL_PREGAME assignments: 1
- Prospective: 1
- CFBD-enriched: 1

## 20. Prospective evidence

Existing assignments were neither cleared nor rewritten.

Latest verified production baseline:

- LIVE_SHADOW: 650
- FINAL_PREGAME: 1
- Total: 651
- Assigned after kickoff: 0

## 21. PIT audit

Latest direct production checks:

- Snapshot cutoff after kickoff: 0
- Evidence captured after snapshot cutoff: 0
- Evidence modeled after snapshot cutoff: 0
- Prospective assignment after kickoff: 0

Detected PIT violations: **0**

This is not yet a full production-approval audit because future-week rating and
C/D snapshot lineage remain insufficiently materialized.

## 22. V4 training dataset

The repository now defines an immutable historical artifact ledger with:

- canonical provider/event ID;
- canonical home and away team IDs;
- season, week, kickoff, and pregame cutoff;
- final outcome targets;
- optional strictly dated QB evidence;
- eligible PIT lineage;
- exclusion/quality metadata;
- deterministic checksum;
- idempotent artifact identity.

This is a fail-closed data artifact, not a trained model and not a publication
path.

## 23. Training dataset quality

Development materialization against current evidence:

- Input canonical games: 100
- Included rows: 0
- Incomplete/non-final results: 92
- Completed rows without eligible pregame lineage: 8
- QB evidence rows: 0
- Seasons represented by included rows: 0
- PIT-safe training games: 0

The zero result is correct. The current database cannot establish that its
retrospectively captured historical features were available before those games.

## 24. DATA_PIPELINE_READY

**FALSE**

The code-level capture path is safer, but consecutive production finalization,
new canonical team-performance snapshots, and multi-season PIT-safe data are not
yet verified.

## 25. V4_BUILD_READY

**FALSE**

There are zero legitimate PIT-safe multi-season training games. The independent
expected-score challenger does not yet have the minimum historical foundation.

## 26. V4_VALIDATION_READY

**FALSE**

No V4 model, predictions, evaluation rows, or walk-forward segments exist.

## 27. FULL_LIVE_PUBLICATION_DATA_READY

**FALSE**

Legacy NCAAF publication remains disabled. Confirmed starter, injury, and depth
data remain unsupported, and the core V4 foundation is not ready.

## 28. Final decision

**B. #221G STILL INCOMPLETE — SPECIFIC DATA BLOCKER REMAINS**

The remaining blocker is a legitimate multi-season pregame evidence archive.
Current historical CFBD material was captured retrospectively. It can support
auditing and outcome labels, but it cannot be relabeled as PIT-safe pregame
features. #222 should not begin until enough 2023-2026 canonical FBS games have
both-team offense/defense evidence with defensible A/B chronology and lineage.

## Explicit final answers

1. `pointsPerOpportunity` was rejected by broad substring key matching.
2. The false positive is fixed in the verified development build.
3. The exact recursive market firewall remains intact.
4. `teamPerformance` was missing because provider IDs did not join directly,
   immutable snapshots were not rewritten, and enriched rebuilds hit the
   firewall exception.
5. Canonical CFBD team-performance loading is implemented but not yet verified
   on the new production build.
6. Production v2 snapshots confirmed with team performance after this repair:
   pending publish/cycle verification.
7. Historical FBS teams mapped: 138 current exact FBS identities; no claim of
   broader historical improvement.
8. Historical FBS games mapped in the latest production baseline: 100.
9. Seasons in the legitimate training foundation: 0.
10. PIT-safe training games: 0.
11. Historical QB evidence is not yet usable.
12. Confirmed pregame starter remains unsupported.
13. Early-season prior evidence is not yet sufficient.
14. SP+ is usable as a broad prior component.
15. Elo coverage is not yet improved.
16. SRS coverage is not yet improved.
17. FPI is usable as a research/prior component under its PIT classification.
18. Talent is usable as a prior component.
19. Returning production is usable when present; 136/138 teams were captured.
20. Recruiting team linkage is not yet materially improved.
21. Transfer linkage is not yet materially improved.
22. New PARTIAL snapshots are not yet production-verified.
23. New READY snapshots are not yet production-verified.
24. Evidence-run reliability is fixed locally but not yet proven across
    consecutive production cycles.
25. Critical startup scheduling is separated from historical materialization.
26. FINAL_PREGAME behavior is preserved; further assignments require live games
    entering the window.
27. Detected PIT violations: 0.
28. DATA_PIPELINE_READY: FALSE.
29. V4_BUILD_READY: FALSE.
30. V4_VALIDATION_READY: FALSE.
31. FULL_LIVE_PUBLICATION_DATA_READY: FALSE.
32. #222 should not begin next.