# Historical integrity repair follow-up — current review

## Release verification completed — October 16, 2026

This section supersedes earlier offline-only / not-yet-tested statements below.
The production release has **not** been deployed by this verification work.

- Actual Render API baseline: `1aa51faf0cf9896c826f4fc17c4b136420502ed2`.
- Actual Render grading cron baseline: `58d1b4323dbcc5f59e6cbc0b4b8b372e450a7c01`,
  an ancestor of the API baseline. Current cadence remains `*/15 * * * *`.
- Guarded offline suite: **409 tests / 13 suites PASS**.
- Real PostgreSQL: **12 integration cases PASS** through a Neon transaction
  pooler, using the actual persistence adapter and real Drizzle schema metadata.
  The mirror contains the actual games/result columns, defaults, primary keys,
  unique result index and fixture foreign key; it is not a full application
  schema migration or a complete application/end-to-end test.
- Strict TypeScript: all production API source files PASS. The forecast-review
  query now supplies its declared nullable kickoff from a left-joined game row.
  A second pre-existing full-source type error in the RevenueCat SDK adapter was
  fixed by normalizing the SDK's standard fetch inputs to a Request; existing
  Request inputs are retained unchanged. Entitlement decisions are unchanged.
- The API compiler root now includes its existing `test/` fixture directory as
  well as `src/`. This fixes the canonical project check's fixture-root error
  without excluding tests or weakening types. Production output is still built
  by the unchanged esbuild script, not TypeScript emit.
- Final canonical `tsc -p tsconfig.json --noEmit --incremental false`: **PASS**.
  API and cloud-pipeline production bundles: **PASS**.

### Database isolation and transaction evidence

The test target was a new, disposable Neon branch, distinct from the actual
Render-connected live branch, with a separate empty database. No application or
worker environment was changed to point at it. Its SQL-created runtime role had
no memberships, superuser, create-role/database, replication, RLS bypass or role
inheritance capability, and could not connect to the cloned source database.
Identity, permissions, active clients and absence of DB job extensions were
checked before the first test DDL/data write. No application startup or provider
HTTP was permitted. Credentials were held in memory and supplied over stdin,
never saved in tracked files or test receipts.

The twelve real cases covered atomic new finals; four simultaneous refresh /
recovery callers yielding one result; no-write duplicates; interrupted fixture
creation and existing-game updates rolling back; valid shutouts; 0–0/missing
phase quarantine and later recovery; PRE/POST exclusion; conflicting score
quarantine; preserving grade provenance/raw keys; atomic repair of a matching
result's game score; stale live-upsert protection; other-sport isolation; and
zero advisory locks remaining after successful/failed transactions.

The earlier Neon API-created role was rejected as overprivileged and was never
used for the integration cases. Only the restricted SQL role ran the tests.
All synthetic tables/functions were removed by the runner after completion.
The disposable Neon branch was subsequently deleted; its test credentials and
roles are no longer usable. Production branch/configuration remain unchanged.

### Release and rollback boundary

Assemble the candidate from the **actual API baseline**, not the workspace HEAD.
Only NFL implementation/offline verification files and the two minimal shared
type-check corrections belong in the commit. Exclude memory, credentials,
captured production data, generated patches/builds, schema definitions,
mobile/admin code, scheduler configuration, pipeline entrypoints and artifacts.
The full existing offline foundation accompanies its tests; it does not replace
the NFL V4 model or introduce a V5.

The API and existing grading cron must use the same candidate backend commit:
an old cron can otherwise bypass the new final-result persistence path. Manual
Render promotion is owner-controlled. For the cron, pin the release branch to the
approved commit before building it; do not assume a cron accepts the API service's
specific-commit selector. Preserve cadence, ownership, start commands, environment
and auto-deploy setting. Coordinate both promotions; do not leave mismatched NFL
writers active as the final state.

Rollback is code-only to the recorded API/cron baseline commits. It does not
reverse previously repaired historical rows or rewrite forecasts. No production
schema change is needed. Check actual live deployment commit IDs after promotion,
not merely configured branches or accepted deployment requests. Verify health
without calling forecast-producing endpoints or triggering a manual pipeline run.
Frozen artifact provenance remains a separate unresolved audit; this release
does not certify or retrain that artifact.

---

## Ongoing NFL final capture implemented offline — latest status

