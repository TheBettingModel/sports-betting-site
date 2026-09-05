---
name: MLB PIT intelligence contract
description: Durable rules for collecting and evaluating MLB point-in-time research evidence.
---

The MLB intelligence dataset is additive, append-only, and live-forward. Pregame revisions, the final pregame freeze, provider payloads, postgame pitcher/bullpen/team outcomes, market observations, cohorts, and evaluations remain separate records linked by exact evidence identity.

Historical schedule rows without authoritative completion timestamps are only partial research candidates. An earlier official game date is a conservative chronology proxy, not proof that the result was available before a later first pitch; such rows must remain non-training-safe and core-ineligible.

**Why:** Historical providers cannot reliably reconstruct what was known before first pitch. Postponed, suspended, or resumed games can violate date-only ordering, and backfilling unavailable fields with present-day values would create future leakage and invalidate challenger evaluation.

**How to apply:** Never rewrite a frozen revision, infer missing values as zero, treat a prediction-time quote as a closing quote, or feed postgame/closing evidence into a forecast. Historical score-derived rows require a proven completion-before-cutoff boundary before training. New model work may read only explicitly versioned research cohorts and must leave V3/V4/V4.1 behavior unchanged until independent OOS gates justify a separate approval.

Completion-time proof must retain the exact provider response body used by the resolver, content-addressed by its byte hash. A normalized chronology subset plus a hash of an unavailable larger response is not independently reproducible.

**Why:** Normalized evidence can prove internal consistency but cannot establish that omitted provider fields were faithfully represented. Exact raw-body retention allows a later audit to re-hash, re-parse, and re-derive every timestamp.

**How to apply:** Use a fixed, documented provider projection; store its exact body, endpoint, retrieval time, byte length, and hash append-only; bind the normalized evidence and artifact manifest to that snapshot. Keep schema, resolver, collector, materializer, and audit versions sourced from one shared constant so a partial collection cannot land under a mismatched version.

Calendar-day workload features must use the provider's official baseball date, while information admission must independently use strict canonical completion-before-cutoff proof. Empty evidence states may retain zero sample counts, but every unavailable statistical metric remains null.

**Why:** UTC completion dates can cross midnight and non-adjacent games can fall inside elapsed-time windows, so they cannot prove back-to-back baseball dates. Encoding unavailable rates as zero creates false statistical certainty.

**How to apply:** Consecutive-use features require appearances on every immediately preceding official baseball date; doubleheaders remain one baseball date. Verify sealed datasets with a separately implemented persisted audit that does not reuse production parse, replay, normalization, or hash helpers.