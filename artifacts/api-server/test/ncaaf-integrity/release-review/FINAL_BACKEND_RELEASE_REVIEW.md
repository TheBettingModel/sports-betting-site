# NCAA historical-integrity backend release

## Release identity and scope

Branch: `fix/ncaaf-historical-release-2026-10-16`.
Parent: `388fb376398a7ebeecef5bca79d4e8f4f2f49a5d`, the verified live NCAA
saved-slate loading release. The scheduler baseline remains the compatible
NFL integrity release `c7d66e18cf4d5dd6db4cc53abeb88895ee2cfdb1`.

This review supersedes earlier release-status/test-count statements, not their
archived evidence or provenance findings. The earlier draft correction manifest
is NOT an authorization to change production data.

The release preserves the entire loading fix, NFL model and safeguards, frozen
NCAA/NFL artifacts, immutable forecasts, public response schemas, mobile source,
existing cron command and schedule, and other sports' execution behavior.

## Reviewed implementation

- NCAA-only normalization, season-phase policy, source/provenance validation,
  duplicate/conflict quarantine, missing-fixture coverage reports, and bounded
  controlled correction planning.
- Atomic, idempotent fixture/result reconciliation on existing tables, with
  per-game transaction advisory locks and protected grading/provenance fields.
- Valid shutouts remain valid; suspicious 0–0, absent evidence and conflicting
  existing finals fail closed. No guessed replacement scores.
- Separate NCAA rules retain Week Zero and valid postseason games; NFL preseason
  rules are not reused for NCAA.
- Refresh, result synchronization, stale recovery, V4 fixture discovery and
  legacy snapshot final writing all delegate NCAA finals to the same reconciler.
- Non-final V4 discovery cannot overwrite a stored NCAA final. Duplicate raw
  discovery observations are checked before deduplication.
- Shared analytics fixture persistence already updates only upcoming future
  fixtures, not stored finals; its behavior was not changed.
- The controlled historical executor requires an exact target, manifest approval,
  locked before-images, narrow permissions and durable receipts/journal. It is
  not exposed as an automatic startup task or public endpoint.
- Explicit SQL NULL versus JSON-null provenance and the restricted-role insert
  fix from the prior review are retained.

## Tests

- 194 guarded NCAA/loading checks passed: 110 integrity, 53 controlled repair,
  27 saved-slate and four source-boundary checks.
- 36 disposable local PostgreSQL checks passed, including six additional tests
  executing the actual V4 discovery writer against the actual schema:
  valid new final, stale upcoming overwrite prevention, suspicious 0–0 pending
  fixture, invalid score quarantine, fixture/result synchronization and unchanged
  NFL discovery routing.
- The 409-test guarded NFL baseline passed.
- Backend TypeScript, no emit/incremental writes: passed.
- Git diff whitespace/error check: passed.

Only synthetic fixtures and a private local Unix-socket PostgreSQL cluster were
used for this release verification. Application credentials were removed from
test children; external network and application/worker startup were blocked.
No production query or endpoint that generates forecasts was run by these tests.

## Production effects: code deployment is not a write-free test

The existing worker, without any schedule change, can reconcile source-backed
recent NCAA finals and capture new final provenance. The result-sync selection
is bounded to 14 days, 64 candidates and eight date requests per invocation;
existing stale recovery also bounds NCAA date requests. Discovery/refresh
process only their existing requested schedule/feed populations.

This may repair some recent reviewed discrepancies or change their before-images.
It does NOT certify independent corroboration for every new provider result:
primary-provider results remain labeled SINGLE_UPSTREAM unless stronger evidence
actually exists.

It does NOT automatically execute the 59-game archived correction draft, discover
all historical games, recertify the frozen 2023–2025 foundation, or make a claim
about complete all-season/all-division coverage.

## Coordinated manual rollout

1. Verify GitHub's exact reviewed release SHA and that live baselines have not
   advanced. Do not deploy an unreviewed branch tip.
2. Update the existing scheduler service to this release branch and manually
   build the approved commit using its Builds page. Do not press Trigger Run,
   change its command, or change `*/15 * * * *`.
3. Confirm the scheduler build succeeded. Allow any invocation started on old
   code to finish before declaring writer coordination complete.
4. Manually deploy the same exact commit to the API. Preserve its root, commands,
   secrets, authentication/entitlements, database target and auto-deploy setting.
5. Verify both service commits, normal scheduled-run health and advisory-lock
   cleanup. Verify the NCAA saved-slate board still loads all scheduled fixtures;
   check another sport without triggering a new heavy refresh.

## Separate historical APPLY gates

1. Use read-only production checks to refresh the reviewed 59-game inventory
   after the coordinated rollout. Preserve identity and null-provenance checks.
2. Quarantine changed rows and re-review any changed manifest hash; never bypass
   compare-and-swap to force the archived draft.
3. Provision and verify the reviewed restricted login through the approved
   secure flow. Do not use the production owner login for the repair. The
   supplied role template has PASSWORD NULL and is not a usable credential.
4. Reviewed role grants restrict columns/tables, not NCAA rows in PostgreSQL.
   NCAA row scope is enforced by the trusted executor and exact manifest.
5. Store the private fsynced repair journal and approved evidence outside
   disposable build storage. Approve the exact target/hash/APPLY operation.
6. Apply only that approved manifest, then verify every corrected row, receipt,
   protected field, duplicate check and resumed/failed operation explicitly.

Rollback of code restores the API and scheduler's respective prior approved
commits. It does not undo corrected data. Data rollback is separately approved,
uses locked before/after images, and never automatically deletes inserted finals.
