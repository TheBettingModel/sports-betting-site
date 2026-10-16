# NFL V4 combined historical-integrity phase — review

## Outcome

PARTIAL / BLOCKED FOR REAL-DATA RELEASE. Offline implementation and tests pass;
the evidence-acquisition gate did not pass. Nothing is committed or activated.
Development base: fd071be387904299a04c8bee0975f73772c5bdb6.

## Source and rights pilot, 2026-10-15

Only public terms/documentation were requested. No ESPN score endpoint, NFL/club
result document, provider API, or application endpoint was requested.

- NFL terms, updated May 16, 2024:
  https://support.nfl.com/hc/en-us/articles/35869743904916-NFL-com-Terms-and-Conditions
  Section 1.3 limits permitted use to individual noncommercial informational use
  and restricts systematic retrieval absent express prior written consent.
- Disney terms, updated May 24, 2024:
  https://disneytermsofuse.com/english/
  The introduction includes ESPN-branded products. The restrictions include
  automated access/extraction and dataset compilation; the license is limited.

No applicable permission was established from the supplied project material.
This is not a determination that no special agreement could exist. The result is
to STOP both proposed acquisition paths, not to circumvent them using a mirror.
No paid feed, alternate API credential, or new infrastructure was provisioned.

These terms pages were research, NOT NFL result evidence. No original result
capture, approved source catalog, real cross-provider mapping, or independent
complete schedule inventory was created. Existing ESPN integration code is not
evidence of authorization or of a second upstream provider.

## Real fixture coverage

- Newly acquired authentic result captures: 0.
- Newly independently verified real fixtures: 0.
- Actual required September/post-seed fixture denominator: UNKNOWN.
- September 9/14 disputed scores and September 27 missing fixtures: UNRESOLVED.
- Frozen artifact and previously persisted forecasts: UNCHANGED.
- No historical performance improvement or complete real coverage is claimed.

The pre-existing 1,143-row ESPN export stops in February 2026 and does not
establish September results. It is not upgraded to verified status by this work.
Newly obtained evidence will be available only at its actual capture/verification
time, never retrospectively at a game's kickoff.

## Implemented offline components

`src/services/nflHistoricalBundle.ts`:

- An injected-reader loader: no filesystem imports, provider calls, database
  imports, startup, scheduling, or forecast collection.
- Separate externally supplied manifest, inventory, source/rights approvals.
  A bundle cannot approve itself. These are trust inputs, not a new source
  authenticity implementation or cryptographic reviewer identity system.
- SHA-256 pins on exact manifest/window UTF-8 text.
- Simple relative JSON-file allowlist; no arbitrary paths.
- At most 32 windows, 2,048 required IDs, 128 KiB manifest, 16 MiB per window,
  and 32 MiB combined window data.
- Artifact, target kickoff, frozen-seed and verification-time binding.
- Gapless bounded windows from the declared frozen seed to verification cutoff.
- Reuse of existing result/phase/provenance/coverage/input verification.
- Global required-versus-eligible event comparison and duplicate/capture-ID
  conflict checks; partial verified counts but NO partial replayable history.
- Explicit MISSING, INVALID, UNAPPROVED, STALE, INCOMPLETE, CONFLICTED, and
  READY_FOR_OFFLINE_REPLAY statuses.
- A reviewed refresh deadline, no later than 24 hours after the cutoff; the
  operator must choose an earlier deadline when the next kickoff/status change
  requires it. No live schedule lookup is implied.
- All persistence/production/live-integration authorization flags remain false.

`test/nfl-offline/historical-replay.ts`:

- Compares the unchanged engine against an in-memory availability-only proposal.
- Uses the exact committed frozen artifact; checks its hash and nonmutation.
- Calls materializeInput/validateInput/predict only, never collectEvidence.
- Requires the guarded offline runner and correctly bound, nonexpired bundle.
- Replays actual evidence availability rather than kickoff-plus-12-hours in
  the virtual proposal. Model equations and coefficients are not copied/refitted.
- Source patch anchor must match exactly once, or the test configuration aborts.

## Tests and comparison

Guarded offline suite: 283/283 PASS, 11 suites.
Existing tests: 240 unchanged. New tests: 34 bundle + 9 replay.
Targeted strict TypeScript check: PASS, no emit/incremental output.

The first verification pass found replay-fixture and TypeScript issues; the final
suite and check pass. No validation rule was weakened to make a fixture pass.

Same synthetic rows in both paths: score and probability deltas are exactly zero.
Availability cutoffs differ as expected.

Synthetic seven-game 0–0-versus-31–10 mechanics comparison:

