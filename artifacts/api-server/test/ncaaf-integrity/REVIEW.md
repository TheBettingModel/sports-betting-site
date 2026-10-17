# NCAA Football V4 historical integrity — prepared candidate

Latest preparation: see `release-review/CONTROLLED_REPAIR_REVIEW.md`.
The controlled executor and complete 59-document corroboration index are now
prepared. Verification: 150 NCAA offline tests, 22 private PostgreSQL checks,
409 unchanged NFL offline tests, and backend TypeScript passed. Not applied live.

## Status and release boundary

- Worktree: `.local/ncaaf-v4-historical-integrity-2026-10-16`
- Branch: `dev/ncaaf-v4-historical-integrity-2026-10-16`
- Parent: `c7d66e18cf4d5dd6db4cc53abeb88895ee2cfdb1`, the verified live NFL-repaired backend release.
- Prepared and tested only. No commit, push, deployment, Neon connection, or production data change.
- This is NCAA-specific integrity plumbing within existing V4, not a new model.
- It is NOT a certification that all existing NCAA records or frozen historical features have been repaired.

## Earlier read-only audit: findings to address after release approval

At the audit snapshot, NCAA had 517 stored fixtures / 455 finals:

- 54 fixture/result score disagreements, INCLUDING two 0–0 fixture finals.
- Five completed fixtures without a result row.
- No duplicate fixtures in the audited date/team-ID grouping.
- Two zero-score examples: Memphis–UNLV on August 29 and NMSU–Hawai‘i on September 12.
- A bounded 336-game 2026 CFBD FBS-vs-FBS completed-game cohort had no missing canonical fixture IDs.
  This does not certify the entire NCAA schedule, nested provider payloads, or other cohorts.
- 378 paired final CFBD/ESPN captures agreed on scores and canonical team IDs.
  Agreement does NOT establish independent upstream sourcing.
- The frozen foundation's 2,398 target results matched their CFBD source results;
  2,264 were regular-season and 134 postseason. This was neither independent
  certification nor a recomputation of all frozen features.

These are audit-snapshot counts, not a claim about the database at deployment time.
The NFL investigation's missing-game count must not be reused as an NCAA count.

## Candidate behavior

1. `ncaafHistoricalIntegrity.ts` normalizes explicit event/team identity, kickoff,
   completion, integer scores, event-level season and NCAA phase. Verified URLs,
   snapshot hashes and capture times are required. Missing data is never zero.
2. A legitimate shutout is accepted. A modern tied final, including 0–0, is
   quarantined. Conflicting/ambiguous identity, scores or phase never wins by
   majority vote.
3. ESPN observations constitute one upstream family. CFBD is deliberately
   `UNVERIFIED_CFBD`, not an assumed independent corroborator.
4. The proposed offline `NCAA_OFFICIAL` contract accepts a supplied normalized
   official result only with an explicit reviewed source/canonical identity
   binding and mapping-evidence hash. No official-site acquisition/extraction
   pipeline was built or run. Synthetic official fixtures are TEST DATA ONLY.
5. NCAA regular season, bowls, CFP and unspecified postseason remain distinct.
   Exhibition/unknown evidence is not accepted. NFL playoff-exclusion rules are
   NOT imported. The proposed offline eligibility gate additionally requires
   independently corroborated FBS-vs-FBS history, explicit allowed seasons and
   actual evidence availability strictly before the target kickoff.
6. This eligibility gate does NOT replace the frozen training loader, artifacts
   or live model equations. Historical independence/classification still requires
   a separately reviewed evidence corpus before any historical input cutover.
7. The dedicated NCAA reconciler synchronizes both existing tables inside one
   pinned transaction with a transaction-scoped advisory lock and row locks.
   Existing matching results can repair stale fixture scores. Replacing a
   conflicting stored result requires supplied independent corroboration.
8. The writer preserves existing grading timestamps/source and unrelated raw
   metadata, records source hashes/captures, phase, actual availability and
   previous values, preserves stronger prior verification, and avoids writes on
   duplicate polls. Existing forecasts/grades are not recomputed.
9. Missing source evidence leaves existing records untouched. Invalid new finals
   can create only a visible NULL-score pending fixture, never a fabricated result.
   Quarantine outcomes are returned/logged, not a new persistent quarantine table.
10. `espn.ts` attaches an INTERNAL NCAA capture only to fetched NCAA finals.
    The existing Games refresh routes those finals to this writer and protects
    committed NCAA finals against racing stale nonfinal upserts.
