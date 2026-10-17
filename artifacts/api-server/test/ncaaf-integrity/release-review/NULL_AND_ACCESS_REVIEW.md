# NCAA V4 — corrected provenance manifest and restricted-access preparation

**Prepared for review only. No production apply, role creation, commit, push or deployment.**

This report supersedes the manifest identity and test counts in
`CONTROLLED_REPAIR_REVIEW.md`. The previous manifest must not be approved or used.

## Outcome

- The exact same 59 NCAA games remain in scope: 54 fixture score synchronizations,
  five missing-result inserts, two suspicious fixture 0–0 scores included in the
  54, no replacement of an existing final with a different score.
- All 59 retain their archived ESPN primary evidence and university-document
  corroboration. No live provider requests were made in this step.
- SQL provenance was recaptured read-only at **2026-10-17 01:55:24.684 UTC**
  (October 16, 9:55:24.684 PM EDT), on the previously verified Render-connected
  Neon project/branch/database. The transaction explicitly reported read-only ON.
- All reviewed scores, canonical identities, kickoff timestamps, update timestamps,
  result IDs, grading sources and grading timestamps matched the reviewed inventory.
- **54 existing rows have SQL NULL provenance, not JSON literal null.**
  The other **five have no joined result row**; their null flag and checksum must
  both be null. Missing rows are not observations of a SQL NULL value.
- No checksum is derived by serializing a JavaScript null.

### Manifest identity

Canonical approval hash of the corrected executable-shaped **draft**:

`bc3590fa28909b3f0e265dc46e48ec5505b17cabb8f345dac92f29b2eb166ac9`

Exact generated manifest-file SHA-256 (different purpose from canonical hash):

`36f2dda5f2b2e37b81d402187f905f6f696a9f968e3389efcc708e552dfc2c3e`

The draft remains under ignored
`tmp/ncaaf-release-evidence-2026-10-16/prepared/manifest.json`.
`correction-manifest.json` and `source-index.json` agree with its canonical hash.
`executionAuthorized` remains false. There is no production approval object.
Regenerating timestamps, changing an entry or refreshing before-values changes
the hash and requires renewed review. The archived snapshot is not a promise
that an active production row will remain unchanged.

## Corrected validation and preparation rules

1. Require an explicit database-observed SQL NULL flag alongside the SQL checksum.
2. Existing SQL NULL: `rawIsSqlNull=true`, `rawMd5=null`.
3. Existing non-SQL-NULL JSON, including JSON literal null:
   `rawIsSqlNull=false`, valid 32-character lowercase hexadecimal SQL MD5.
4. Missing result: `resultId=null`, `rawIsSqlNull=null`, `rawMd5=null`.
5. Reject omitted flags, inconsistent pairs, invalid hashes and invented
   missing-row checksums before database access.
6. Compare both flag and checksum under the executor's locked before-image.
7. Require a fixed-target read-only preflight capture with an exact, unique
   inventory. Reject changed reviewed scores/identities/timestamps rather than
   silently expanding this provenance-only correction.
8. Retain existing full native before-images, per-game atomic transactions,
   timestamp precision, crash-resume receipts, and controlled rollback rules.

## Restricted role: prepared and tested, NOT created in production

Review-only templates:

- `restricted-role-setup.sql`
- `restricted-role-revoke.sql`

The setup requires the approved database and a previously nonexistent dedicated
role; failure rolls the template transaction back. It grants no role memberships,
superuser, database/role creation, replication or RLS bypass. Connections are
limited to two, with statement/lock/idle-transaction timeouts.

Permissions are limited to:

- SELECT on `games` and `game_results`.
- UPDATE only score/status/update fields used by reconciliation.
- INSERT only the seven explicit result fields used for a missing result.
- USAGE on the result-ID sequence.

There is no DELETE, table-wide UPDATE, update of team identity, update of original
grading time/source, or schema creation grant. Unexpected inherited PUBLIC/schema
write access causes setup to fail rather than revoking privileges from other apps.
The revoke template explicitly removes column grants as well as table grants,
and disables login. Operator connections must be closed separately.

**Important limitation:** these are column/table restrictions, NOT database-enforced
NCAA row isolation. The reviewed executor's sport, identity, exact inventory and
target checks enforce the NCAA-only operation. Do not give this credential to an
untrusted caller or arbitrary SQL tool.

No credential was generated, displayed, saved or configured. `PASSWORD NULL` in
the template deliberately supplies no usable password. Secure authentication
must be provisioned through the approved provider/secret flow after separate
authorization; the template by itself is not a working production connection.
Do not use the production owner login for the repair.

