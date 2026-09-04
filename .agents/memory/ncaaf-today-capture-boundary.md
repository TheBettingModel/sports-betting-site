---
name: NCAAF today-capture boundary
description: Where the day-by-day invariant must be enforced to prevent hidden future-date provider fetches.
---

Normal NCAAF game-day capture must filter odds to the current America/New_York date before deriving any additional provider schedule dates. Filtering games only after a season-wide odds response has already triggered provider fan-out does not satisfy the today-only invariant.

**Why:** A downstream current-day filter still allowed the upstream capture layer to request tomorrow and the rest of the future season.

**How to apply:** Enforce the date boundary at the first provider-response transformation used by normal scheduled capture; keep explicit historical or diagnostic date paths separate and test restart logs for absence of date+1 requests.