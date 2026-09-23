---
name: NCAAF 2026 bridge denominator
description: Durable rule for separating identity compatibility from the V4 model-eligible target universe.
---

The NCAAF V4 prospective compatibility denominator is the season’s FBS-vs-FBS target universe, not every provider-listed college football game. A target may be safely classified outside the model domain only after a pre-cutoff, provider-authoritative season ledger proves the complete FBS identity set and its deterministic provider mappings. Missing snapshot classification alone is never proof that a target is non-FBS.

**Why:** Treating all provider targets as eligible created false identity exclusions; treating unknown targets as out-of-domain would create a false PASS. A complete, timestamped FBS universe permits both conclusions without fuzzy identity inference.

**How to apply:** Verify full FBS-ledger mapping coverage before fixing the denominator. Both teams in that proven set are model-eligible; targets outside it are reported separately as out-of-domain. Unproven membership remains identity-unresolved and fails closed.