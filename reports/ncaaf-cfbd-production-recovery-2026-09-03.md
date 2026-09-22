# #221F — NCAAF CFBD Production Recovery Verification

**Production audit cutoff:** 2026-09-03 20:25:06 UTC  
**Published recovery cycle completed:** 2026-09-03 20:18:53 UTC  
**Scope:** Production verification only. No NCAAF V4 work, model/forecast/wager/publication changes, NFL changes, or supplemental provider integration.

## Executive result

The recovery materially restored CFBD transport, telemetry, advanced endpoint execution, raw persistence, normalized domain persistence, cross-Autoscale exclusion, and player identity persistence. It did **not** restore the canonical pipeline end to end.

At the audit cutoff:

- Advanced raw endpoint families with data: **10**
- Total raw response rows: **14**
- Items represented inside raw payloads: **98,843**
- Normalized advanced domain rows: **59,241**
- Player identity rows: **30,062**, all `PROVIDER_ONLY`
- Team mappings: **0 / 693 mapped**
- Game mappings: **0 / 758 mapped**
- `ncaaf-football-intelligence-v2` snapshots: **0**
- CFBD-enriched snapshots: **0**
- Prospective cohort assignments: **0**

Therefore the provider capture layer is partially recovered, but the canonical intelligence pipeline is still broken.

## Root-cause and fix verification

### Verified repairs

1. **Malformed/HTML/empty response handling and telemetry**
   - Provider health now records outcome, failure category, content type, HTTP status, latency, byte size, retries, and completion time.
   - Production observed **0 auth failures**, **0 rate-limit failures**, and **0 malformed-JSON failures** after the repair.

2. **Advanced cadence and reachability**
   - Advanced calls executed in production and persisted raw/normalized data.
   - Successful families included teams, conferences, venues, season team stats, advanced stats, plays, rosters, recruiting, and transfers.
   - Player-stat raw evidence also persisted and was still being batch-normalized at the audit cutoff.

3. **Bulk-games starvation**
   - The production implementation now runs bounded advanced work before bulk-games capture/normalization.
   - Production advanced calls began at 20:01:54 UTC, while the following games call began at 20:11:43 UTC.
   - This ordering proves an individual games timeout can no longer prevent that cycle's advanced phase from executing.
   - A fresh 2,736,931-byte games response subsequently completed successfully.

4. **Cross-Autoscale exclusion**
   - One Autoscale process owned the PostgreSQL advisory lock.
   - A second process logged `global_duplicate_invocation` at 20:02:00 UTC and did not run duplicate NCAAF capture.
   - Multiple Autoscale instances are protected against concurrent NCAAF evidence cycles.

5. **Bounded normalization**
   - Large raw responses were persisted before normalization.
   - Plays, rosters, player stats, and other bulk domains were inserted in batches instead of one row per database round trip.

### Remaining production failures

1. The latest deterministic team state is still **693 UNMAPPED / 0 MAPPED**.
2. Because ordered team identities are unavailable, all **758** latest game mappings remain `INVALID`.
3. Player IDs persist, but all **30,062** latest identities remain `PROVIDER_ONLY`.
4. The completed cycle reported processing 789 intelligence snapshots, but production still contains only v1 rows; no v2 row was inserted.
5. No CFBD domain contributes to a canonical snapshot.
6. No prospective cohort assignment exists.
7. Evidence-run finalization remains unhealthy: two rows were still `running` at cutoff, while an older stale row was reconciled to `failed`.

These are canonical-pipeline blockers, not merely supplemental injury/starter-data gaps.

## Raw CFBD evidence

Counts are append-only raw response rows and the total number of items represented inside those payloads.

| Required endpoint | Raw responses | Payload items |
|---|---:|---:|
| games | 4 | 14,716 |
| teams | 1 | 138 |
| conferences | 1 | 256 |
| venues | 1 | 852 |
| team stats (`season_team_stats`) | 1 | 892 |
| advanced team stats | 1 | 16 |
| plays | 1 | 12,521 |
| rosters | 1 | 30,109 |
| player stats | 1 | 30,886 |
| SP+ | 0 | 0 |
| SRS | 0 | 0 |
| Elo | 0 | 0 |
| FPI | 0 | 0 |
| recruiting | 1 | 3,987 |
| talent | 0 | 0 |
| returning production | 0 | 0 |
| transfers / player portal | 1 | 4,470 |
| coaches | 0 | 0 |
| weather | 0 | 0 |
| **Total** | **14** | **98,843** |

## Normalized production evidence