11. The existing grading runner uses a distinct NCAA path. Blind NCAA
    `games_table_sync` is disabled. Routine sync is limited to known recent
    fixtures (14 days, 64 candidates, eight dates); missing result rows have
    priority and already reconciled matching rows are skipped. Stale-game
    recovery is limited to eight NCAA date requests. No new worker or schedule.
12. `ncaafHistoricalCoverage.ts` prepares bounded OFFLINE recovery candidates for
    a supplied schedule corpus, rejecting ambiguous identities and conflicting
    observations. It never fetches or recovers anything; windows are at most
    31 days and batches at most 64. It does not discover a complete live schedule.

## Exact source/review inventory

Modified:

- `src/services/espn.ts`
- `src/routes/games.ts`
- `src/services/grading-runner.ts`

Added:

- `src/services/ncaafHistoricalIntegrity.ts`
- `src/services/ncaafFinalIngestion.ts`
- `src/services/ncaafFinalPersistence.ts`
- `src/services/ncaafHistoricalCoverage.ts`
- `scripts/test-ncaaf-integrity-offline.mjs`
- `scripts/test-ncaaf-integrity-postgres.mjs`
- `vitest.ncaaf-integrity.config.mjs`
- `test/ncaaf-integrity/integrity.test.ts`
- `test/ncaaf-integrity/REVIEW.md`

All paths above are relative to `artifacts/api-server/`. No schema/package/
lockfile, NFL-service/test, model artifact, equation, mobile, public API schema,
deployment configuration, or scheduler definition changes.

## Verification performed

From the API directory:

```sh
node scripts/test-ncaaf-integrity-offline.mjs
# 110 passed; allowlisted tests, sanitized child environment,
# existing general offline I/O/import guard reused (not NFL model logic).

env -i PATH="$PATH" HOME=/tmp NODE_ENV=test SCHEDULER_ENABLED=false \
  node scripts/test-ncaaf-integrity-postgres.mjs
# 12 passed against actual NCAA persistence adapter and actual Drizzle
# column/default/primary/unique/foreign-key definitions.

node scripts/test-nfl-offline.mjs
# Existing, unchanged suite: 409 passed.

env -i PATH="$PATH" HOME=/tmp NODE_ENV=test SCHEDULER_ENABLED=false \
  ../../../../node_modules/.bin/tsc -p tsconfig.json --noEmit --incremental false
# Passed.

env -i PATH="$PATH" HOME=/tmp NODE_ENV=production SCHEDULER_ENABLED=false node build.mjs
# Passed. Bundling only; no startup or worker execution.
```

### Real PostgreSQL isolation

The integration runner used the already-installed PostgreSQL 16 tools. It
initialized a disposable cluster under a private `/tmp` directory with TCP
listening disabled and host authentication rejected. Only its private Unix
socket could be connected to; HTTP/fetch and other socket targets were blocked.
Ambient application credentials were absent. The test role had no superuser,
database/role creation, replication, bypass-RLS, inherited privileges or role
memberships. Empty database, database/user identity, connected-client allowlist
and absence of job extensions were verified before application table creation.
Only two synthetic-test tables were created; no application migrations ran.
The cluster was stopped and temporary cluster/bundle directories removed.

The 12 real-transaction checks covered atomic insertion, no-write idempotence,
four-way concurrency, stale 0–0 repair with grade preservation, failed insert
rollback/retry, failed update rollback/retry, NULL-score quarantine, legitimate
shutouts, NCAA postseason, conflicting-result quarantine, wrong-sport isolation,
and advisory-lock cleanup.

## Remaining release gates and limitations

- Acquire real independent official corroboration plus reviewed canonical
  mappings where historical corrections are disputed. No synthetic fixture
  may become production evidence; CFBD/ESPN agreement alone does not clear this.
- Generate and review the exact historical correction/coverage inventory from
  fresh read-only snapshots, including before-images, evidence hashes,
  classification, candidate bounds and restoration instructions.
- Review any controlled historical executor separately. This candidate does
  not execute a historical backfill, apply the earlier 54/five findings, or
  expose a public API to submit replacement finals.
- Independently assess whether frozen NCAA features need a new versioned,
  point-in-time-safe materialization. Never rewrite existing frozen rows or
  forecasts in place, and never change NFL to implement an NCAA decision.
- Recheck the live API AND separate grading worker release baselines immediately
  before any future backend release. A deployment requires its own approval.
- The integration test proves local PostgreSQL transactions, not connectivity
  or permission parity on Neon; it intentionally does not use production.
- Routine bounded retries are not a full historical discovery/backfill and do
  not guarantee progress through arbitrarily many permanently quarantined rows.
- No production data repair has happened. Current production continues using
  its existing release until an explicit approved release/correction sequence.
