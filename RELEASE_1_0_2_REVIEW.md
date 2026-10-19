# TBM 1.0.2 (14) coordinated release review

## Status and authority

Prepared locally; not published, deployed, or submitted for App Review.
App Store Connect supplied by the owner confirms the released version is
1.0.1 (13). The next source declaration is 1.0.2 (14). The actual number generated
by Replit Expo Launch must still be checked before review submission.

The backend release parent is the actual API and cron live commit:
`dd81e07a864f9d0db7b0c7a553f17bb01df784e7`.
Do not deploy the main Replit workspace branch wholesale: it lacks safeguards
present in that live commit. The candidate preserves those safeguards.

## Included

- Server-owned, account-scoped, explicitly confirmed Projection Pass for one
  upcoming game on today's Eastern Time slate, expiring 24 hours after claim.
- All other free cards are schedule-only; live games cannot consume a credit.
- Frozen selected projection remains readable until expiry, including after kickoff.
- Existing Pro projection, Analytics, Chat, Results and entitlement paths remain.
- Profile displays installed version/build rather than a hardcoded assumption.
- Profile cleanup and newest-first Chat presentation.
- Explicit Render API and Clerk proxy configuration, bounded projection-read
  retries, viewer/source-isolated caches, and Analytics history pairing rules.
- Development-only authenticated preview read-through; never enabled in production.
- Additive `projection_passes` schema migration, with a read-only readiness gate
  that refuses readiness when required new table/columns are absent.
- Generated OpenAPI client and validation types matching the new routes.

## Excluded and preserved

No new NCAA evidence-validator repair, correction manifest execution, historical
backfill, or data correction. Existing deployed NCAA and NFL historical safeguards,
saved-slate loading, MLB membership filtering, Analytics memory protections,
rate limiting and entitlement middleware are retained from the live parent.
No model equation, frozen model artifact, immutable forecast, scheduler/worker
implementation, cron cadence, app identity, purchase entitlement, or OTA change.

## Existing 1.0.1 client compatibility

Pro API response contracts remain unchanged. Legacy free endpoints retain their
response keys, but `freeGames` and `freePicks` become empty and `freePick` becomes
null to prevent an independent second disclosure. Old clients cannot claim the
new pass because they lack its UI. This is an intentional free-tier policy
change, not full feature parity for the old binary. Do not quietly recreate
legacy free previews as a compatibility fallback.

The backend must be ready before the new binary is tested. Consider the interval
before Apple release: old free clients will be locked and require the update to
use the new pass. Obtain explicit owner approval of that rollout consequence.

## Production sequence — separate approval required

1. Review the exact candidate diff, tests and source commit. Push only its release
   branch, never substitute the unrelated main workspace branch.
2. With an approved production connection, verify the exact Render-connected Neon
   host/database/user and current schema. No automatic startup migrations.
3. Review/apply only `lib/db/migrations/20261019_projection_passes.sql` in a bounded
   transaction. If the table already exists, verify column types, primary key and
   exact 24-hour constraint; IF NOT EXISTS alone is not a schema validation.
   Verify the runtime role has the required SELECT/INSERT/UPDATE permissions.
4. Manually deploy the exact approved backend commit to the API. Check the live
   deployment SHA, `/api/readyz`, and authentication/access responses.
5. No scheduler source change is needed for Projection Pass. Leave its current
   compatible historical-integrity commit and `*/15 * * * *` cadence unchanged.
   If promoting it for release alignment, verify its branch head and actual build;
   do not use Trigger Run or alter the cadence.
6. Verify ordinary free/Pro identities: account separation, one claim, frozen live
   cards, no unselected model disclosures, premium Analytics/Chat gating, cross-
   device grant/expiry, and the current 1.0.1 Pro client.
7. In the existing Replit mobile artifact, use Expo Launch to build/upload the
   reviewed mobile source. No EAS CLI, OTA, app identity reset, or generic web
   republish as a substitute. Verify generated version/build and source identity.
8. Install through TestFlight, complete the entitlement checklist, then have the
   owner approve the App Store Connect submission for version 1.0.2.

## Rollback

Keep the additive table and active passes; do not delete or reset user grants.
Do not automatically revert to a backend that discloses the old free previews.
Prefer a narrowly scoped forward fix. A rollback of the free-tier policy requires
an explicit owner decision. Existing immutable model evidence is never rewritten.

## Verification boundary

Offline tests and a private disposable Unix-socket PostgreSQL cluster exercise
the prepared source; neither is proof of live entitlements or App Store upload.
Production migration, live identity checks, TestFlight testing and Apple
submission remain distinct release gates.

### Completed local verification

- Frozen-lockfile dependency installation succeeded offline with install scripts disabled.
- Shared-library, API-server and mobile TypeScript checks passed.
- Projection Pass policy/HTTP and preview middleware: 65 tests passed.
- Read-only production schema readiness: 3 tests passed.
- Mobile API configuration, recovery, Analytics pairing and cleanup: 26 tests passed.
- Disposable local PostgreSQL test passed concurrency, idempotence, account
  isolation, rolling expiry/renewal, unavailable forecasts, live-game freeze,
  and kickoff-while-waiting-for-lock handling. No existing database was used.
- API production bundle compiled successfully.
- iOS JavaScript/Hermes export compiled successfully (2,063 modules). This is
  a compile check, not a signed IPA, upload, TestFlight installation, or review.
- Credential-pattern source scan passed without printing credential values.
- Compared protected production paths with the live parent: unchanged.
- Candidate mobile and generated client/spec source matched the Replit publishing
  workspace byte-for-byte, including the version/build declaration and tests.
