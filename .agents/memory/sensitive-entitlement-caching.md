---
name: Sensitive entitlement caching
description: Rules for preventing stale premium Picks or Chat data after refunds, lapses, account switches, and failed entitlement refreshes.
---

Sensitive Picks and Chat rendering must require an affirmative, viewer-scoped server entitlement result that is successful, not fetching, and not errored. A prior successful result retained by the query cache is not a current grant during background refresh.

**Why:** RevenueCat and query caches can retain previously active data after the server has revoked access. Treating cached success or local purchase state as authoritative can expose full picks or Chat bodies after a refund, lapse, account switch, or failed refresh.

**How to apply:** Scope sensitive query keys by viewer and server entitlement. When server verification starts, errors, changes viewer, or denies access, immediately remove premium query caches and render the locked state. Owner access must also arrive through the server grant, never client IDs.

Authenticated JSON endpoints consumed by the mobile API client must return
`Cache-Control: private, no-store` and vary by authorization.

**Why:** A conditional 304 response has no JSON body; the generated mobile
client treats it as an API error, so a fully cached multi-request screen can
appear to have no data even though the server is healthy.

**How to apply:** Set the headers before entitlement checks on viewer-scoped
JSON routes, and verify a request with `If-None-Match` still returns a body.