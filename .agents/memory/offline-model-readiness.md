---
name: Offline model readiness verification
description: Avoid false model failures caused by incomplete read-only production exports.
---

Offline replay must preserve the serving contract's provenance and identity metadata, not just numeric inputs. Confirm an apparent model failure using a complete serving-equivalent export before changing model ingestion.

**Why:** An incomplete recovery export falsely produced zero NCAA projections despite usable production evidence. Immutable mapping references and the snapshot-to-prediction relationship were necessary to reproduce the normal engine correctly.

**How to apply:** For read-only readiness audits, retain original evidence references and snapshot metadata, use the normal materializer/validator/predictor, and distinguish replay readiness from actual authenticated production execution. Never repair a production model based solely on a partial export.