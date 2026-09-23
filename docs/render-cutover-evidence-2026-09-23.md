# Render cutover evidence — 2026-09-23 (in progress)

This is an operational record, not authorization to switch scheduler ownership,
change the installed app's API target, or publish a V4 sport model.

## Current serving path

- The published Replit API forwards `/api` to the Render candidate. A Render API
  deploy already affects installed-app users, even though their build still
  names the Replit URL.
- The live Render API deploy is `dep-daq604flot8c73ffqmp0`, commit
  `a347a96ba9c8b10170d00728e66083d2a9fcf9e9`. Both direct Render and
  bridged readiness returned HTTP 200, API role, and database fingerprint
  `eac01aba6aced7a3`.
- Render's current health-check path is `/api/healthz`. The source has been
  changed to require `/api/readyz` on the **next reviewed deployment**; that
  configuration is not live yet.
- Render's request-log filter returned no entries for the checked interval.
  Its application-error filter returned no entries, but absence of request
  logs is not proof that subscribers saw no errors.

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

- The Render cron still runs commit
  `c0adb156341ec8a4eab18b02726b7dbe557976ca`; it must match the API's
  reviewed source and database identity before a coordinated handoff.
- The new readiness/schema gate is only in the Replit workspace. It needs an
  exact clean GitHub commit, passing CI, an explicitly approved API deploy,
  and the actual Render health-check path change before it protects production.
- Neither scheduler ownership nor mobile traffic has been switched. The
  installed iOS build still needs a new reviewed EAS/App Store build for a
  direct Render API target; OTA executable updates remain prohibited.
- No V4 sport currently has public publication permission. The live readiness
  status reports UFC as not technically ready; other listed sport engines are
  shadow or unvalidated. Do not treat technical execution or this schema
  repair as model/market approval.