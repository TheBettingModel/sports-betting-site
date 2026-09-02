---
name: Managed database publish binding
description: Replit publish preflight rejects a manually stored DATABASE_URL when the project uses the managed PostgreSQL database.
---

When Replit reports “External database detected,” remove only the manually stored DATABASE_URL override; the managed database will inject DATABASE_URL automatically, and the existing data remains available.

**Why:** A manually stored value shadows Replit’s runtime-managed database binding and causes publishing to fail before a build is created.

**How to apply:** Verify the managed database is provisioned and matches the current connection before removal; leave PGHOST, PGPORT, PGUSER, PGPASSWORD, and PGDATABASE untouched.