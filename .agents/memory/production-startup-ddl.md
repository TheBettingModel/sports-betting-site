---
name: Production startup DDL
description: Why production schema changes must stay out of the API's pre-listen startup path.
---

Production API startup must open its configured port before any database reconciliation, and must not execute schema DDL in production startup. Replit's managed publish step owns production schema changes; idempotent startup migration fallbacks are development-only.

**Why:** DDL and data reconciliation can wait on production locks. When either runs before `listen()`, the API misses the artifact supervisor's port deadline despite healthy code and a successful build.

**How to apply:** Bind the port first and keep the health endpoint available, but gate every user-facing API route with `503` until reconciliation succeeds. Start schedulers only after readiness. Put production schema changes in the managed publish flow.