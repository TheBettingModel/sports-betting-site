---
name: MLB V4 shadow boundary
description: Durable lifecycle and evidence rules for the MLB V4 run-based challenger.
---

MLB V4 is permanently shadow-only and non-deployable. Its registry identity must not move beyond challenger status, and every writer must recheck that status rather than rely on a process cache.

**Why:** A normal challenger lifecycle could accidentally promote an unvalidated model, and a first-write-only snapshot would freeze morning evidence before starters, lineups, weather, or markets settle.

**How to apply:** Write materially distinct point-in-time forecasts as append-only revisions, deduplicate identical inputs, keep official units at zero, and grade outcomes only in the forecast-review research ledger. Champion snapshot capture and learning must never mutate the frozen V3 configuration.

The first strict historical replay supports a V4.1 research challenger, not promotion or continued as-is validation. The clean window was below the minimum diagnostic sample, V4 did not beat the no-vig market, and the run model materially underpredicted total scoring.

**Why:** Proper scoring improved modestly over V3, so the auditable run-first architecture remains worth researching, but negative market skill and broad run underprediction are evidence-supported implementation weaknesses.

**How to apply:** Keep V4 unchanged and shadow-only. Treat run-environment correction, lineup capture, and away/underdog diagnosis as offline V4.1 experiments; require a larger chronological held-out replay before fitting calibration or distribution changes.