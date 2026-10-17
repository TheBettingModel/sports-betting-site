# NCAA Football V4 — correction inventory and release review

> **Latest preparation:** `NULL_AND_ACCESS_REVIEW.md` supersedes the prior
> manifest identity and verification counts, with explicit SQL-null provenance,
> 163 offline tests and 30 local PostgreSQL checks. No production apply occurred.

> **Historical baseline, superseded in part:** the later
> `CONTROLLED_REPAIR_REVIEW.md` records 59/59 source-supported candidates, the
> prepared executor, 150 NCAA offline tests and 22 PostgreSQL checks. Statements
> below about 51 missing references or an unbuilt executor describe the earlier
> review, not current preparation status. No production apply is authorized.

**Decision: HOLD deployment pending explicit review of automatic database-writing
scope and the controlled historical repair procedure. No production changes are
authorized by this report.**

Prepared October 16, 2026. Database summary: 19:47:01 UTC; rollout-impact query:
19:49:41 UTC. Candidate inventory was read earlier in this collection window.
These are bounded snapshots, not guarantees that concurrent production writers
will leave the same values unchanged indefinitely.

## 1. Current production and candidate

Read-only Render API checks confirmed both services are live on
`c7d66e18cf4d5dd6db4cc53abeb88895ee2cfdb1`:

| Service | Configured branch | Other settings |
|---|---|---|
| API `tbm-api-v4-candidate` | `fix/nfl-v4-historical-integrity-2026-10-16` | Root `.`, auto-deploy off |
| Cron `tbm-scheduler-v4-candidate` | Same branch | Root `.`, auto-deploy off, `*/15 * * * *` |

The NCAA candidate remains uncommitted in
`.local/ncaaf-v4-historical-integrity-2026-10-16`, branch
`dev/ncaaf-v4-historical-integrity-2026-10-16`, based on that exact live commit.
There is **no new NCAA release SHA to deploy**.

No production record, environment setting, worker schedule, deployment, frozen
model artifact, historical forecast, or mobile release was changed.

## 2. Exact proposed correction scope

| Finding | Count | Proposed action |
|---|---:|---|
| Fixture scores disagree with existing result scores | 54 | Synchronize `games` to freshly verified matching finals |
| Fixture says final but has no `game_results` row | 5 | Insert a source-supported result and synchronize fixture atomically |
| Suspicious fixture 0–0 finals | 2 | Included in the 54, not additional cases |
| Existing final-result score replacements needed | 0 | All 54 existing results match fresh ESPN and CFBD |
| Duplicate fixture groups by date/home ID/away ID | 0 | No deletion or merging proposed |

`correction-manifest.json` contains all 59 exact canonical IDs, identities,
before-values, result IDs, score targets, timestamps, raw-result comparison
checksums, evidence hashes, and review guards. `corrections.csv` is the readable
complete inventory. Both are **review-only, not executable**.

Examples, with scores listed as away–home:

| Date | Matchup | Fixture currently | Existing result | Verified proposed final |
|---|---|---:|---:|---:|
| Aug 29 | Memphis at UNLV | 0–0 | 27–21 | 27–21 |
| Aug 29 | Hawai‘i at Stanford | 7–23 | 27–37 | 27–37 |
| Aug 29 | New Mexico State at Florida State | 10–24 | 17–34 | 17–34 |
| Sep 12 | New Mexico State at Hawai‘i | 0–0 | 19–29 | 19–29 |

The five missing **result rows**, not missing fixtures:

| Canonical fixture | Date | Matchup | Proposed away–home |
|---|---|---|---:|
| NCAAF-401871054 | Oct 14 | Kennesaw State at Missouri State | 21–24 |
| NCAAF-401871068 | Oct 14 | Western Kentucky at Sam Houston | 16–3 |
| NCAAF-401860923 | Oct 15 | Colorado State at Texas State | 27–66 |
| NCAAF-401862800 | Oct 15 | East Carolina at UAB | 17–30 |
| NCAAF-401869950 | Oct 15 | Georgia Southern at Old Dominion | 23–15 |

## 3. Evidence strength and provenance

Seventeen bounded public ESPN scoreboard-date GETs covered all 59 IDs. The
existing candidate's pure normalizer accepted all 59 with:

