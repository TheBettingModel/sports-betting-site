# INACTIVE NFL V4 reader proposal — NOT a release patch

This document and the Vitest-only virtual module are the only proposed reader
changes. `src/services/nflV4.ts` itself is unchanged. The proposal is insufficient
for deployment until the evidence/coverage/publication blockers are resolved.

## Tested availability hunk

The guarded Vitest configuration reads the existing engine source, requires one
exact anchor match, and replaces this statement IN MEMORY:

```diff
- const completedAt = new Date(game.startsAt.getTime() + 12 * 60 * 60 * 1000);
+ const suppliedAvailability = Reflect.get(game, "verifiedEvidenceAvailableAt");
+ if (typeof suppliedAvailability !== "string" || !Number.isFinite(Date.parse(suppliedAvailability))) {
+   throw new Error("VERIFIED_HISTORY_AVAILABILITY_REQUIRED");
+ }
+ const completedAt = new Date(suppliedAvailability);
+ if (completedAt <= game.startsAt || completedAt > now) throw new Error("VERIFIED_HISTORY_TIME_UNSAFE");
```

This leaves state transitions, feature calculations, scoring models, coefficients
and artifact loading identical. No private equation is copied into the harness.
The legacy engine is still imported normally, with the existing throwing DB and
provider mocks. Neither path invokes collectEvidence().

## Proposed collector integration — not implemented

Once approved real bundles exist, collectEvidence would:

1. Resolve the target identity with the existing contract.
2. Obtain the exact externally approved manifest and immutable file set through
   a confined, bounded reader. Production filesystem confinement must check real
   paths/symlinks, not just the loader's relative-path regex.
3. Bind it to the actual artifact seed/hash, target and actual current clock.
4. Load and verify COMPLETE coverage/freshness, including native zero-game proofs.
5. Return only admitted rows, retaining kickoff and mapping the conservative
   completedAt to verifiedEvidenceAvailableAt. Do not send raw provider fields or
   partial/unverified rows into replay.
6. On a blocked bundle, return an explicitly approved internal failure state.
   Do not silently use legacy SQL history or pretend the seed is complete.

No new public response field, model ID, artifact, coefficient, historical ledger
mutation, scheduler hook, or other sport is proposed. How the public service
handles unavailable verified inputs still requires release review; nothing here
changes today's serving behavior.

## Review/deployment gate

The availability hunk alone does NOT authenticate a supplied timestamp, prove
coverage, implement persistence, or authorize production execution. The pinned
bundle gate must precede it. No activation flag or live import was added.

A complete release diff must be prepared later against the ACTUAL current Render
API commit, not assumed from this development branch. Activation and rollback of
the API/bundle pair require explicit approval.
