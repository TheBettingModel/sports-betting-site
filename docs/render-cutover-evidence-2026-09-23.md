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