| Output | Legacy synthetic history | Corroborated synthetic history |
| --- | ---: | ---: |
| Expected home score | 12.391167 | 23.351479 |
| Expected away score | 14.460931 | 17.304583 |
| Home win probability | 0.481228 | 0.758852 |

Artifact hash:
0da3f4e62a88da4c8d486b6433ca83c907e2cbd2fc072834817cbdb919233c5e

This is NOT a recovered real game or backtest. Fixtures are fictional, including
fictional offseason games to exercise every window without waiving empty-window
verification. No historical prediction record is rewritten.

## Important unfinished parts — not release-ready

1. Applicable rights and authentic independent source acquisition.
2. Native reference-provider decoder and genuinely reviewed identity bridge.
   Current result proofs still use the existing ESPN-compatible schema.
3. Original-response/request-metadata capture and lineage into decoded records.
   The existing provenance URL/query-string restriction remains unchanged.
4. Exhaustive native inventory proofs, including zero-game intervals. Existing
   coverage intentionally treats empty supplied expectations as UNCERTAIN.
   A supplied empty array or reviewer-declared ID list does not override that.
   Real seed-to-cutoff coverage must establish such periods independently.
5. Real replay comparison and full actual post-seed coverage.
6. A concrete operational bundle reader/publication location and live integration.
   The injected reader is not a symlink-safe production filesystem adapter.
7. Actual current Render commit comparison and final deployable release patch.

## Operator refresh and publication plan — specification, not automation

1. Establish access/rights and upstream lineage before acquiring anything.
2. Use an explicit bounded capture command, never application startup/scheduler.
   Preserve original bytes, request parameters (excluding credentials), hashes,
   capture/publication times and provider IDs. Never label transformed JSON raw.
3. Decode sources and review identity/phase conflicts. Retain superseded/bad
   observations outside the admitted replay set with an explicit resolution trail.
4. Independently establish the COMPLETE expected inventory and zero-game periods.
   Validate all post-seed completed regular-season results. Account for pending,
   cancelled, postponed and interrupted fixtures; do not infer finals by time.
5. Produce versioned immutable files in gapless <=35-day windows. Validate both
   per-window and whole-bundle coverage. Stage the complete bundle, then publish
   its separately reviewed digest last; a hash mismatch/interrupted publication
   must fail closed, never serve a mixed dataset.
6. Obtain separate source/rights/inventory approval. Set expiry at the earlier
   required refresh boundary, at most 24h after verification. Refresh after newly
   completed games and before later forecast batches need them.
7. Re-run guarded tests and same-artifact replay; inspect deltas. No historical
   evaluation may use evidence unavailable at its claimed prediction timestamp.
8. Future activation requires separate review. A stale/missing/incomplete bundle
   must not masquerade as complete history or silently fall back to legacy rows.
   This offline status is NOT yet wired into any public availability policy.

## Release and rollback boundaries

There is NO deployable release recommendation at this stage. See
INACTIVE_READER_PROPOSAL.md for the test-exercised hunk and remaining collector
design. Never deploy the development worktree wholesale.

After evidence readiness, compare the actual live Render commit again. Prepare
an NFL-only patch on that production baseline, preserving production-only fixes.
Review the exact release SHA, unchanged artifact hash, approved bundle hash and
previous API/bundle pair. Publication must use existing immutable forecast rules.
Rollback selects the previous code/bundle pair; it does not delete or rewrite
forecast history. No SQL rollback is needed for the current offline-only work.

## Exact modified/new inventory

Paths are worktree-relative. The unrelated memory addition was restored before
the approved local offline checkpoint; the checkpoint contains these ten files.

Modified:
- artifacts/api-server/scripts/test-nfl-offline.mjs
- artifacts/api-server/vitest.nfl-offline.config.mjs

New:
- artifacts/api-server/src/services/nflHistoricalBundle.ts
- artifacts/api-server/test/nfl-offline/bundle-fixtures.ts
- artifacts/api-server/test/nfl-offline/historical-bundle.test.ts
- artifacts/api-server/test/nfl-offline/historical-replay.ts
- artifacts/api-server/test/nfl-offline/historical-replay.test.ts
- artifacts/api-server/test/nfl-offline/virtual-replay.d.ts
- artifacts/api-server/test/nfl-offline/COMBINED_PHASE_REVIEW.md
- artifacts/api-server/test/nfl-offline/INACTIVE_READER_PROPOSAL.md

No database connections, migrations, provider result acquisition, production API
requests, backfills, commits, pushes, merges, mobile/scheduler/Render changes, or
deployments were performed. Existing verification policy is unchanged.
