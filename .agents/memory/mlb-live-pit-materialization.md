---
name: MLB live PIT materialization
description: Durable rules for leakage-safe, idempotent prospective MLB feature materialization and readiness accounting.
---

Historical source rows may enter a prospective snapshot only when both the sports event boundary and the row's recorded/created time are strictly before the feature cutoff. Deduplicate revised pitcher artifacts by canonical game using the latest version available before that cutoff.

**Why:** Completion timestamps alone allowed later backfills to change an already-frozen starter state. Duplicate historical pitcher artifacts also made repeated materialization choose different revisions, producing new feature hashes without new prospective evidence.

**How to apply:** Version every semantic correction to collector, state, context, or model-input contracts. Readiness and pair metrics must join through the exact current feature version, preserve older rows as superseded evidence, and prove idempotency with an immediate second materialization that writes nothing.