---
name: Decision snapshot learning replay
description: Safe handling of immutable prediction-evidence schema changes in the per-pick learner.
---

The learner accepts decision-evidence snapshots from all supported immutable
schema versions. When a validator correction makes a previously skipped
snapshot valid, replay only records explicitly marked as insufficient evidence;
never replay a completed review.

**Why:** A version mismatch can otherwise silently stop calibration and factor
learning. Broadly resetting processing markers risks applying the same
outcome twice and corrupting EMA weights.

**How to apply:** Require complete decision evidence before replaying, retain
the transaction claim around metric updates, and ensure a successful replay
replaces the insufficient status with a completed review. Keep replay ordering
deterministic because EMA updates depend on order.