| Required normalized area | Rows |
|---|---:|
| Advanced domain evidence, total | 59,241 |
| Core CFBD game evidence | 758 |
| Core CFBD team/entity evidence | 1,516 |
| Player identity ledger | 30,062 |
| Core completed-game team performance | 250 |
| Team stats | 892 |
| Advanced stats | 16 |
| Plays | 12,521 |
| Rosters | 30,109 |
| Player stats at cutoff | 6,000 |
| Ratings (SP+/SRS/Elo/FPI) | 0 |
| Recruiting | 3,987 |
| Talent | 0 |
| Returning production | 0 |
| Transfers | 4,470 |
| Coaches | 0 |
| Weather | 0 |

Other normalized context rows included **138** team identities, **256** conferences, and **852** venues.

The player-stat response contained 30,886 raw items; 6,000 normalized rows existed at the cutoff because the active bounded materialization pass had not yet finished. This does not affect the readiness result.

## Mapping

### Team mapping

- Encountered: **693**
- Mapped: **0**
- Unmapped: **693**
- Ambiguous: **0**
- Invalid: **0**
- Mapping percentage: **0.00%**
- Latest reason for all rows: `No exact canonical school identity candidate`

### Game mapping

- Considered: **758**
- Mapped: **0**
- Unmatched: **0**
- Ambiguous: **0**
- Invalid: **758**
- Mapping percentage: **0.00%**
- Latest reason for all rows: `CFBD game lacks mapped ordered teams or valid kickoff`

### Player identity

- Total latest identities: **30,062**
- `PROVIDER_ONLY`: **30,062**
- `MAPPED`: **0**
- `AMBIGUOUS`: **0**
- `INVALID`: **0**

No fuzzy or name-only identity promotion was observed.

## Canonical intelligence

- Total NCAAF football intelligence snapshots: **789**
- `ncaaf-football-intelligence-v1`: **789**
- `ncaaf-football-intelligence-v2`: **0**
- CFBD-enriched snapshots: **0**
- Latest v2 timestamp: **none**
- READY: **0**
- PARTIAL: **0**
- BLOCKED: **789**

The completed scheduler log reported `intelligenceSnapshots: 789`, but the database still contains no v2 snapshot. Existing v1 rows remain BLOCKED.

**CFBD domains contributing to canonical snapshots:** **none**.

## FINAL_PREGAME

- FINAL_PREGAME total: **0**
- New since publish: **0**
- CFBD-enriched FINAL_PREGAME: **0**
- Games represented: **0**

The production window is **45 minutes**. At the audit cutoff, the next kickoff was 22:00 UTC, so its legitimate FINAL_PREGAME window began at **21:15 UTC**. The audited cycles ran before that window; no assignment was fabricated.

Canonical CFBD readiness was also unavailable, so this zero is not evidence that end-to-end FINAL_PREGAME enrichment works.

## Prospective cohort and anti-backfill

- Total prospective assignments: **0**
- New assignments since publish: **0**
- CFBD-backed assignments: **0**
- Historical backfills observed: **0**
- Anti-backfill status: **PASS for observed writes; no assignments existed**

The append-only/activation-time safeguards did not create retrospective assignments.

## Point-in-time checks

- Snapshot cutoff at or after kickoff: **0**
- Evidence captured after snapshot cutoff: **0**
- Evidence modeled after snapshot cutoff: **0**
- Future-week rating violations: **0**
- Retrospective-data violations in FINAL_PREGAME: **0**
- **Total observed PIT violations: 0**

Ratings and FINAL_PREGAME assignments are both zero, so their zero violation counts are fail-closed observations rather than positive coverage proof. Recruiting and transfer evidence remained outside canonical snapshots.

## Provider health

At the audit cutoff, the provider-health ledger contained **18 logical calls** for September 3 / September 2026, plus **11 retry attempts**.

- Latest finalized successful call: roster, attempted **2026-09-03 20:19:04 UTC**
- Newest persisted raw response: player stats, **2026-09-03 20:24:31 UTC**; its health finalization was still pending
- Latest failed call: player stats, attempted **2026-09-03 20:03:39 UTC**
- Auth failures: **0**
- 429/rate-limit failures: **0**
- Timeout failures: **4**
- Malformed JSON failures: **0**
- Retries: **11**
- Finalized response bytes: **25,703,922**

