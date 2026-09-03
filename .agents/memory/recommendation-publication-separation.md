---
name: Recommendation versus publication
description: Durable semantic boundary between raw model output, publication safety, and subscriber display.
---

Preserve raw model recommendation, publication status/block reason, and public display as separate concepts. Public masking may remain fail-closed, but Admin counts and diagnostics must never call a blocked actionable rating a true Neutral.

**Why:** A safe approval mask made stronger raw opinions appear indistinguishable from genuine no-play model decisions, obscuring whether the model or the publication layer caused the result.

**How to apply:** Derive Admin observability additively from immutable raw decisions and exact approval/effective-pick state. Never expose blocked recommendations publicly or alter model calculations merely to improve diagnostics.