### Permission issue found and fixed in the isolated executor

The actual non-owner role test exposed that an ORM insert listing every column
with DEFAULT still requires INSERT permission on those listed columns. Rather
than grant protected timestamp fields, the controlled adapter now uses a
parameterized seven-column INSERT. PostgreSQL supplies identity/grading/created/
updated defaults. Repair receipt attachment preserves native timestamp precision.
This change is limited to the unwired NCAA controlled executor.

## Verification

| Check | Result |
|---|---|
| Guarded NCAA offline tests | **163 passed** |
| Disposable local PostgreSQL checks | **30 passed** |
| Backend TypeScript, no emit/incremental writes | **Passed** |
| Offline real-document manifest preparation | **59 accepted, 0 quarantined** |
| Review indexes agree with corrected draft hash | **Passed** |

The local suite uses a private Unix socket, rejects ambient application credentials,
blocks external network access and worker startup, and destroys its temporary
cluster afterward. It runs the actual setup/revoke templates with only the
database-name literal adapted to the disposable test database.

Checks include the wrong-database guard, actual non-owner target verification,
column privilege limits, SQL NULL/JSON null apply-resume-rollback, missing-result
insertion, denied identity/grading changes, denied deletion and schema/role
creation, and explicit column-grant removal. The first restricted insert failed
on missing permissions, rolled back, and led to the explicit-column fix; the
complete final 30-check run passed.

The existing 409-test NFL baseline passed during the preceding preparation.
NFL files were not edited in this step; that suite was not rerun needlessly.
No application workflow was restarted because all changed code remains isolated
and the executor is not wired into the running application.

## Files changed in this step

Relative to `artifacts/api-server/`:

- `src/services/ncaafHistoricalRepair.ts`
- `src/services/ncaafHistoricalRepairPersistence.ts`
- `scripts/prepare-ncaaf-historical-repair.mjs`
- `scripts/test-ncaaf-integrity-postgres.mjs`
- `test/ncaaf-integrity/repair-fixture.ts`
- `test/ncaaf-integrity/repair.test.ts`
- `test/ncaaf-integrity/release-review/correction-manifest.json`
- `test/ncaaf-integrity/release-review/source-index.json`
- `test/ncaaf-integrity/release-review/restricted-role-setup.sql` (new)
- `test/ncaaf-integrity/release-review/restricted-role-revoke.sql` (new)
- `test/ncaaf-integrity/release-review/NULL_AND_ACCESS_REVIEW.md` (new)
- `test/ncaaf-integrity/release-review/CONTROLLED_REPAIR_REVIEW.md` (supersession notice)
- `test/ncaaf-integrity/release-review/RELEASE_REVIEW.md` (supersession notice)

Ignored capture/generated files were refreshed. Worktree-local agent memory
records the null/column-permission lesson; those notes are not backend release files.

## Production gates still required

1. Review the exact candidate changes, source/canonical bindings and restricted
   role templates. No production role or usable repair connection exists yet.
2. Separately authorize secure role/authentication provisioning. Verify the exact
   host, branch, database, login flags, memberships and effective grants before use.
3. Resolve writer coordination before applying corrections. Previously verified
   API and cron both run the same NFL release; the deployed code lacks the new
   NCAA reconciliation lock. This preparation has not changed that.
4. A future reviewed backend release must coordinate API/cron code versions and
   allow old invocations to finish, without changing the cron schedule. Verify
   there are no remaining incompatible writer paths before repair.
5. Deploying NCAA ingestion can itself change the bounded recent-final cohort.
   It is not a write-free test and is not limited to these 59 rows. Refresh
   before-values afterward; quarantine changes and re-review/reapprove any
   changed inventory/hash. Do not loosen compare-and-swap to force this draft.
6. Keep the approved evidence/manifest and private fsynced journal durably outside
   disposable build storage. Approve the exact APPLY operation separately.
7. Verify all exact repaired rows/receipts and unchanged protected fields afterward.
   Rollback is separately approved; newly inserted results are not automatically
   deleted, and code rollback does not undo data.

The backend worktree remains `dev/ncaaf-v4-historical-integrity-2026-10-16` at
parent `c7d66e18cf4d5dd6db4cc53abeb88895ee2cfdb1`, with nothing staged.
No production model equations/artifacts, historical forecasts, mobile contracts,
NFL code, other-sport code, or schedules were changed. NCAA postseason policy
remains distinct from NFL preseason policy. The frozen historical foundation and
complete all-division/all-season denominator have not been recertified.

**Preparation complete. Production historical data is still awaiting an approved apply.**
