---
name: MLB policy revisions
description: Immutable recommendation-policy revisions for unstarted MLB moneyline games.
---

MLB recommendation-policy changes must create a new immutable revision and
replacement prediction/pick, never update an existing prediction or result.
Only games still marked upcoming with a future provider start timestamp are
eligible; recheck this cutoff inside the same locked transaction that writes
the replacement.

**Why:** A threshold-only change otherwise rewrites the context users saw,
creates duplicate grading, or accidentally alters a game after first pitch.

**How to apply:** Keep one effective pick per game/market for the live feed.
Retain superseded records for audit, settle a superseded pregame pending result
as an explicit void with its policy-revision audit entry, and grade only the
effective decision against the final score.

For a managed production rollout, introduce the effective-selection column
with a false default so legacy overlapping rows do not block the partial unique
index. Before serving traffic, run a data-only reconciliation that selects the
newest legacy pick per game/market. All current-decision writers and that
reconciliation must use the same transaction-scoped game/market advisory lock.

**Why:** Production schema publishing cannot safely create the unique index
when historical duplicate picks inherit an effective=true default. A shared
lock avoids selecting a legacy winner over a concurrently published decision.

**How to apply:** Do not add custom production migrations or startup DDL for
this case; let Publish apply the schema diff, then reconcile legacy data
idempotently at application startup before accepting requests.

The legacy reconciliation must be set-based, not one transaction per
game/market. It runs before the API opens its port and deployment readiness
times out if production history is processed sequentially.

**Why:** Production history can be large enough for a per-group startup loop
to miss the deployment health-check deadline even though the reconciliation is
correct.

**How to apply:** Use one transaction with the rollout lock and a
transaction-scoped `SHARE ROW EXCLUSIVE` lock on published picks. That also
protects the one-statement winner selection from pre-change application
instances during a rolling deployment.

For a pregame revision that can wait on advisory locks, enforce the start
cutoff inside the locked transaction with PostgreSQL `clock_timestamp()`, and
roll back the full transaction if either pre-write cutoff check fails.

**Why:** `CURRENT_TIMESTAMP` is frozen at transaction start, so it can approve
a revision after first pitch when the transaction waited behind a lock.

**How to apply:** Use the same game/market effectiveness lock for revisions and
grading, then recheck `status='upcoming'` and `starts_at > clock_timestamp()`
immediately before writing or replacing an effective decision.

MLB moneyline favorites at -160 or shorter are always Neutral. That ceiling
must apply to the initial projection, manual policy revisions, and automatic
pregame replacements; a policy may be stricter but must never relax it.

**Why:** A one-time repair can be undone when an ordinary refresh calculates a
new effective decision through a looser model path.

**How to apply:** Share the ceiling across all decision writers and run a
fixed-key, idempotent pregame repair at startup for any active future pick that
was published at a retired, more expensive price.