- Exact canonical event, home/away team IDs and kickoff binding.
- Explicit completed final status and valid nonnegative integer scores.
- Event-level season 2026 and type 2 / regular-season metadata.
- Post-kickoff acquisition time and canonical event-payload hash.
- Agreement with CFBD final scores for all 59 and with every existing result.

Full public scoreboard responses and normalized event captures are retained in
the already Git-ignored API `tmp/ncaaf-release-evidence-2026-10-16/` directory.
`source-index.json` records URLs, acquisition times, response SHA-256 hashes and
event hashes. These captures were acquired NOW for review; they cannot be
backdated into August/September pregame evidence.

Older ESPN warehouse rows are normalized `FetchedGame` payloads, without the
original event-level season metadata. Fifty of the 59 latest stored ESPN
observations are not final. They must not be relabeled as verified final source
captures. The fresh responses fill this review's primary-source gap, not the
entire historical warehouse's evidence gaps.

### Independent official documents: eight games

Fetched official university documents support these eight proposed finals:

- Memphis–UNLV: [UNLV official box score](https://unlvrebels.com/sports/football/stats/2026/memphis/boxscore/17825).
- Hawai‘i–Stanford: [Hawai‘i official box score](https://hawaiiathletics.com/sports/football/stats/2026/stanford/boxscore/26219).
- New Mexico State–Hawai‘i: [Hawai‘i official box score](https://hawaiiathletics.com/boxscore.aspx?id=31550&path=football).
- Sacramento State–Eastern Michigan: [EMU official box score](https://emueagles.com/sports/football/stats/2026/sacramento-state/boxscore/19653).
- New Mexico State–Florida State: [FSU official recap and score table](https://seminoles.com/news/2026/8/29/football-seminoles-defeat-new-mexico-state-34-17).
- Kennesaw State–Missouri State: [Kennesaw official box score](https://ksuowls.com/boxscore.aspx?id=15432).
- East Carolina–UAB: [ECU official box score](https://ecupirates.com/boxscore.aspx?id=14231).
- Colorado State–Texas State: [Texas State's own postgame notes](https://txst.com/news/2026/10/15/football-game-recap-bobcats-dominate-colorado-state-66-27-in-pac-12-home-opener.aspx).

For Texas State, the university-authored postgame notes were used; the AP
article syndicated at the top was not counted as a separate independent source.
UNLV's recap and box score are one publisher, not two independent providers.
Official pages are score corroboration documents, not a complete audit of all
vendor feed lineage.

**Independent documentation remains unacquired for 51 games.** CFBD/ESPN
agreement is not proof of independent upstream sourcing. Search results showing
Sam Houston still live or Georgia Southern still pregame were not accepted as
final evidence. No search snippet alone was promoted to a verified capture.

The saved official documents are extracted Markdown, sometimes truncated,
with extraction hashes—not complete raw HTTP-body archives. The proposed
`NCAA_OFFICIAL` adapter currently accepts `stats.ncaa.org`, not these school
domains, and requires a reviewed canonical identity binding. Accordingly, even
the eight documents are **review corroboration, not adapter-ready independent
verification artifacts**. No such artifacts were fabricated.

## 4. Season classification and coverage

All 59 freshly verified events are regular-season games. August 29 is NCAA
Week Zero here, **not NFL-style preseason**. No month-based exclusion is valid.

The current bounded CFBD-declared FBS-vs-FBS regular-season completed cohort
contains 336 games, with zero missing fixture-ID joins and zero team-ID
disagreements. This checks only that declared cohort and exact-ID comparison;
it does not establish the complete NCAA season denominator, validate every
cross-provider canonical bridge, or certify all lower-division fixtures.

The frozen NCAA foundation still contains 792 / 798 / 808 rows for
2023 / 2024 / 2025, respectively. The earlier phase audit identified
2,264 regular-season and 134 postseason rows. NCAA bowls/CFP are not inherently
contamination and must not be excluded by copying NFL policy.

No frozen feature replay, seed rewrite, or revalidation of all 2,398 rows against
independent official records was performed in this step. The candidate's
stricter historical eligibility helper remains offline; it is not wired into
the frozen live reader. Therefore this report does **not** certify a completed
historical-input cutover or a fully independently verified model corpus.

## 5. Automatic deployment impact — approval required

This candidate is **not a write-free deployment**. Once deployed, existing
scheduled code would begin using the NCAA final writer and disable NCAA's
blind games-table result-copy fallback.

At the impact snapshot:

- 122 known NCAA final fixtures were within the routine 14-day retry window.
- Five had missing result rows and five had score disagreements.
- The new routine can process at most 64 candidates and eight date requests per
  invocation. Clean matching rows may also receive new provenance metadata.
- There were zero NCAA nonfinal fixtures older than six hours at the snapshot.
- All 450 existing NCAA result rows had non-object/missing raw evidence by the
  SQL type check; full originals must be captured before any production update.
- Forty-nine score disagreements are older than the routine window and will
  not be fixed merely by deploying this code. They need controlled historical
  reconciliation.

The active route can also write verified newly fetched finals outside that
routine window when users navigate historical dates. Stale-game recovery has
its separate bounded date-request path. Do not describe the approved write
surface as limited to just the 59 manifest rows.

## 6. Required release and data-repair gates

1. **Approve evidence policy and write scope.** Distinguish primary-source
   reconciliation to an already matching result from independently certified
   model evidence. If independent documents are required for every historical
   repair, hold the 51 without them. Do not silently weaken the model gate.
2. **Complete official-source ingestion design if independent certification is
   required.** Preserve actual source bodies or precisely identified extracts,
   upstream identity, canonical mappings and real capture availability. Test
   narrowly allowed official publishers; do not accept arbitrary URLs.
3. **Prepare a separate reviewed historical executor.** None exists in this
   report. It must consume an explicit allowlist with no discovery/fetch loop,
   attest production identity, compare locked before-values, preserve complete
   before-images, and use the existing NCAA transaction writer.
4. **Use small bounded resumable batches.** Reject changed rows, conflicting
   identity, missing provenance or altered manifests. Use real write-time
   availability; stop on unexplained conflicts. Never infer acceptance from
   an attempted write count.
5. **Test the exact execution/rollback procedure on disposable PostgreSQL**
   before approving production writes. Existing tests prove the writer, not an
   executor or rollback script that has not yet been built.
6. **Create and review one backend commit only after these decisions.** Recheck
   current API/cron baselines, diff protected NFL/other-sport/model/mobile files,
   run existing tests and record the resulting full commit SHA. The current
   parent SHA does not include this uncommitted NCAA candidate.
7. **User-controlled Render rollout.** Let old cron invocations finish; promote
   the reviewed cron build and API to the same approved SHA with their existing
   cadence. Cron uses Builds → Manual Build, not Trigger Run. Verify actual
   live commits rather than configured branches alone.
8. **Post-release verification.** Recheck health/readiness, successful scheduled
   invocation commit, provider failures/quarantines, approved per-row scores,
   no-write idempotence and actual provenance. Recount remaining disagreements
   against the manifest, not only aggregate totals. Confirm no NFL changes.

No Apple resubmission is proposed for a backend/data-only release that preserves
the current mobile contracts. This review does not alter any iOS executable.

## 7. Rollback requirements

- Code rollback target is the currently live full parent SHA above, coordinated
  across API and cron without changing the schedule.
- Code rollback does NOT undo data changes. Capture complete transaction-time
  before-images separately, including the distinction between SQL NULL, JSON
  null, and any prior raw evidence object.
- The manifest's projected before-values and MD5 comparison token are not a
  full backup and are not cryptographic source certification.
- Restore only fields owned by the repair after checking exact post-image
  ownership. Never overwrite unrelated concurrent metadata or model evidence.
- Do not blindly delete a newly inserted result after downstream grading has
  consumed it. That requires explicit dependency review and, where appropriate,
  a separately approved roll-forward correction rather than destructive rollback.
- Preserve forecasts, grades, source ledgers and frozen artifacts. Stop and
  investigate if a rollback would require rewriting any of them.

## 8. Verification status

The candidate source was unchanged during this report-only step, so its prior
checks remain applicable: 110 NCAA offline tests, 12 real isolated PostgreSQL
transaction tests, 409 unchanged NFL regression tests, backend type check and
production bundle all passed. This step additionally checked fresh real
primary evidence through the existing pure normalizer: **59/59 accepted**.

No application forecast-producing endpoint, scheduler job, database write,
commit, push, merge or deployment was run. Public provider requests were GETs;
database operations were SELECTs; Render verification was GET-only.