| Endpoint | Logical calls | Success | Failure | Retries | Finalized bytes | Average latency | Maximum latency |
|---|---:|---:|---:|---:|---:|---:|---:|
| advanced stats | 1 | 1 | 0 | 0 | 38,187 | 12,200 ms | 12,200 ms |
| conferences | 1 | 1 | 0 | 0 | 35,669 | 60 ms | 60 ms |
| games | 5 | 3 | 2 | 2 | 5,473,862 | 18,525 ms | 49,599 ms |
| player stats | 1 | 0 | 1 | 2 | 0 | 45,901 ms | 45,901 ms |
| plays | 2 | 1 | 1 | 3 | 8,259,009 | 40,788 ms | 46,401 ms |
| recruiting | 1 | 1 | 0 | 0 | 1,466,944 | 15,801 ms | 15,801 ms |
| roster | 2 | 1 | 1 | 4 | 8,956,624 | 45,724 ms | 47,101 ms |
| team stats | 1 | 1 | 0 | 0 | 95,838 | 5,600 ms | 5,600 ms |
| teams | 1 | 1 | 0 | 0 | 202,966 | 4,203 ms | 4,203 ms |
| transfers | 1 | 1 | 0 | 0 | 953,504 | 19,502 ms | 19,502 ms |
| venues | 1 | 1 | 0 | 0 | 221,319 | 87 ms | 87 ms |

The telemetry is now credible: large endpoint responses and bounded retries explain the observed 30–47 second logical-call durations.

## Scheduler health

- Latest logged production cycle: **completed at 2026-09-03 20:18:53 UTC**
- Approximate advanced-to-cycle duration: **16 minutes 59 seconds**
- Cycle result: not skipped; 789 games found, 789 feature snapshots processed, 789 intelligence snapshots processed
- Completed evidence runs: **31**
- Partial evidence runs: **145**
- Failed evidence runs: **52**
- Running evidence runs at cutoff: **2**
- Fresh running at cutoff: **2**
- Stale running at cutoff: **0**
- An older stale run was reconciled to failed at **20:16:28 UTC**
- Database global lock: **working**
- Autoscale duplicate prevention: **working**

The scheduler is distributed-safe, but it is not end-to-end healthy. The cycle remained long, database evidence-run rows did not finalize with the logged cycle, and production emitted a missed cron warning while bulk work was active.

## Call usage

- Logical calls today: **18**
- Logical calls this month: **18**
- Retry attempts today/month: **11**
- HTTP attempts including retries: **29**
- Calls by endpoint: shown in Provider health above

A credible monthly projection is **not yet estimable** from one recovery/startup day. A naive 18-logical-call daily extrapolation would be 540 calls in a 30-day month, but it is not a forecast: successful weekly families fall out of the due set, failed families retry, and the first-run catch-up is atypical. No undocumented CFBD quota is assumed.

## Football data readiness

| Capability | Production status |
|---|---|
| Historical team strength | **PARTIAL** — games/stats exist, but canonical team mapping is 0% |
| Team offense evidence | **PARTIAL** — team and advanced stats exist for limited team coverage |
| Team defense evidence | **PARTIAL** |
| Advanced football evidence | **PARTIAL** — 16 advanced rows and 12,521 plays |
| Ratings | **MISSING** — SP+, SRS, Elo, and FPI are zero |
| Recruiting | **PRESENT, research-only/PIT C** — 3,987 rows |
| Talent | **MISSING** |
| Returning production | **MISSING** |
| Roster/player evidence | **PRESENT but provider-only** — no canonical player mapping |
| Historical QB intelligence | **PARTIAL raw foundation only** — not canonical or V4-ready |
| Coaching | **MISSING** |
| Weather | **MISSING** |
| Early-season prior evidence | **NOT READY** — recruiting alone is insufficient |

Supplemental gaps remain explicit:

- Timestamped pregame starting QB: **missing**
- Timestamped injury/availability: **missing**
- Legitimate depth/starter state: **missing**

Those supplemental gaps would normally block selected individual-game forecasts and full live publication rather than construction of V4 itself. In this audit, however, separate core blockers still prevent V4 construction: team/game mapping is 0%, ratings/priors are incomplete, and no CFBD-enriched v2 canonical snapshot exists.

## Readiness

`DATA_PIPELINE_READY = FALSE`

`V4_BUILD_READY = FALSE`

The false V4 result is not based merely on missing injury/starter/depth data. It is based on failed canonical mappings, no v2 enrichment, no canonical contributing CFBD domain, incomplete independent priors, and no prospective cohort proof.

## Final decision

**B. NOT READY FOR #222 — CFBD PIPELINE STILL BROKEN**

Do not begin #222.