# TBM release source of truth

## Authority

All product work begins in the current Replit workspace and this chat. A release
is not production merely because it works in the Replit preview or because a
Replit web artifact was published.

The release artifact is one exact, credential-scanned Git commit exported from
the Replit working tree into the clean GitHub repository. Existing divergent
GitHub branches are historical inputs only until they are reconciled explicitly;
never merge them into the release branch wholesale.

## Production topology

- Mobile client: reviewed Expo/EAS App Store build
- API/model runtime: Render web service
- Scheduler: Render cron service
- Persistent production data: one Neon PostgreSQL target
- Replit: authoritative authoring, validation, and preview workspace

Vercel and the Replit deployment are not production dependencies for the
distributed iOS app.

## One-release identity

Every Render release must set:

- `TBM_RELEASE_SHA`: the exact 40-character clean GitHub commit
- `TBM_DATABASE_TARGET_ID`: the same non-secret database target label on the API
  and scheduler
- `TBM_RUNTIME_ROLE`: `api` on the web service and `scheduler` on the cron
- `TBM_ENFORCE_RELEASE_ID=true`

The API exposes the release SHA, role, and a one-way database-target fingerprint
through `/api/readyz`. The scheduler prints the same fields in every run result.
A release is invalid if API and scheduler SHA or database fingerprint differ.

`DATABASE_URL` remains secret and must never be printed or copied into source.
The target label is an assertion, not a substitute for configuring both Render
services with the same Neon connection.

## Update sequence

1. Finish work in Replit and keep the working tree reviewable.
2. Run typechecks, focused tests, builds, source/security scans, and
   `pnpm run release:preflight`.
3. Export a clean source tree; create one exact GitHub commit.
4. Wait for GitHub CI to pass for that commit.
5. Apply any reviewed additive database migration to staging, then production.
   Never depend on API startup DDL.
6. Configure both Render services with the same release SHA and database target
   label.
7. Deploy the Render API explicitly. Verify `/api/healthz` and `/api/readyz`.
8. Run the scheduler in shadow mode. Verify its release SHA and database
   fingerprint match the API and that it created no public rows.
9. Enable exactly one scheduler owner. Keep the API in-process scheduler off.
10. Enable publication only for explicitly approved model/market artifacts.
11. Verify the installed mobile build can call the deployed API.
12. Record the commit, API deployment, scheduler run, database migration, and
    mobile build number in the release evidence.

## How changes reach users

- Backend logic or data changes reach users only after the matching Render API
  and scheduler deployment is verified.
- Mobile JavaScript, UI, native dependency, entitlement, or API-target changes
  require a new EAS production build and App Store/TestFlight delivery.
- Expo OTA code delivery is disabled and prohibited for this app. A generic
  Replit publish does not update installed iPhones.
- Every App Store submission must use a new iOS build number and must identify
  the exact clean GitHub source commit.

## Stop conditions

Do not release when any of these is true:

- The Replit source has not been exported to an exact clean GitHub commit.
- GitHub CI did not pass that commit.
- API and scheduler do not report the same release SHA.
- API and scheduler do not report the same database-target fingerprint.
- More than one scheduler owner is enabled.
- A required database migration has not been applied and verified.
- The mobile build points to an unverified or candidate API.
- Publication is enabled without exact model and market approval.