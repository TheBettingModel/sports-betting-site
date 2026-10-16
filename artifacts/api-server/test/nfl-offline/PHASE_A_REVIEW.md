# NFL V4 Phase A — final offline review

## Scope and verdict

Worktree: `.local/nfl-v4-offline-phase-a`.
Branch: `dev/nfl-v4-offline-phase-a`.
Unchanged baseline HEAD: `1aa51faf0cf9896c826f4fc17c4b136420502ed2`.

Ready for the user's reviewed **offline-only commit**, not production integration
or database-writing tests. Nothing has been staged, committed, pushed, merged,
deployed, recovered, reconciled, or backfilled.

## Architecture

1. `nflHistoricalResultNormalization` parses explicit provider identities,
   timezone-qualified timestamps, scores, completion flags and event season phase.
2. `nflHistoricalResultValidation` classifies regular-season final observations,
   quarantines uncertain results and detects duplicate/conflicting observations.
   It reuses the existing pure V4 warehouse canonicalizer and stable hashes.
3. `nflHistoricalEvidenceProvenance` binds supplied snapshots to separately supplied
   trusted source/capture catalogs, exact UTF-8 SHA-256 and capture timestamps.
4. `nflHistoricalEvidenceVerification` requires independently corroborating
   upstream provider groups. Duplicate endpoints or mirrors add no support.
5. `nflHistoricalScheduleEvidence` applies the same provenance checks to
   score-independent schedule identities with explicit event-level week/phase.
6. `nflHistoricalFixtureCoverage` compares supplied expectations and historical
   observations, separates fixture presence from verified results, partitions
   reports by season/week/game and emits bounded, non-executable review candidates.

These are offline input/output components, not a replacement V5 engine. They
are not wired into live readers, scoring equations, jobs or model artifacts.
Result and schedule corroboration are separate gates because final-result
identity alone does not validate week metadata. Some bounded hash/parsing work
is repeated deliberately rather than weakening either gate or adding a new
general-purpose ingestion framework.

## Review findings resolved

- A different-ID same-team fixture with another week/date could be classified
  missing. Coverage now blocks ambiguous same-season/team-pair replacements.
  A separate corroborated schedule expectation can prove a legitimate repeat
  matchup; no identities are merged or repaired automatically.
- One corroborated final could mask another matching final with an invalid score.
  Any unresolved matching final or invalid supplied final evidence now prevents
  `PRESENT_VERIFIED`, including when observation order changes.
- Final references could agree on scores but disagree on schedule week.
  Verified final coverage now requires result and schedule corroboration.

The read-only architectural review preceded these fixes. The parent verified
them with explicit cross-component regression tests; no second review was run.

## Verification

Complete allowlisted suite: **179 passed, 0 failed, 8 files**.
Cross-component workflow suite: **8 passed**.
Original Step 1–4 suite: **171 passed**.
Targeted strict TypeScript checks across all offline historical modules, their
service tests, both fixture builders and workflow tests: **passed**.

From this worktree's `artifacts/api-server`:

```sh
node scripts/test-nfl-offline.mjs
pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --esModuleInterop --types node src/services/nflHistorical*.ts test/nfl-offline/result-fixtures.ts test/nfl-offline/schedule-fixtures.ts test/nfl-offline/workflow.test.ts
```

The launcher removes inherited credentials and connection settings. Guards
block network, DB/provider adapters, startup/scheduler imports and arbitrary
subprocesses before application I/O. Only the pinned local esbuild service is
permitted. The 22 safety tests intentionally exercise rejections before I/O;
they do not make real database connections or provider requests.

## Exact cumulative candidate inventory

All 21 files below are new/untracked relative to the pinned baseline, within
`artifacts/api-server/`. Nothing should be staged from the main workspace.