This section supersedes the earlier missing-ingestion implementation blocker.
It does **not** approve a deployment or certify real database integration.
All work stayed in the isolated NFL worktree; no database/provider requests,
new infrastructure, commits, pushes, workers or deployments were performed.

### New implementation

- `nflFinalIngestion.ts`: deterministic parsed-event capture, validation, batch
  duplicate/conflict preflight and transaction-port reconciliation.
- `nflFinalPersistence.ts`: existing Drizzle/PostgreSQL transaction adapter;
  pinned transaction-scoped per-game advisory lock, row locks, atomic game
  score/status + result + source metadata writes.
- `espn.ts`: both current and dated readers capture the actual parsed event,
  queried URL and actual capture time. Event-level season year/type classify the
  fixture; a scoreboard-wide season flag cannot substitute for event metadata.
- `games.ts`: NFL finals use the shared reconciler. Existing NFL finals are
  protected from a racing stale non-final upsert. NFL final shutouts no longer
  pass through the old NULLIF-zero score preservation.
- `grading-runner.ts`: NFL recovery uses the same reconciler; blind games-table
  result copying is disabled for NFL. Existing sync retries recent known NFL
  fixtures only: 14 days, 64 candidates, at most eight date requests. NFL stale
  recovery is restricted to the same recent window/eight-date request bound.
  No missing-fixture discovery or historical backfill was added. Pending pick
  grading waits when final evidence is quarantined; already completed grades
  and forecasts are not rewritten. Other-sport branches keep their old behavior.
- `nflHistoricalResultNormalization.ts` / `nflHistoricalResultValidation.ts`:
  accept explicit-zone minute-precision ESPN kickoff fields without relaxing or
  rounding evidence capture timestamps. Reuse all existing identity, completion,
  score, season and warehouse checks.
- `nflHistoricalSeasonPolicy.ts`: ordinary unchanged ESPN finals have a separate
  explicit single-provider phase path. Independent-result verification remains
  false; the stricter independent-source historical adapter was not modified.

### Integrity / availability behavior

New reliable regular-season observations carry event-bound phase evidence and
are available only at their actual first accepted capture time. PRE/POST facts
may be archived but never enter regular-season model history. True shutouts and
positive-score ties are accepted. 0–0, missing/invalid/out-of-range scores, missing
phase/year, source/hash/identity/status conflicts and future capture times are
quarantined, not inferred.

New unverifiable completed fixtures remain visible with NULL scores and no
accepted result; the existing history reader blocks rather than silently omitting
them. Existing pending fixtures can be upgraded after valid evidence arrives.
No pseudo-final game_results row is fabricated. A conflicting stored final is
never automatically overwritten from another observation of the same provider.
Quarantines on existing results are persisted in reserved raw JSON metadata.

Semantically duplicate finals preserve the first capture and do not churn data,
even if display labels or other non-factual payload fields change. Conflicting
duplicates are preflighted before a batch can pick an input-order winner.
Unresolved provider-only factual conflicts block admission until reviewed; a
repeat of the old observation does not silently clear the quarantine. Previously
reviewed official primary facts retain priority over a contradictory lower-trust
feed observation, which is separately quarantined without changing those facts.
Original raw payload keys and existing grading-source/grade-time fields survive.
No independent-verification claim is inferred from multiple ESPN captures.

### Verification and remaining release checks

- **408/408 guarded offline tests PASS**, 13 suites; 39 new ingestion regressions.
- Strict targeted TypeScript PASS for all NFL historical/ingestion services,
  the persistence adapter, ESPN reader and associated tests.
- Broader route/grading import-graph TypeScript found one **pre-existing** error:
  `forecastReviews.ts:383`, required `PredictionCandidate.gameStartsAt` missing
  from selected rows. That file is byte-identical to the release baseline;
  no changes were made to it.
- Transaction rollback/serialization tests use an in-memory transactional fake,
  not a real PostgreSQL connection. A verified isolated DB integration pass is
  still required before publishing this data-writing backend change.
- NFL V4 equations/frozen artifact and shared V4 platform/warehouse bytes remain
  unchanged; the baseline engine-byte reconstruction test still passes.

Publication remains held for isolated PostgreSQL integration, the existing
backend typecheck failure and release review. Before eventual deployment, verify
that every actual NFL writer uses the approved backend code (including any
separate existing grading worker); do not change scheduler configuration or
partially deploy mismatched writers. The frozen-seed audit remains separate.
Production data repaired previously stays live; this task changed no production
records or running services.

