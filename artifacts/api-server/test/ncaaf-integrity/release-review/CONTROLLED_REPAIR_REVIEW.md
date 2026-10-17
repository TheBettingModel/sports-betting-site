# NCAA V4 — controlled historical repair, prepared for review

> **Superseded manifest/test status:** see `NULL_AND_ACCESS_REVIEW.md` for the
> corrected explicit SQL-null before-images, replacement draft hash, 163 offline
> tests and 30 local PostgreSQL checks. The old hash below is invalid for apply.
> Production role provisioning, correction execution and deployment remain unapproved.

Prepared October 16, 2026. **Not applied, committed, pushed, or deployed.**
This report supersedes the earlier evidence-acquisition and executor-readiness
sections of `RELEASE_REVIEW.md`; that earlier report is retained as an audit baseline.

## Outcome

All **59 known correction candidates** now have a normalized ESPN final, the
previous CFBD consistency check, and an archived official university boxscore,
score display, or institutional postgame report supporting the proposed score.
All 59 pass the supplied-document verifier; none remains quarantined in the
prepared manifest. This is **preparation**, not certification of repaired live data.

| Action | Count |
|---|---:|
| Synchronize incorrect fixture scores to the already-correct result | 54 |
| Insert a missing result; preserve the already-correct fixture scores | 5 |
| Suspicious 0–0 fixtures included in the first group | 2 |
| Replace an existing result with a different final score | 0 |
| Delete/merge duplicates | 0 |

These are 59 known records, not a claim that every NCAA game in every season has
been independently audited. The earlier 336-game completed FBS-v-FBS comparison
was a bounded cohort, not a proof of complete NCAA/FCS schedule coverage.

## Evidence rules

- The primary event must pass the existing NCAA result validator, including
  canonical event/team identity, kickoff binding, completed status, score validity,
  phase metadata, source URL, capture time and evidence hash.
- A school document must have an approved HTTPS origin/path, an exact archived
  extraction hash, a literal final-score quotation, two distinct team labels,
  team-bound scores, reviewed game-date binding and an allowed institutional
  authorship category. It cannot silently replace a conflicting existing final.
- Period-score tables, final cumulative scoring-summary columns, literal
  team/score notes, and home/away-qualified matchup score displays are supported.
  A later first-down or yardage total is **not** a final score.
- The Texas State reference uses its institutional postgame notes, not the AP
  recap above them. Wrong-sport articles, previews, incomplete widgets, and
  unsupported score associations were excluded.
- Several text extractions omitted date metadata. For four boxscores the raw
  school HTML was also archived and hashed; literal title/table text was extracted
  without executing downloaded scripts or inventing a score sentence.
- A school article, boxscore, PDF route or alternate extraction is not counted
  as another independent source merely because its URL or format differs.
  CFBD/ESPN agreement alone is not treated as independent verification.
- School documents are first-party corroborating references. This work does not
  certify every site's unseen upstream feed, grant a new model-input verification
  status, or bypass the existing V4 historical-input evidence gate. Canonical
  school-label/date associations remain part of explicit operator manifest review.
- Availability is recorded conservatively after collection, never backdated to
  kickoff or inferred from an old article's publication date. Newly written
  repair receipts use the actual database transaction time.

`correction-manifest.json`, `corrections.csv`, and `source-index.json` now contain
the full 59-record source index. The executable-shaped draft and full extractions
remain under ignored `tmp/ncaaf-release-evidence-2026-10-16/prepared/`.
No production target or approval object was created.

## Executor safeguards

`ncaafHistoricalRepair.ts` is a deterministic, injected-store executor; it is not
an API endpoint, scheduler job, CLI apply command, or application startup import.

1. Validate the entire manifest before database access: supported version, 1–64
   entries, no duplicate event/physical fixture, verified source evidence,
   exact canonical identity and nonconflicting results.
2. Require an explicit APPLY/ROLLBACK approval, exact canonical manifest hash,
   exact complete game-ID inventory, and exact host/database/role target.
3. Verify the supplied pool binding before connecting. Verify the actual
   database/user and restricted-role flags/memberships read-only. Recheck the
   database/user inside each transaction; no environment/connection-string
   fallback is accepted.
4. For each game, acquire the existing NCAA-specific transaction advisory lock
   and row locks, check the approved before-values, and capture the full current
   game/result before-image. NFL IDs and wrong-sport rows cannot be repaired.
5. Durably record PREPARED before any correction. Reuse the existing NCAA
   reconciler, then attach a manifest-bound receipt in the same transaction.
   Score/provenance/receipt failure rolls the whole game transaction back.
6. A committed receipt permits safe resume after a crash before the filesystem
   journal is marked APPLIED. Repeating an owned, unchanged repair is a no-op.
   Changed or unowned post-images quarantine the candidate and stop the batch.
7. Keep a private 0700 journal directory, 0600 journal files, checksums,
   fsync/atomic rename, and no-follow file reads. Checksums detect accidental
   corruption; they are not signatures against a malicious database/operator.

Atomicity is **per game**, not one long transaction across all 59 games.
Completed games remain committed after a later candidate fails; resume is explicit
and idempotent. The executor never fetches sources or discovers extra candidates.

### Rollback boundary