| Relative path | Purpose |
| --- | --- |
| `scripts/test-nfl-offline.mjs` | Sanitized fixed-entry offline launcher |
| `vitest.nfl-offline.config.mjs` | Eight-suite allowlist and import boundary |
| `src/services/nflHistoricalResultNormalization.ts` | Pure field/phase parsing |
| `src/services/nflHistoricalResultValidation.ts` | Result and conflict decisions |
| `src/services/nflHistoricalResultValidation.test.ts` | 45 result regressions |
| `src/services/nflHistoricalEvidenceProvenance.ts` | Source/capture integrity |
| `src/services/nflHistoricalEvidenceVerification.ts` | Independent corroboration |
| `src/services/nflHistoricalEvidenceVerification.test.ts` | 41 evidence regressions |
| `src/services/nflHistoricalScheduleEvidence.ts` | Schedule corroboration |
| `src/services/nflHistoricalFixtureCoverage.ts` | Coverage and bounded review plan |
| `src/services/nflHistoricalFixtureCoverage.test.ts` | 47 coverage regressions |
| `test/nfl-offline/guard.mjs` | Preloaded I/O and import guard |
| `test/nfl-offline/setup.mjs` | Worker guards and swallowed-I/O detection |
| `test/nfl-offline/mock-db.mjs` | Throwing DB substitute |
| `test/nfl-offline/mock-espn.mjs` | Throwing provider substitute |
| `test/nfl-offline/safety.test.ts` | 22 boundary checks |
| `test/nfl-offline/result-fixtures.ts` | Synthetic result snapshots |
| `test/nfl-offline/schedule-fixtures.ts` | Synthetic schedule/capture snapshots |
| `test/nfl-offline/workflow.test.ts` | Eight cross-component regressions |
| `test/nfl-offline/README.md` | Runner instructions and trust limitations |
| `test/nfl-offline/PHASE_A_REVIEW.md` | This review and inventory |

The original `nflV4`, `v4Platform`, and `v4HistoricalWarehouse` test files are
allowlisted but unchanged. No original tracked runtime file is modified.

Generated review outputs, excluded from the commit:
`artifacts/api-server/tmp/nfl-offline-review/phase-a.diff` and
`artifacts/api-server/tmp/nfl-offline-review/SHA256SUMS`.
The patch includes all 21 inventory files and does not stage or modify Git data.

## Non-NFL changes and preservation

The unrelated `.agents/memory/github-cli-release-auth.md` note was inspected:
no credentials, secrets or PII were added. Its worktree copy was a separate
single-link file, not a symlink/hardlink to the main workspace copy. Its contents
were safely restored to the pinned baseline without Git metadata changes.
No memory-document content diff belongs in the NFL commit.

The main workspace HEAD remains `c056cc78b7e95279fba0711474f0104cf234b364`.
Its only new untracked item is the user-uploaded Step 5 instruction attachment.
That upload is outside this implementation and must not enter the NFL commit.

No existing production reader, calculation, frozen artifact, historical forecast,
schema, API contract, scheduler, mobile component or other sport was changed.
No live production status or database identity was queried during this review.

## Remaining limitations and minimum next stage

- Approved catalogs must have externally established provenance. Matching
  hashes prove byte integrity, not provider authenticity or historical truth.
- Snapshots must use canonical ESPN-compatible event/team IDs and explicit
  event-level week/phase metadata; native-provider adapters are not supplied.
- Fixture `COMPLETE` is relative to supplied expectations, not proof of an
  exhaustive official schedule or verified/model-ready results.
- Ambiguous replacement/repeat fixtures can conservatively defer recovery review.
- Kickoff in the past does not establish completion. All recovery candidates
  remain review-only; all persistence/execution authorization flags are false.
- Guards protect against accidental I/O, not hostile code or native extensions.

The minimum next step, after user review, is approval of this offline-only commit
and a separate bounded integration specification: map existing NFL rows to these
input contracts, review canonical identity mappings and immutable source/capture
manifests, and define explicit season/week/date/candidate cutoffs. No new table
or new model version is required merely to build a read-only snapshot adapter.

Before any database-backed test, independently prove the intended isolated
development target is not Render's production database, use a least-privilege
role (read-only for initial snapshot tests), verify workers/startup jobs are
disabled, and run adapters without application startup imports. Confirm writes
fail under the read-only role. Write-capable tests require separate approval,
a disposable/resettable target and reviewed transaction/rollback/idempotency
tests. No such verification or provisioning was performed in Phase A.

Stop here. Database integration, corrections and production backfills are not
authorized by completion of this offline review.
