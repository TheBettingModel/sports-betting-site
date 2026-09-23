---
name: NFL V4 shadow boundary
description: Durable season, data, lifecycle, and execution rules for the NFL V4 core.
---

NFL V4 uses an NFL-only season-aware Elo plus regularized scoring model. NFL seasons roll on July 1, with inter-season state regressed toward league priors. Pro Bowl AFC/NFC events are non-club games and must remain quarantined.

**Why:** The generic rolling-score candidate failed the probability baseline, while the NFL-specific core passed only after controlled chronological validation. Mixing non-club events or generic season handling would invalidate that evidence.

**How to apply:** Keep the model market-free and hindsight-free; use exact frozen-artifact/live execution; persist prospective forecasts as append-only shadow evidence; keep publication disabled until a later prospective promotion decision.