- Full locked before-images and post-image ownership hashes are preserved.
- SQL NULL and JSON literal `null` remain distinguishable.
- Native PostgreSQL timestamp precision is retained; JavaScript Date rounding
  cannot corrupt the receipt hash or the restored timestamp.
- Only owned score/status/provenance/update fields are restored; other game/model
  and grading fields are not overwritten. Full before-image equality is checked.
- Restoring known-bad fixture scores requires an explicit acknowledgement.
- Newly inserted results are **not automatically deleted**: rollback quarantines
  them for dependency review rather than risking downstream grading/foreign keys.
- ROLLBACK_PREPARED is durable before restoration; interrupted rollback can resume.
- Code rollback alone does not undo data. Preserve the private journal and
  approved manifest outside disposable build storage before any eventual apply.

## Verification completed

| Check | Result |
|---|---|
| Guarded NCAA offline suite | **150 passed** |
| Real disposable PostgreSQL transaction checks | **22 passed** |
| Existing unchanged NFL offline suite | **409 passed** |
| Backend TypeScript, no emit/incremental files | **Passed** |
| Real prepared source-document manifest | **59 accepted; 0 quarantined** |

The local PostgreSQL runner rejects ambient application credentials, initializes
a disposable cluster on a private Unix socket, uses a restricted role and the
actual schema/Drizzle adapter, disables workers, and blocks external connections.
An initial unsanitized invocation was rejected by that guard **before connecting**;
the completed run used a clean environment.

Tests cover wrong targets/sports/identities, conflicting finals, legitimate
shutouts, suspicious 0–0, bounded manifests, reversed team/score attribution,
misleading stat totals, simultaneous writers, SQL failures, stale before-images,
post-commit journal failure, exact null/timestamp rollback, unsafe insertion
rollback, corrupt journals, and advisory-lock/failed-transaction cleanup.
No hosted database or production service was contacted by these tests.

## Exact file inventory for this preparation step

Paths below are relative to `artifacts/api-server/`.

New:
- `src/services/ncaafHistoricalRepair.ts`
- `src/services/ncaafHistoricalRepairPersistence.ts`
- `src/services/ncaafRepairJournal.ts`
- `scripts/prepare-ncaaf-historical-repair.mjs`
- `test/ncaaf-integrity/repair-fixture.ts`
- `test/ncaaf-integrity/repair.test.ts`
- `test/ncaaf-integrity/release-review/CONTROLLED_REPAIR_REVIEW.md`

Updated previously prepared files:
- `scripts/test-ncaaf-integrity-postgres.mjs`
- `vitest.ncaaf-integrity.config.mjs`
- `test/ncaaf-integrity/REVIEW.md`
- `test/ncaaf-integrity/release-review/RELEASE_REVIEW.md`
- `test/ncaaf-integrity/release-review/correction-manifest.json`
- `test/ncaaf-integrity/release-review/corrections.csv`
- `test/ncaaf-integrity/release-review/source-index.json`

The earlier uncommitted NCAA ingestion/persistence/coverage files and three
NCAA-only integration edits remain part of the full candidate. `git diff --stat`
alone omits these untracked files; consult the complete `git status -uall`.
Public evidence archives, raw HTML and generated verifier bundles remain ignored.
Worktree-only agent memory notes are not backend release files.

## Release boundaries and next approval

- Worktree: `.local/ncaaf-v4-historical-integrity-2026-10-16`.
- Branch: `dev/ncaaf-v4-historical-integrity-2026-10-16`.
- Parent remains `c7d66e18cf4d5dd6db4cc53abeb88895ee2cfdb1`.
- Nothing is staged. No commit, push, production write, migration, provisioning,
  deployment, mobile change or schedule change was performed.
- NFL equations, NFL ingestion files, frozen artifacts, historical forecasts,
  public mobile schemas and other sports remain unchanged.
- NCAA postseason remains eligible where appropriate; NFL preseason/month rules
  are not imported into the NCAA model. All 59 proposed rows are 2026 regular season.
- The frozen older historical foundation was not regenerated or certified anew.

Before any eventual production apply: review all canonical bindings/source quotes;
retain evidence and a private durable journal; read fresh before-values using a
restricted connection; regenerate/reapprove the manifest hash if anything changed;
verify the target/permissions, compatible writer code and rollback plan; approve
the exact 59-ID operation separately. There is deliberately no production apply
script or credential setup in this package.

Deploying the earlier NCAA ingestion candidate can itself write eligible finals:
it is not a write-free smoke test. It can touch the existing 14-day bounded retry
cohort, not just these 59 rows, and will not automatically fix the 49 older
disagreements. If deployment occurs before controlled repair, refresh and reapprove
before-images; stale manifests intentionally fail closed.

After an approved apply, requery all 59 exact rows: 54 fixture/result agreements,
five newly present results, no suspicious candidate 0–0, preserved identities and
grading times, complete matching receipts, released locks, and no changed NFL/
other-sport rows. Then verify API/worker commit compatibility and read-only public
responses without triggering forecast production or changing the cron schedule.

**Stopped here for review. The live NCAA historical data has not been repaired
by this preparation step.**

## Prepared manifest identity

Canonical executor approval hash (not an approval): `377efe848ff1efb9d9a62b2de6832046839686669d3c206aa6dfe8c500fafcff`.
An exact target and explicit operation/ID approval are still required. Regenerating
the source extraction or changing a before-value changes the hash.
