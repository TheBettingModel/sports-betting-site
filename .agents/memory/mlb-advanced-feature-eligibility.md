---
name: MLB advanced feature eligibility
description: Strict evidence gate separating stored MLB research fields from features approved for a future challenger.
---

A field is not eligible for a future MLB challenger merely because it exists in a schema, provider response, or occasional snapshot. Approval requires consistent pre-first-pitch availability, strict PIT timestamps, stable identity where applicable, immutable captured evidence, and historical support sufficient for honest validation.

**Why:** Partial provider coverage and present-day aggregate values can look technically available while still preventing reproducible replay or introducing future leakage. Treating those fields as ready would design a challenger around evidence it cannot consistently receive or validate.

**How to apply:** Keep four separate classes: ready, live-forward candidate needing OOS evidence, partial/inconsistent, and unsupported. Never promote PARTIAL PIT support, PARTIAL live availability, unproven player mapping, or missing historical PIT evidence into the ready list.