---

## Historical records repaired in production; runtime release held

This is the latest status and supersedes earlier statements that no production
game records were changed or that the candidate discrepancies were uncorroborated.
User explicitly authorized correcting historical records and season classification.

### Source review and completed production changes

Captured official NFL game-center evidence for all 15 regular-season score
disagreements and all 14 missing fixtures. All 29 agreed with the licensed
reference. Official NFL game centers also corroborated the four preseason score
disagreements and the additional result-only recovery for Seattle–Denver.
NFL schedule pages supplied explicit season/phase/week/participant metadata.
Do not count nflverse as an independent upstream merely because it is published
separately. These are bounded, official-primary-source-corroborated factual repairs,
not a certification of the disabled independent-provider input adapter.

Cross-record identity bridging was bijective across 32 teams. Actual NFL
participants, home/away order, score pairs, season/week links and schedule facts
were checked. Schedule pages without a displayed date were matched using explicit
season/week and both teams, not an inferred calendar-phase rule.
Recovered kickoff timestamps use the licensed reference's ET timestamps; official
NFL pages corroborate local date, week, participants and scores, not exact kickoff
seconds. No reconstructed completion or publication timestamp was invented.

Render identity verification confirmed the live API uses the approved Neon target,
the same baseline release commit, and the existing production branch.
No non-internal triggers exist on either modified table.

Applied one NFL-only transaction to `games` and `game_results`:
- Corrected **19** existing games-table score pairs, including all **12** 0–0 finals.
- Existing 82 game_results score pairs were already correct; none was overwritten
  with a different score.
- Recovered **14** absent historical fixtures and their result rows.
- Added **one** missing result row for an already-stored completed fixture.
- Persisted source-bound phase metadata for **97** fixtures: **17 PRESEASON** and
  **80 REGULAR_SEASON**. No postseason fixtures exist in this bounded DB cohort.
- Found **zero** duplicate natural fixtures; no records were deleted.
- Kept real shutouts and the legitimate 9–9 preseason tie.
- Recovered archival fixtures have zero units and no forecast/prediction created.

The write uses exact IDs, team/time/score preimages, row locks, a transaction-scoped
advisory lock, timeouts, a fixed bundle hash and a same-bundle no-op resume path.
Prior game fields and complete prior result rows are retained in each record's
rollback evidence. Before/after snapshots and the transaction receipt are in
ignored tmp/. Any rollback that removes recovered fixtures must first check for
new dependent records and compare current postimages; do not blindly delete them.

The initial transaction's postcondition query had an ambiguous PL/pgSQL alias.
It rolled back completely; a separate restricted read proved the original 83 rows
and zero applied tags before retrying with unambiguous aliases. The corrected
transaction committed. A further independent restricted connection verified:
**97 fixtures/results, zero score disagreements, zero 0–0 finals**.
An exact-plan retry was also executed inside a guarded transaction; the combined
games/results row-version fingerprint stayed identical, proving a no-write retry.

Bundle: `19f1d14dc0078c02afe5422c6bb6dd2770a3e8dd6038a5c5610b77aac8e598bd`.

### Implemented runtime eligibility, not deployed

`nflHistoricalSeasonPolicy.ts` reuses the existing season normalization and admits
only explicitly corroborated regular-season historical rows. PRE/POST rows are
excluded without deletion. Unknown phase, wrong provenance, changed team/score/time
bindings and evidence not yet available are quarantined and block collection.
Hashes identify the actual captured schedule page; its contained game link is
recorded separately, never misrepresented as that page's captured URL.

`nflV4.ts` now reads result metadata, applies that policy and respects the later of
the existing conservative completion bound and the actual review-availability time.
No equations, feature definitions, frozen artifacts or public API schemas changed.
The legacy-source test reconstructs and pins the exact deployed baseline bytes.

Final checks:
- **369/369 guarded offline tests PASS**, 12 suites.
- Targeted strict TypeScript PASS.
- Guarded check of the actual post-commit snapshot: **80 selected, 17 excluded,
  zero quarantined** at the evidence review time.
- Offline plan builder is deterministic for the supplied capture set/review time
  and cannot connect to a database or execute its output.

### Publication blockers / preserved boundaries

