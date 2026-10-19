# Projection Pass release boundary

This workspace prepares the new Free experience. It is **not deployed**.

- One signed-in account chooses one upcoming game from today's ET slate.
- Explicit confirmation starts a rolling 24-hour grant, shared across devices.
- A saved, valid, current V4 pregame projection must exist; missing evidence and
  started/postponed/completed games do not consume a pass.
- The selected snapshot is frozen for the grant and remains readable after kickoff.
- All unselected schedule cards have no model fields. Analytics, Chat and Results
  retain existing subscription enforcement. Pro model routes and equations are unchanged.

## Verification

```
pnpm --filter @workspace/api-server exec vitest run src/services/projectionPassPolicy.test.ts
node artifacts/api-server/scripts/test-projection-pass-postgres.mjs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/mobile exec tsc --noEmit
```

The PostgreSQL test starts a private, disposable Unix-socket cluster and substitutes
the DB import; it never uses DATABASE_URL, provider requests or app startup.

Only the additive `projection_passes` table was applied to the verified Replit
development target (helium/heliumdb). Production Neon remains untouched.

## Later release, requires separate approval

1. Reconcile this feature against the **actual live Render API commit**; do not
   deploy this workspace branch wholesale or lose existing production repairs.
2. Review/apply `lib/db/migrations/20261019_projection_passes.sql` to the explicitly
   verified production target. No startup DDL or scheduler changes.
3. Deploy the reviewed backend commit, verify ordinary free and paid identities,
   account separation, no-store headers, concurrent claims and live service SHA.
4. Ship the mobile changes in a new Apple-reviewed build. No executable OTA.
   Older clients no longer receive the two legacy free previews; coordinate the
   mobile rollout, and do not present this as an old-binary UI-only server change.

Rollback: retain the additive table and its grants; do not delete or reset active
passes. Prefer a forward server hotfix. Reverting to the old two-preview backend
would restore its disclosure behavior and needs a separate access-policy decision.
The immutable forecast ledger, model artifacts, subscriber records and mobile
production build have not been rewritten.
