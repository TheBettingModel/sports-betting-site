# Odds API credit-budget release — prepared, not deployed

## Scope and baseline

This backend candidate starts at the actual deployed API commit
`4a4112308c3b322cbbf98be89886918ba748dbcb`.
The current collector is `dd81e07a864f9d0db7b0c7a553f17bb01df784e7`.
The two commits have identical `oddsApi.ts` and
`scripts/run-cloud-pipeline-once.ts` inputs.

No scoring equations, frozen artifacts, existing forecast/history rows,
entitlements, public API contracts, mobile files, or scheduler cadence change.
The branch is a backend deployment candidate, **not an Expo build source**.
The installed mobile build remains unchanged.

## Controls

* Account policy: 100,000 credits/calendar month, resetting at 00:00 UTC on
  the first; invoice dates are irrelevant.
* Daily maximum: 2,500 credits. Daily pacing releases the allowance gradually,
  with a bounded 120-credit bootstrap burst.
* Monthly operational ceiling: 80,000 credits, leaving a 20,000-credit reserve.
  The six-credit reservation granularity means at most 2,496 budgeted credits
  per day / 77,376 across a 31-day month with the current request shape.
* Each request reserves six credits (3 markets × 2 regions), atomically
  across all feeds and processes using the same key. Empty responses, failed
  requests, timeouts, and crashes retain their conservative reservation.
* Free `/sports/` probes read real provider usage before paid collection.
  Unreadable usage, missing storage, exhausted limits, and missing leases
  never fall back to unbudgeted HTTP calls.
* A feed becomes due after 15 minutes if the response has an unstarted game
  within three hours; otherwise after 60 minutes. These are **minimum
  intervals**, not guaranteed delivery times. Existing feed rotation,
  work/time limits, provider offerings, and available credits also apply.
* A persistent cache is shared across processes but only actionable for
  less than 30 minutes. Receipt and bookmaker timestamps are not refreshed
  when reading cached data. In the hourly case there can deliberately be
  periods without actionable current odds; historical Analytics observations
  remain available. No fabricated movement or stale-as-fresh prices.
* NCAAF raw audit captures require a fresh paid receipt, not a re-timestamped
  cached response. Not-due/budget deferrals are explicit provider capture
  errors, while other evidence providers continue independently. This can
  produce intentional partial-evidence diagnostics; it is not a source outage.
* API services are read-only by default. Paid collection requires
  `ODDS_API_COLLECTION_ENABLED=true` **only on the designated worker**.
  A user pulling to refresh cannot spend credits with the API flag off.
* An unexpected provider price increase records the higher charge and
  latches all new paid collection off until reviewed. The latch survives a
  calendar reset. Do not automatically clear it.
* The final UTC minute of each day is a no-start window for paid requests.
  Unknown in-flight reservations remain conservatively counted. Late
  completions cannot release newer leases or new-month reservations.
* Raw keys never enter SQL, logs, review files, or committed fixtures.
  Coordination uses a one-way SHA-256 key fingerprint.

The limits cover this deployment's controlled consumers, not unrelated
applications sharing the key. Provider usage observations include external
spending but cannot stop an outside application spending between observations.
Use a dedicated provider account/key configuration and avoid uncontrolled users
of the allowance. A key rotation must be coordinated across API and worker.

## Testing safely

The dedicated Vitest configuration installs network guards before imports.
No TCP is permitted. PostgreSQL is allowed only over a named
`/tmp/tbm-odds-budget-*/socket` Unix socket, with database and user `budget_test`.
The suite never falls back to the workspace's `DATABASE_URL`.

Use a temporary cluster, with startup/shutdown owned by the test command:

