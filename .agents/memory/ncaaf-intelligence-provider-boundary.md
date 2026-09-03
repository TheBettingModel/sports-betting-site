---
name: NCAAF intelligence provider boundary
description: Durable provider and prospective-cohort constraints for the future independent NCAAF engine.
---

The currently configured NCAAF sports-intelligence source supports scoreboard identity, schedule/context, and scores only. It does not support trustworthy PIT-safe play efficiency, QB, roster, injury, coaching, talent, transfer, or NCAAF weather evidence. Missing domains must stay explicit and must block V4 readiness rather than being proxied from records or markets.

**Why:** The future NCAAF engine requires independent football intelligence and early-season priors. Scoreboard evidence alone cannot support a defensible expected-score model, and sportsbook evidence is downstream comparison data rather than a substitute.

**How to apply:** Require a timestamped football-data provider before starting the final V4 model. Keep FINAL_PREGAME immutable and sports-only. LIVE_SHADOW is prospective only from `2026-09-03T19:30:00.000Z`, activation version `ncaaf-live-shadow-v1`, collection version `ncaaf-evidence-v1`; never backfill it.