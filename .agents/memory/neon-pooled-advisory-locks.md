---
name: Neon pooled advisory locks
description: Safe PostgreSQL advisory-lock semantics when production uses a Neon transaction-pooled endpoint.
---

Never use session-level PostgreSQL advisory locks through a Neon transaction-pooled endpoint. Use `pg_try_advisory_xact_lock` inside an explicit transaction held on one dedicated pool client, and end the transaction before releasing the client.

**Why:** A session-level lock remained attached to an idle PgBouncer backend after the application client exited because a later unlock query was not guaranteed to reach the same backend session. The orphaned lock caused every subsequent production cycle to fail closed as a duplicate invocation.

**How to apply:** For cross-instance scheduler guards on Neon, acquire a dedicated client, begin a transaction, attempt the transaction-scoped lock, keep that transaction open for the guarded operation, and commit or roll back on every exit path. Verify that no matching advisory lock remains after production runs.