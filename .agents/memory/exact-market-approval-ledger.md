---
name: Exact market approval ledger
description: Durable rules separating research opinions from official publication permission.
---

Production permission is an append-only lifecycle decision with `UNVALIDATED`, `SHADOW`, `PROVISIONAL`, `PRODUCTION_APPROVED`, and `SUSPENDED` states. It must bind exactly to sport, market, model version, evaluation version, dataset version, feature schema version, and evidence cutoff. Missing, stale, ambiguous, or mismatched decisions fail closed.

**Why:** Mutable model status and broad sport-level promotion can accidentally approve another market or evidence version. Raw opinions must remain available for research without becoming subscriber recommendations, units, notifications, or official records.

**How to apply:** Preserve immutable prediction values. Resolve publication permission separately at every public or official boundary, and accept only the latest applicable exact decision whose state is `PRODUCTION_APPROVED`. Suspension adds history rather than rewriting or deleting approval. Treat ROI as one betting-quality metric; require independent data-integrity and predictive-quality layers and retain CLV, drawdown, coverage, stability, and sample support.