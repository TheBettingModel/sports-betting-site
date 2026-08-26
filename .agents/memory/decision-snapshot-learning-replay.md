---
name: Decision snapshot learning replay
description: Safe handling of immutable prediction-evidence schema changes in the per-pick learner.
---

The learner accepts complete decision-evidence snapshots from immutable schema
versions 2 through 5. Version 5 is the material-pregame revision shape and
retains the same decision evidence required for safe review and learning. When
a validator correction makes a previously skipped snapshot valid, replay only
records explicitly marked as insufficient evidence; never replay a completed
review.

**Why:** A version mismatch can otherwise silently stop calibration and factor
learning. Broadly resetting processing markers risks applying the same
outcome twice and corrupting EMA weights.

**How to apply:** Require complete decision evidence before replaying, retain
the transaction claim around metric updates, and ensure a successful replay
replaces the insufficient status with a completed review. Keep replay ordering
deterministic because EMA updates depend on order. Extend the shared validator
when a new immutable revision shape preserves that complete evidence.