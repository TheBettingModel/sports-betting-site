# Render cutover evidence — 2026-09-23 (in progress)

This is an operational record, not authorization to switch scheduler ownership,
change the installed app's API target, or publish a V4 sport model.

## Current serving path

- The published Replit API forwards `/api` to the Render candidate. A Render API
  deploy already affects installed-app users, even though their build still
  names the Replit URL.
- The live Render API deploy is `dep-daq6hegjo6nc73d9sdm0`, exact GitHub
  commit `b52051a18a8275cdee3bb3d2e145d47f425b3577` (PR #2, passing PR
  and merged-main CI). The previous live deploy was `dep-daq604flot8c73ffqmp0`
  at `a347a96ba9c8b10170d00728e66083d2a9fcf9e9`.
- The live Render health-check path is now `/api/readyz`, which runs the
  read-only required-schema gate. Direct Render and bridged readiness returned
  HTTP 200, the new API release SHA, API role, and the unchanged database
  fingerprint `eac01aba6aced7a3`. The API scheduler and publication flags
  remained disabled.
- In the sampled app logs since the deploy began, 38 completed requests
  returned HTTP 200 and two requests for `/` returned HTTP 404. The
  application-error filter returned no entries. This is not an authenticated
  subscriber-journey test or proof of a zero-error rate.

## Database repair

- The actual Render-connected Neon branch is `br-blue-frost-aqu7381i`, not the
  older Replit-managed production read replica. Never copy the replica over it
  solely because its label says production.
- A pre-repair copy-on-write safety branch was created at
  `br-falling-dew-aq144om4`. A separate rehearsal branch from that same point
  is `br-nameless-leaf-aq4q502e`. Restoration has **not** been rehearsed.
- Three missing tables and the `v4_market_evidence_game_idx` index were
  created transactionally on the rehearsal branch, then the same additive-only
  statements were applied to the live branch. No existing table or row was
  deleted, and the older migration's index replacement was not run.
- Live verification found all three relations and the index. A Results-style
  left join against the mapping table succeeded. The new read-only required
  schema query returned no missing items against live Neon.

## Remaining release gates

- The existing Render cron was separately approved for shadow-only alignment.
  Deploy `dep-daq6lh5g1s2s73fb4ad0` is live at the same exact commit as the
  API, with `PUBLICATION_ENABLED=false` and auto-deploy off. Its first
  post-deploy scheduled run succeeded at `2026-09-24T00:18:33Z`. The run logs
  reported `SHADOW`, the matching release SHA and database fingerprint, and
  suppressed odds ingestion.
- On the actual Render-connected Neon branch, the `00:14`–`00:19` UTC run
  window contained seven NCAAF shadow-slate rows, zero production-slate rows,
  zero new official predictions, and zero new public/effective published
  picks. This is window-scoped evidence, not a blanket publication guarantee.
- The readiness/schema gate is live on the API; the cron is aligned only in
  shadow mode. Scheduler publication or ownership must not be changed based
  on this evidence alone. The installed iOS build still uses the Replit
  bridge and needs a new reviewed EAS/App Store build for a direct Render API
  target; OTA executable updates remain prohibited.
- No V4 sport currently has public publication permission. The live readiness
  status reports UFC as not technically ready; other listed sport engines are
  shadow or unvalidated. Do not treat technical execution or this schema
  repair as model/market approval.

## Direct-to-Render iOS build preparation (2026-09-24 UTC)

- Mobile release configuration and this evidence were exported through PR #3,
  merged as `d269db85d31ac6725bec783b9dbdb3a97991518e` with passing PR and
  merged-main CI. Its signed EAS iOS build `33e603c7-7f5e-40f3-86df-9e17ae1d15b5`
  was version 1.0.1 (34). IPA inspection confirmed the Render API and Clerk
  proxy, but found six Privacy/Terms links still pointing at Replit. That
  build was **not submitted**.
- The legal links were moved to the configured API host in PR #4, merged as
  `f83df7db037fba5aae003c45f074a5bd6d959575` with passing PR and
  merged-main CI. Both legal routes returned HTTP 200 directly from Render.
  Signed EAS build `a5dcfc3f-f9a2-4fb3-a602-54d69cdd6699` from that exact
  commit is version 1.0.1 (35). Inspection of its IPA confirmed the app
  identifier, version, build number, embedded Render API and Clerk proxy,
  and zero occurrences of the Replit bridge host in its JavaScript bundle.
  Neither mobile commit was deployed to the Render API or cron; their running
  release identity remains the earlier reviewed backend commit.
- Direct Render Clerk proxy `/api/__clerk/v1/client` and
  `/api/__clerk/v1/environment` returned HTTP 200. A real password sign-in
  using the configured reviewer account verified the password factor but
  returned `needs_second_factor` with `email_code`; no session was issued.
  The account's primary email is verified and its user record reports no
  enrolled MFA, consistent with Clerk Device Trust challenging new devices.
  The app's reviewer password path cannot complete that email-code step.
  **Do not submit build 35 for App Review** until the owner resolves this
  authentication gate and a real signed-in protected API request succeeds.
  Do not disable Device Trust for all users without explicit approval.
- Installed iOS clients still call the published Replit compatibility bridge.
  No OTA code update, App Store submission, scheduler ownership change, or
  V4 publication was made by this build preparation.