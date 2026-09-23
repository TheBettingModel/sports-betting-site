---
name: V4 core model quality gates
description: Rules for building simpler V4 cores without legitimizing weak or structurally defective candidates.
---

A smaller PIT-safe V4 core is acceptable only when it beats an appropriate non-market baseline and has no severe score bias, leakage, or live/train semantic mismatch. A technically fitted model that fails those gates remains unbuilt and must not be frozen or registered.

**Why:** Short-window development data can support model fitting while still producing worse-than-trivial probabilities or compressed scores. Artifact existence is not evidence of model validity.

**How to apply:** Use chronological validation, report score bias and probability metrics, and reject rather than preserve failed candidates. Keep the sport fail-closed until a legitimate candidate passes.