---
name: MLB V4 shadow boundary
description: Durable lifecycle and evidence rules for the MLB V4 run-based challenger.
---

MLB V4 is permanently shadow-only and non-deployable. Its registry identity must not move beyond challenger status, and every writer must recheck that status rather than rely on a process cache.

**Why:** A normal challenger lifecycle could accidentally promote an unvalidated model, and a first-write-only snapshot would freeze morning evidence before starters, lineups, weather, or markets settle.

**How to apply:** Write materially distinct point-in-time forecasts as append-only revisions, deduplicate identical inputs, keep official units at zero, and grade outcomes only in the forecast-review research ledger. Champion snapshot capture and learning must never mutate the frozen V3 configuration.