```sh
TMP=$(mktemp -d /tmp/tbm-odds-budget-XXXXXX)
mkdir "$TMP/socket"
initdb -D "$TMP/data" -U budget_test --auth=trust >"$TMP/init.log" 2>&1
pg_ctl -D "$TMP/data" -l "$TMP/postgres.log" \
  -o "-k $TMP/socket -p 6547 -h ''" -w start
trap 'pg_ctl -D "$TMP/data" -m immediate -w stop' EXIT
createdb -h "$TMP/socket" -p 6547 -U budget_test budget_test
export ODDS_BUDGET_TEST_DATABASE_URL="postgresql://budget_test@localhost:6547/budget_test?host=$TMP/socket"
export DATABASE_URL="$ODDS_BUDGET_TEST_DATABASE_URL"
pnpm --filter @workspace/api-server exec vitest run --config vitest.odds-budget.config.mjs
pnpm --filter @workspace/db exec tsc -p tsconfig.json --noEmit
pnpm --filter @workspace/api-server run typecheck
```

Without the explicit isolated target, transaction tests are skipped; do not
count that as transaction verification. The suite asserts current database,
current role, and a null server IP (Unix socket) before any schema operation.
It tests duplicate concurrent callers, different feeds, crash retention,
transaction rollback, stale completions, month/day rollover, unexpected pricing,
and existing normalization, snapshot, query, and collector behavior.

## Required production review and rollout — NOT executed

1. Review and approve the candidate diff, local commit, and branch push.
   Reconfirm the live API/worker commits have not changed since this baseline.
   If they have, reconcile their safeguards before deploying.
2. Verify a restorable production backup and the actual Render-connected
   PostgreSQL target by read-only identity checks. Do not use the Replit
   development DB, legacy Neon target, or NCAA restricted-repair credentials.
3. Check both new table names are absent, or verify an existing table's exact
   columns, types, PK/FK and check constraints. `IF NOT EXISTS` is not a schema
   compatibility check.
4. Apply only `lib/db/migrations/20261027_odds_credit_budget.sql` to the
   approved target in its bounded transaction. There is no startup DDL and
   no broad schema-push command in this rollout.
5. Prepare the API with `ODDS_API_COLLECTION_ENABLED=false`; the new code
   already defaults to read-only if unset. Keep the API's existing disabled
   in-process scheduler and all other deployment/environment settings.
6. Let the old scheduled invocation finish. Hold only that worker during the
   version transition, promote the reviewed backend commit to API and worker,
   and set `ODDS_API_COLLECTION_ENABLED=true` only on the designated worker.
   Restore the existing `*/15 * * * *` schedule; do not alter grading cadence.
   There must be no old/unbudgeted collector or parallel workspace collector
   sharing this production key. Render cron builds affect future invocations,
   not an already-running process. Do not use Trigger Run as a deployment step.
7. Verify the actual successful Render build SHAs for both services, not just
   branch names or a manually configured release label. Preserve all existing
   release/target identity settings and verify readiness separately.
8. Before quota reset, expect `MONTHLY_LIMIT` deferrals and no paid requests.
   At reset, verify UTC month/day counters, controlled `used/day_used`, fresh
   provider receipts, and named-book snapshots over normal scheduled cycles.
   Use the free provider status endpoint to cross-check credits. Verify that
   a normal API refresh leaves credit counters unchanged.
9. A visible movement comparison needs two genuinely distinct, comparable
   observations from the same book/event/selection. Neither this release nor
   a quota reset can reconstruct the missed historical interval.
10. Confirm unchanged game/grading cadence and NFL/NCAA identity, scoring,
    and immutable-forecast boundaries. No mobile rebuild or Apple submission.

## Rollback

First stop paid collection by setting the worker's
`ODDS_API_COLLECTION_ENABLED=false` (existing grading cadence unchanged).
Then review the cause and restore the previously approved API/worker releases
if necessary. **Old code ignores the new budget flag**, so rolling the worker
back and resuming it can resume unbudgeted spending. Do not automatically
resume an old collector against the production key.

Leave the two additive budget/cache tables intact for accounting and review.
Do not drop them or rewind existing game/history/forecast data. Rotating keys
does not justify deleting accounting evidence. A provider-pricing latch should
only be cleared after verifying request parameters, actual cost, and remaining
account allowance under a separately approved change.
