# NCAA saved-slate serving repair

## Isolation and release boundary

Base: live API/scheduler commit `c7d66e18cf4d5dd6db4cc53abeb88895ee2cfdb1`.
Branch: `fix/ncaaf-slate-serving-2026-10-16`.

This candidate is separate from the NCAA historical correction worktree. It
does not apply, authorize, or depend on the proposed historical corrections.
Nothing is staged, committed, pushed, or deployed during preparation.

## Confirmed observations

- The preview's October 17 NCAA projections request failed with HTTP 502 at
  45,001 ms. Multiple earlier attempts also failed.
- The existing public route calls provider-backed fixture discovery and then
  awaits serial per-event V4 generation/persistence before replying.
- The production database contains 52 NCAA fixtures for October 17 and
  pre-kickoff saved exact-current-artifact forecasts for 49 of them.
- The three games without saved current V4 projections are Charleston
  Southern–Clemson, The Citadel–Texas A&M, and Elon–Stanford. These are
  FCS–FBS matchups; do not substitute NFL, legacy, or fabricated projections.
- A read-only `EXPLAIN ANALYZE` of the equivalent exact-artifact saved-slate
  SELECT returned 49 rows in 121.656 ms (planning 2.656 ms). This is database
  execution time, not an end-to-end app benchmark.

The serial generation path amplifies slate size. CPU, provider latency, and DB
time within the old request have not been individually profiled. No API
request that generates forecasts, scheduler run, or provider request was
triggered for this investigation.

## Candidate behavior

- Only NCAAF takes the new read-only public serving path.
- Read the stored requested-date fixture list; the existing scheduled pipeline
  continues to own schedule ingestion and immutable forecast production.
- Select at most one latest snapshot per fixture in SQL, tied to the same
  kickoff and exact registered artifact/configuration/contract/parameters.
- Revalidate payload hash, canonical model identity, forecast and feature
  identities, finite scores/probabilities, and pre-kickoff chronology.
- Reject suspended engines and invalid latest rows; do not silently find an
  older convenient row or execute a different model.
- Retain every fixture. Missing projections use the existing unavailable-card
  response contract with a clear reason.
- Preserve stored prediction timestamps and outputs unchanged. The next
  ordinary scheduled capture becomes visible on the next client refetch.
- The route no longer retries synchronous NCAA generation when the saved
  slate is empty. This intentionally makes scheduler health important, while
  keeping the fixture list visible and explaining missing projections.
- Other sports continue through the existing route logic.

## Verification

- 27 synthetic unit tests passed.
- One additional ignored, local replay test passed against a read-only
  October 17 capture: 52 fixtures, 49 unchanged accepted forecasts, 3 gaps.
- Existing offline I/O guard, import guard, and sanitized child environment
  were used. Tests made no database/network/startup calls.
- Backend TypeScript: `tsc --project artifacts/api-server/tsconfig.json
  --noEmit --incremental false` passed.
- `git diff --check` passed.
- The mobile Games screen already renders each returned fixture as either a
  projection card or an unavailable card. No mobile response-schema or code
  change is needed.

The local replay, captured evidence, and verification configuration are under
ignored `artifacts/api-server/tmp/`; do not stage them.

## Before and after any separately approved deployment

1. Review only the route, two new services, unit tests, and this report. Exclude
   local evidence, dependency symlinks, memory notes, and historical repairs.
2. Reconfirm the actual live API commit has not advanced; include any newer
   production safeguards before preparing an exact release commit.
3. Do not alter the scheduler schedule or mobile build. This reader can consume
   forecasts from the currently deployed scheduler; no worker change is
   required by this patch.
4. After approval/deployment, verify the exact API commit and an authenticated
   October 17 board request. Require all 52 fixtures, 49 or more valid stored
   projections (depending on subsequent captures), explicit gaps, unchanged
   entitlement enforcement, and acceptable full-response latency.
5. Verify another sport still follows its unchanged path. Do not claim live
   resolution before these checks.
6. Code rollback is the previous approved API commit. No data rollback is
   needed: the NCAA reader creates or changes no records.