**Do not publish the runtime filter yet.** Ongoing NFL ingestion does not currently
produce this phase evidence for newly completed games. Shipping the fail-closed
collector alone could interrupt forecasts after the next unclassified final.
Wire and test ongoing phase capture before release; do not fix availability by
silently admitting unknown phase or claiming an incomplete subset is complete.

The frozen historical export still has 52 reference-matched postseason rows and
four unresolved rows. This is not proof those rows entered the current seed.
Trace the actual frozen seed's construction and intended season policy before
approving any future rebuild. The existing seed remains UNVERIFIED and untouched.

Production data repair is live. Production CODE, branch, workers, scheduler,
immutable forecasts, frozen artifacts, mobile and other sports remain unchanged.
No commits, pushes, merges or deployments were performed.

---

## Restricted access and licensed reference acquisition — latest status

This section supersedes earlier access blockers, test counts, and patch hashes.
Restricted production reads are now operational through the existing Neon
integration; no Replit audit-secret handoff is required for this method.

### Authentication repair and restrictions

Catalog inspection confirmed the approved NFL-only security-barrier views and
restricted role already existed. The administrative MCP session could not SET
ROLE to that role. A role-specific connection lookup then returned a URI without
a password; login failed with missing authentication credentials. The Neon
password-reset API initially rejected the passwordless role.

Under explicit user authorization, initialize authentication on ONLY the audit
role using a database-generated random password (not returned), then reset ONLY
that role through Neon's credential management. A fresh role-specific connection
now authenticates successfully. No application/owner password, role grants, view
definition, scheduler, deployment, game row, or artifact was changed.
Do not log, embed or store the returned credential in project files.

Direct-session proof:
- Exact Render-declared Neon branch/database verified; role and session_user both
  `tbm_nfl_history_audit`, database `neondb`.
- Actual and default transaction read-only: on.
- Statement timeout: 5 seconds; lock timeout: 1 second.
- No base games SELECT or UPDATE permission; zero role memberships.
- Catalog effective relation access limited to the two approved audit views;
  no schema CREATE or executable non-system security-definer functions.
- Bounded reads use the restricted connection, not administrative credentials.

### Data captured and observed

Ignored directory: `artifacts/api-server/tmp/nfl-history-access-evidence/`.
Contains restricted NFL-only JSON, nflverse games.csv, its distributed CC-BY-4.0
license, timestamp, source/capture hashes, and a quarantined candidate comparison.

83 post-seed finals captured through 2026-10-16; 12 have stored 0–0 scores.
19 games/game_results score pairs disagree. These are internal inconsistencies,
not independently verified corrections.

The nflverse-data schedules release explicitly redistributes Lee Sharpe nfldata
under its repository license. Captured license and release provenance permit a
licensed reference review; do NOT claim that its scores have proven upstream
independence from ESPN. Publisher identity alone does not establish that.

After explicit NFL-<numeric ESPN ID> bridging:
- 66 current database fixtures match reference ESPN identities; all are REG in
  that reference. Full canonical team/time validation remains required for
  admission. The other 17 rows remain unclassified, not inferred from month.
- 15 stored scores disagree with the reference; candidate ledger records old,
  proposed and game_results scores without changing source rows.
- 14 scored reference fixtures are absent from the captured database window,
  including the September 27 Rams–Denver and Seattle–Washington cases.
- Seed export: 1,143 rows; 1,139 match reference identities and scores.
  Matched reference phases: 1,087 REG, 52 postseason. Four unmatched rows remain
  unresolved by this comparison. This does not certify training inclusion,
  historical availability, schedule completeness, or the seed.
- Seed decision remains UNVERIFIED. No replacement created.

### Additional code repair proven necessary by real stored identity shapes

The structural guard initially accepted only bare numeric ESPN event IDs, but
all 83 captured database rows use NFL-<id>. This would have rejected otherwise
valid eligible stored rows. `requireNflV4History()` now accepts that exact namespace
as well as bare provider IDs, deduplicates their aliases deterministically, and
detects conflicting scores across aliases. Wrong-sport/malformed prefixes stay
rejected. Raw ESPN event parsing is unchanged; no source identity is rewritten.

Seven regressions added. Final guarded suite: **350/350 PASS**, 12 suites.
Targeted strict TypeScript: PASS. Baseline bytes and frozen artifact unchanged.
No tests connect to databases; operational restricted reads are separate.

