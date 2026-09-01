---
name: Sensitive entitlement caching
description: Rules for preventing stale premium Picks or Chat data after refunds, lapses, account switches, and failed entitlement refreshes.
---

Sensitive Picks and Chat rendering must require an affirmative, viewer-scoped server entitlement result that is successful, not fetching, and not errored. A prior successful result retained by the query cache is not a current grant during background refresh.

**Why:** RevenueCat and query caches can retain previously active data after the server has revoked access. Treating cached success or local purchase state as authoritative can expose full picks or Chat bodies after a refund, lapse, account switch, or failed refresh.

**How to apply:** Scope sensitive query keys by viewer and server entitlement. When server verification starts, errors, changes viewer, or denies access, immediately remove premium query caches and render the locked state. Owner access must also arrive through the server grant, never client IDs.