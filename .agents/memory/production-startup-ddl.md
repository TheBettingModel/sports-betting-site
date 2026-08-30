---
name: Production startup DDL
description: Why production schema changes must stay out of the API's pre-listen startup path.
---

Production API startup must not execute schema DDL before opening its configured port. Replit's managed publish step owns production schema changes; idempotent startup migration fallbacks are development-only.

**Why:** Even `ALTER TABLE ... IF NOT EXISTS` can wait on production table locks. When it runs before `listen()`, the API misses the platform's startup deadline despite healthy code and a successful build.

**How to apply:** Put production schema changes in the managed schema publish flow. Keep any local-development compatibility migration explicitly gated out of production, and preserve fail-closed data/registry reconciliation before traffic when it does not perform DDL.