The namespace issue is fixed in development, not deployed. The production patch
must be regenerated with that guard revision; the manifest is authoritative for
its latest hash. Whole-batch invalid eligible history still blocks forecasts.

### Remaining evidence gate

No credential handoff remains for integration-based restricted reads.
Source captures are usable for candidate comparison, but independent upstream
verification is still unresolved. Obtain authoritative lineage confirmation
from the reference publisher OR an appropriately licensed results/schedule
source whose collection is demonstrably independent of ESPN. No paid provider
subscription was purchased and no commercial agreement was assumed.

Do not admit the candidate corrections, reconstruct missing games, certify
phase coverage/seed, or claim production-impact counts until that source gate,
identity validation and evidence-availability checks pass. Production remains
BLOCKED. No commits, pushes, merges, production game writes or deployments.

---

This section supersedes the ordering, test-count, and patch-applicability statements
in the earlier report below. The earlier report is retained as review history.
No release approval is implied.

## Changes in this pass

- `src/services/nflV4.ts`, `createNflV4Engine().materializeInput()`:
  select replay-eligible rows BEFORE `requireNflV4History()`. Exclude rows at or
  before the frozen seed and rows whose legacy kickoff-plus-12-hour availability
  is at/after target kickoff or after the supplied prediction time. Reuse one
  local `historyAvailableAt()` calculation for both selection and replay.
- Unknown/invalid kickoffs remain subject to rejection: they cannot prove a row
  irrelevant. Invalid prediction/target clocks fail explicitly.
- Keep suspicious eligible 0–0, null/invalid scores, identity conflicts, and
  fixture collisions blocking. Do not silently use a partial eligible history.
- `vitest.nfl-offline.config.mjs`, `legacySource()`: reverse the additional reader
  changes in memory and continue asserting the exact production engine byte hash.
  The inactive verified-evidence replay experiment still substitutes supplied
  evidence availability only inside the guarded test runner.
- `test/nfl-offline/history-safety.test.ts`: add 15 synthetic regressions for
  eligibility-before-validation, seed/target/prediction boundaries, malformed
  irrelevant rows, valid forecast routing, and invalid clocks.
- This review document: record the current result and unresolved data gates.

## Verification

- Guarded offline suite: **343/343 PASS**, 12 suites, including 60 history-safety
  tests. Existing normalization, independent-source verification, schedule
  completeness, phase exclusions, adapter, bundle, and replay tests still pass.
- Targeted strict TypeScript: PASS; no emitted or incremental files.
- Initial test run: one new assertion incorrectly expected legacy output for
  post-prediction evidence; its existing validator correctly raises
  `PIT_CHRONOLOGY_INVALID`. The regression now checks that behavior against the
  repaired reader's successful exclusion. No validator was weakened.
- Valid unique eligible history yields identical complete inputs/outputs to the
  actual pinned production baseline. Legitimate shutouts/ties remain accepted.
- Malformed replay-ineligible history no longer suppresses a valid forecast.
  Malformed eligible history still returns `NO_FORECAST`, never legacy fallback.
- Source equations, coefficients, frozen artifact, public API, mobile app,
  scheduler, other sports, and immutable forecasts are unchanged.

## Data coverage, seed assessment, and release blockers

No new real-world results were independently verified or corrected. No database
or provider connection was made. The designated audit connection was unavailable
at the preceding access check; owner/application credentials are not substitutes.

The existing offline export has 1,143 rows, covering kickoffs from September 2022
through February 2026, from one upstream provider (ESPN_SCOREBOARD). It lacks
event-level season phase in its normalized rows and cannot establish independent
verification, schedule completeness, or the September 2026 discrepancies.
The frozen seed remains as-of 2026-02-09T11:30:00Z, season 2025, 32 teams.
Hash consistency is not proof of historical correctness or phase eligibility.
Seed contamination is unresolved; no replacement was generated or overwritten.

Existing verified-input admission excludes explicit preseason/postseason,
quarantines unknown phase, checks independent providers and bounded schedules,
and requires safe evidence availability. It remains offline and is not silently
connected to the production reader. The legacy reader's fields cannot prove phase,
actual completion time, independently verified scores, or missing fixture coverage.
Do not invent phase from month or treat a +12-hour estimate as provider proof.

