---
name: MLB Pitcher Signal
description: How probable pitcher data is fetched, matched, and used in the model — including team ID matching workaround and stat type naming.
---

## Source
MLB Stats API (free, no key): `https://statsapi.mlb.com/api/v1/`

## Schedule endpoint
`/schedule?sportId=1&date=YYYY-MM-DD&hydrate=probablePitcher,team&gameType=R`

**Critical:** Must include `team` in hydrate to get `teams.home.team.id`. Without it, abbreviation and id are both missing. Team abbreviation is never returned from the schedule endpoint.

## Team matching
The schedule returns team `id` (numeric) but NOT `abbreviation`. ESPN abbreviations differ from MLB abbreviations for some teams (AZ vs ARI, etc.). Use the static `MLB_ID_TO_ESPN` map in `mlbPitchers.ts` to convert MLB team ID → ESPN abbreviation.

For a game identity, combine the converted home/away abbreviations with the precise MLB schedule start timestamp. Do not use a matchup-only key: same-day doubleheaders have distinct starters but identical teams.

If providers disagree on start time, only use a bounded time-tolerance fallback when it yields exactly one same-team game. Treat multiple candidates as ambiguous and block the signal rather than picking the nearest game.

**Why:** A wrong starter pair can produce an invalid recommendation; an unavailable signal safely blocks publication until the provider data resolves.

## Pitcher stats endpoint
`/people/{id}/stats?stats=season,gameLog&group=pitching&season=2026&gameType=R`

- Season aggregate: `type.displayName === "season"` (NOT "statsSingleSeason")
- Game log: `type.displayName === "gameLog"` — last 3 entries used for recent ERA
- Game-log splits arrive oldest-to-newest; sort by date descending before selecting the
  three recent starts.
- Complete schedule data can remain cached for four hours, but incomplete probable-starter pairs must retry quickly before first pitch.
- Limit individual pitcher-stat validation to four concurrent requests. A full slate's unbounded request burst timed out in production and incorrectly made every otherwise confirmed starter unavailable.

**Why:** Season aggregate is cumulative ERA. Recent ERA averages the season ERA values at the time of each of the last 3 starts — a reasonable proxy for current form since it shows ERA trajectory.

**Ordering rule:** Never assume the first game-log splits are recent. MLB returned Paul
Skenes' opening starts first, which would turn 67.50, 9.53, and 5.25 into a misleading
27.43 "recent ERA" late in the season.

## Model integration
`computePitcherAdvantage()` returns a value in `[-0.08, +0.08]` probability shift. It blends FIP, recent ERA, and K-BB%, then shrinks the result for a low innings/batters-faced sample or a low recent pitch-count/workload profile.

**Why 70% recent:** Single-game outcomes are dominated by the specific pitcher on the mound, not season averages. A Cy Young caliber ace with a 6-run recent outing matters more than his 2.50 season ERA.

**How to apply:** Missing probable starters, failed stat requests, malformed numeric payloads, and player-identity mismatches must all block a published MLB full-game pick. Do not substitute league-average pitcher data for an unavailable source; return a zero pitcher adjustment and retain a machine-readable source-quality reason for the decision audit. If this evidence changes after a pick was published but before first pitch, immutably retire it to a Neutral decision—even during a current odds-feed outage—using the prior decision's market record for the audit trail.

When adding pitcher enrichment, preserve bounded concurrency and per-pitcher failure isolation: one slow source record must not erase otherwise validated matchup evidence.
