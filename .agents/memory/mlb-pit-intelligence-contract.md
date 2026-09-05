---
name: MLB PIT intelligence contract
description: Durable rules for collecting and evaluating MLB point-in-time research evidence.
---

The MLB intelligence dataset is additive, append-only, and live-forward. Pregame revisions, the final pregame freeze, provider payloads, postgame pitcher/bullpen/team outcomes, market observations, cohorts, and evaluations remain separate records linked by exact evidence identity.

Historical schedule rows without authoritative completion timestamps are only partial research candidates. An earlier official game date is a conservative chronology proxy, not proof that the result was available before a later first pitch; such rows must remain non-training-safe and core-ineligible.

**Why:** Historical providers cannot reliably reconstruct what was known before first pitch. Postponed, suspended, or resumed games can violate date-only ordering, and backfilling unavailable fields with present-day values would create future leakage and invalidate challenger evaluation.

**How to apply:** Never rewrite a frozen revision, infer missing values as zero, treat a prediction-time quote as a closing quote, or feed postgame/closing evidence into a forecast. Historical score-derived rows require a proven completion-before-cutoff boundary before training. New model work may read only explicitly versioned research cohorts and must leave V3/V4/V4.1 behavior unchanged until independent OOS gates justify a separate approval.