**Production decision: NOT CLEARED.** The ordering defect is repaired in development,
but invalid eligible history can still block future forecasts across teams.
Measure that impact using restricted reads before approving a release.

Minimum operator actions:
1. Privately supply `NFL_HISTORY_AUDIT_DATABASE_URL` for the approved NFL-only
   role/views. Verify host-to-Neon-branch mapping and effective read-only
   permissions before bounded reads; do not replace application DATABASE_URL.
2. Supply appropriately authorized independent results AND schedule/season-phase
   evidence, with canonical identity mappings and source provenance, covering
   both the seed's training history and the affected post-seed window.
3. Review the resulting isolated corrections, seed decision, availability impact,
   and a newly prepared narrow release patch before deployment authorization.

## Consolidated release-preparation follow-up

Render metadata was checked again: the live API remains at
`1aa51faf0cf9896c826f4fc17c4b136420502ed2`, deployment
`dep-db8g0qqvcj2c73a94nc0`. No deployment action was taken.
The designated restricted audit secret is still absent. No privileged credential
was substituted and no data/source connection was attempted.

The previously stale ignored patch has now been REGENERATED from the reviewed
worktree against that exact live baseline. It is a structural-reader candidate,
NOT a completed historical-data repair or an approved production release.

- Patch: `artifacts/api-server/tmp/nfl-v4-release-1.patch`
- SHA-256: `384db26b7f64b90ecbe947b12aec5ec0cd464f06e5feae0e909c0351f76f842b`
- Manifest: `artifacts/api-server/tmp/nfl-v4-release-1.manifest.json`
- Exactly three runtime files: `nflV4.ts`, `nflV4HistorySafety.ts`, and the pure
  dependency `nflHistoricalResultNormalization.ts`, all under `src/services/`.
- Forward applicability check against a temporary copy of the exact baseline:
  PASS. Reverse applicability check against the worktree: PASS.
- No patch was applied. The manifest pins baseline and candidate file hashes and
  explicitly records BLOCKED_NOT_APPROVED_FOR_DEPLOYMENT.
- No new engine/test changes were needed; the unchanged 343-test suite was NOT
  rerun. Patch applicability does not establish a release build or data readiness.
- Ignore the older patch hash/applicability statements in the archived report.

### Separate historical-data correction procedure — design only, not executable

1. After restricted access verification, export bounded NFL-only rows through the
   approved views in an explicit read-only transaction. Pin target identity,
   extraction cutoff, row inventory, and input hashes. Do not import app startup.
2. Match those rows to operator-approved independent result and schedule captures
   using canonical event/team identities, season/week and event-level phase.
   Multiple records from one upstream remain ONE source. Preserve exact capture
   bytes, rights/source manifest, evidence times, and identity mappings.
3. In an isolated dataset, produce a proposed change ledger: event identity,
   original row hash, proposed fields, machine-readable reason, references and
   source hashes. Preserve original records; do not resolve ambiguity by choosing
   a first/last observation. Quarantine unsupported or conflicting changes.
4. Validate completed scores, phase, missing fixtures, duplicates and chronological
   eligibility with the existing offline adapter and coverage checks. Current
   captures may support a present-day repair but cannot masquerade as historical
   pregame availability. Do not use them to claim leakage-free past forecasts.
5. Apply the same verification to the seed input inventory. Reproduce the seed
   with existing equations only when sufficient authorized evidence exists.
   Write any candidate under a new version/path; retain the existing seed.
6. Compare actual target-game forecasts using exact production baseline versus
   the corrected isolated history. Report changed/unchanged/unavailable targets
   and reasons, separately for data repair and reader changes. No claimed counts
   are possible yet; synthetic comparisons are not production-impact estimates.
7. Before any future write, separately approve the precise correction ledger,
   atomic/idempotent persistence procedure, compare-and-swap original-row guards,
   interruption/checkpoint handling, games/game_results consistency, and rollback
   mapping. Do not turn this document into an automatic production backfill.
   Missing fixtures need verified identities before insertion; score changes must
   not alter immutable forecasts or unrelated sports.
8. Release approval requires successful isolated integration, exact-baseline build,
   source/seed/coverage gates, measured forecast availability, backward-compatible
   API checks and separate operator authorization. Roll back code to the recorded
   release if necessary; reverse data only through its reviewed provenance ledger
   with guards against overwriting later legitimate changes.

