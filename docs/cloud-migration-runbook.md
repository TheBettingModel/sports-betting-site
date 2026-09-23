# TBM cloud migration and rollback runbook

## Trust boundary

The existing Replit Git object database is legacy and untrusted because old
history may contain credential material. Do not clone, mirror, or copy its
`.git` directory. Export the verified working tree with:

```sh
pnpm run export:clean-source -- /tmp/tbm-clean-source
```

Create a new repository from that directory with a new root commit. The export
excludes Git objects, dependencies, build output, caches, attachments, signing
files, and local environment files, then runs the source credential scanner.

## Cloud target

- Source: new clean GitHub repository
- Admin frontend: Vercel
- API/model service: Render web service
- Scheduler: Render cron service
- Database: Neon PostgreSQL
- Mobile: Expo/EAS, continuing to call the versioned API

`render.yaml`, `artifacts/admin/vercel.json`, and `.env.example` are source
templates. Secret values belong in provider-managed secret stores only.

## Database migration

1. Take and verify a recoverable database backup.
2. Generate a reviewed, versioned, additive SQL migration.
3. Apply it to a separate staging database.
4. Compare table counts, constraints, indexes, model identities, predictions,
   picks, results, and publication audit rows.
5. Run API readiness and shadow scheduler checks.
6. Apply the same migration artifact to production.

Do not use broad schema push for production. Do not delete or rewrite raw
history; corrected interpretations must be additive.

## Parallel deployment

1. Deploy API with `SCHEDULER_ENABLED=false` and
   `PUBLICATION_ENABLED=false`.
2. Verify `/api/healthz` and `/api/readyz`.
3. Point a staging admin build at the candidate API.
4. Run the cron command in shadow mode.
5. Verify no public picks, notifications, or official-record rows were created.
6. Verify exact model and contract hashes.

## Controlled cutover

Cutover is permitted only after clean-source, CI, database, health, scheduler,
frontend, mobile-compatibility, publication-safety, and rollback gates pass.
Enable the scheduler before publication. Enable publication only for exact
sport artifacts carrying explicit production approval.

## Rollback

Keep the previous API/frontend routes and scheduler state available. Migrations
must remain backward-compatible, so rollback switches traffic and disables the
new scheduler without reversing data destruction. Never roll back by deleting
new immutable evidence or forecast rows.