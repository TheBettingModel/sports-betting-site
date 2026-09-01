---
name: Safe free-pick contract
description: The durable boundary between the persisted daily free-pick decision and what non-Pro clients may render.
---

Persist the daily free pick by exact published-pick ID and authorize its exact market and selection. Non-Pro clients receive a dedicated allowlisted free-pick DTO plus schedule-only locked game rows.

**Why:** Unlocking by game ID can expose another market or a Top Pick on the same game. Returning a redacted full projection is also brittle: either premium fields leak or the card becomes unrenderable.

**How to apply:** Reject candidates with effective Top Pick siblings, never choose a fallback after persistence, and include only public matchup/schedule identity, exact market/selection, and the public recommendation label. Never include probabilities, scores, confidence, edge, EV, ROI, units, sharp signals, reasons, or analysis.