Current measured outcome: 0 real score corrections verified/prepared, 0 missing
or duplicate fixtures resolved, 0 independently verified phase classifications,
seed UNVERIFIED, actual forecast impact UNMEASURED, production BLOCKED.
These zero counts describe completed verification, not an absence of bad records.
No local commit, push, merge, production write, seed replacement, or deployment
was performed. Worktree changes remain unstaged.

---

# NFL V4 Release 1 — structural historical-integrity hotfix

## Decision

The narrow runtime patch is applicable to the verified production baseline and
passes offline validation. It is ready for code review, NOT approved for deployment.
It is not a complete historical-data correction or an independently verified
history release. No release commit exists; the hotfix remains uncommitted.

## Preserved offline checkpoint

- Branch: dev/nfl-v4-offline-phase-a.
- Worktree: .local/nfl-v4-offline-phase-a.
- Parent: fd071be387904299a04c8bee0975f73772c5bdb6.
- One authorized local commit: cea5c9e33ed14cae3dc2fa5064ee043fcddfb5ed.
- Message: test(nfl-v4): preserve offline evidence bundle and replay foundation.
- Ten files: the two runner/config files, bundle loader, bundle fixtures/tests,
  replay harness/tests/declaration, COMBINED_PHASE_REVIEW.md and
  INACTIVE_READER_PROPOSAL.md. Exact inventory is in that commit.
- The memory addition was restored before staging and is not in the commit.
- Checkpoint verification: 283 tests passed; targeted strict TypeScript passed.
- No generated patch, temporary baseline, credential, or production file committed.

## Actual production comparison

Read-only Render control-plane metadata inspected on 2026-10-16 UTC:

- V4 API service: tbm-api-v4-candidate, srv-daf2vemq1p3s73bee8lg.
- Configured branch: fix/mlb-slate-membership-2026-10-08.
- LIVE deployment: dep-db8g0qqvcj2c73a94nc0.
- Serving commit: 1aa51faf0cf9896c826f4fc17c4b136420502ed2.
- Live deployment finished: 2026-10-15T16:36:02.119161Z.

This is the actual live deployment commit, not an inference from its configured
branch. The older sports-betting-backend service is a distinct legacy service;
its live commit is not the V4 baseline.

The V4 baseline is an ancestor of this development branch. The intervening three
commits contain offline implementation/tests/docs only; there are no
production-only changes absent from the development ancestry. The live reader
before this hotfix is byte-identical to the baseline. The patch is restricted to
three runtime files, not a wholesale deployment of the development branch.

## Implemented safeguards

1. `nflV4.ts`, collectEvidence: retain final rows with null scores in the existing
   bounded post-seed/pre-target SQL query, so missing scores cannot disappear
   before validation. No writes or new queries were added.
2. `nflV4.ts`, materializeInput: call requireNflV4History before replay/state updates.
3. `nflV4HistorySafety.ts`: pure structural validation reusing the established
   providerId/score parsers from nflHistoricalResultNormalization.ts:
   - Reject missing, negative, nonfinite, fractional, and unsafe-integer scores.
   - Block suspicious 0–0 finals without replacing them.
   - Preserve legitimate shutouts, ties, one-point possibilities, and high scores;
     no invented historical score ceiling.
   - Block missing/noncanonical IDs, same-team assignments, invalid kickoffs, and
     supplied rows outside the explicit seed/target interval.
   - Collapse exact same-event/team/kickoff/score duplicates to one replay.
   - Block conflicting same-event observations; never choose first/last as truth.
   - Block different event IDs for the same team pair and exact kickoff, including
     reversed assignments.
   - Return deterministic chronological rows without mutating supplied data.
   - On any issue, block the entire batch with NFL_HISTORY_INTEGRITY_BLOCKED and
     machine-readable issues. Do not silently replay a knowingly incomplete subset.

No row is labeled independently verified by these checks. Existing independent
source and bundle rules are unchanged and are NOT wired into production here.

## Intentional exclusions and blockers

- No preseason/postseason filter: the live games reader/schema has no reliable
  event-level phase field. August dates and July season transitions are not phase
  evidence. Unknown-phase rows retain their existing legacy eligibility; this is
  an explicit limitation, not a claim that they are regular-season verified.
- No missing-game recovery or coverage certification: no trusted full schedule
  inventory is available through this reader. Empty supplied history retains
  existing seed-only behavior and is not certified complete.
