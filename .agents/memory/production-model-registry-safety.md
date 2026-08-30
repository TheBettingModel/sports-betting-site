---
name: Production model registry safety
description: Durable safeguards for selecting, promoting, restoring, and rolling back production model versions.
---

Only canonical TBM model identities may occupy a production registry slot. Enforce one production row per sport and market in the database, and serialize every operation that enters or leaves that slot with the same transaction-scoped lock.

**Why:** A fixture-like MLB model was able to become the active production registry row. Repairing only the selector would not prevent stale concurrent promotions, misleading audit history, or a rollback from restoring another fixture.

**How to apply:** Revalidate status, incumbent comparisons, approvals, and rollback targets after acquiring the slot lock. Emergency restoration must require immutable evidence of a prior named, non-system-approved deployment. Never rewrite historical predictions, and never treat registry restoration as exact market publication approval.