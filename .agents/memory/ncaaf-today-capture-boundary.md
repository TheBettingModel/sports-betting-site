---
name: NCAAF rolling capture boundary
description: Where the rolling seven-day invariant must be enforced to prevent hidden provider fetches beyond the projection horizon.
---

Normal NCAAF projection capture must use an explicit list of today plus six America/New_York calendar dates. Each provider request must be restricted to its requested date before deriving any additional schedule dates. Filtering games only after a broad response has already triggered provider fan-out does not satisfy the bounded-horizon invariant.

**Why:** A downstream date filter previously allowed the upstream capture layer to request the rest of the future season. The subscriber product now intentionally supports seven days, but no unbounded prefetch.

**How to apply:** Enforce each requested date at the first provider-response transformation used by scheduled capture; keep historical or diagnostic paths separate and test that no request exceeds today plus six Eastern dates.

The first verified production live-week observation is fixed at
`2026-09-22T15:06:45Z` and closes at `2026-09-29T15:06:45Z`.

**Why:** Moving the start after partial or failed intervals would make the
seven-day stabilization result unauditable.

**How to apply:** Keep the start and completion timestamps visible in the
admin health report; do not reset them to accelerate or delay review.