- No automatic repair of Denver–Kansas City, Seattle–New England, or missing
  September 27 fixtures; synthetic examples are not evidence of actual outcomes.
- No comparison to game_results: no database access was authorized. Conflicts are
  detectable within the supplied batch only, not across unqueried stores.
- Null kickoff rows remain outside the bounded SQL window. Misclassified
  non-final rows, wrong-but-plausible scores, and cross-ID fixtures with different
  kickoffs cannot be resolved reliably using the supplied fields.
- Frozen seed limitations and the existing kickoff-plus-12-hours convention are
  unchanged. Actual evidence availability still requires the separate verified
  integration proposal, which remains inactive.

## Tests and invariants

- Final guarded offline suite: 328/328 PASS, 12 suites (283 existing + 45 new).
- Targeted strict TypeScript: PASS, no emitted or incremental files.
- Initial targeted check found a JSON-artifact type assertion issue in the new
  test; corrected it without weakening runtime artifact validation.
- Valid unique rows, including a shutout: patched inputs and complete outputs
  equal the actual production engine exactly.
- Duplicated row: patched replay equals single replay; legacy double replay differs.
- 0–0: legacy produces a forecast; patched path blocks, without changing scores.
- Missing score: legacy skips the row; patched path blocks.
- Existing routeV4Forecast returns NO_FORECAST with the integrity reason, without
  invoking predict or falling back to another engine.
- Legacy comparator reverses only the reviewed reader changes in memory and
  asserts the reconstructed source SHA-256 equals the actual live file:
  3ee85cfd1fade758c6537889b50bf01fdd71a7aabe6328ea19eddea0027140f9.
- Equations, feature construction, coefficients, predict(), training, and frozen
  artifact unchanged. Artifact file SHA-256:
  31bf3b6be06d6416b6da5831a2a9df3660faf2fef9328e4687270bfd3a1957e1.
- Public API schemas/routes and mobile code unchanged. Existing NO_FORECAST
  contract reused; native/build compatibility is preserved at the contract level,
  but no device or production-data integration test was performed.

## Runtime-only proposed patch

Generated, ignored, uncommitted file: artifacts/api-server/tmp/nfl-v4-release-1.patch.
SHA-256: ef48c4b26672e532fc5c940a3b780fecf61aa648eb4edd250a574f6a70340992.

Exactly three runtime files relative to the serving commit:
- artifacts/api-server/src/services/nflHistoricalResultNormalization.ts (new, pure)
- artifacts/api-server/src/services/nflV4HistorySafety.ts (new, pure)
- artifacts/api-server/src/services/nflV4.ts (4 additions, 2 deletions)

Forward git apply --check passed against an isolated copy of the actual baseline;
reverse check passed against the current worktree. These are applicability
checks, not a deployment or a database integration test.

## Review, future release, rollback

The whole-batch block deliberately favors integrity over availability. One bad
post-seed row can suppress all affected NFL forecast attempts, even for other
teams. Previously saved immutable forecasts are NOT invalidated or rewritten.
No other sport is affected.

Before any production release: approve that availability consequence; separately
assess real data under authorized read-only access; recheck Render's serving SHA;
prepare a narrowly scoped release commit on that exact baseline and run its
normal build/CI. No deployable release SHA is recommended in this report.
Do not change Render's branch or deploy the offline checkpoint wholesale.
Rollback would restore the previous API code release; no schema/data reversal or
forecast rewrite is needed. Full data correction, phase admission, and coverage
certification remain blocked pending reliable evidence.

## Final uncommitted inventory (worktree-relative)

Modified:
- artifacts/api-server/src/services/nflV4.ts
- artifacts/api-server/scripts/test-nfl-offline.mjs
- artifacts/api-server/vitest.nfl-offline.config.mjs
- artifacts/api-server/test/nfl-offline/historical-replay.ts
- artifacts/api-server/test/nfl-offline/virtual-replay.d.ts

New:
- artifacts/api-server/src/services/nflV4HistorySafety.ts
- artifacts/api-server/test/nfl-offline/history-safety.test.ts
- artifacts/api-server/test/nfl-offline/RELEASE_1_REVIEW.md

Nothing is staged. No database/provider/game API calls, migrations, backfills,
pushes, merges, deployments, mobile/scheduler/other-sport modifications occurred.
Only Render deployment/service metadata GETs were used for baseline verification.
