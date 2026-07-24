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
The schedule returns team `id` (numeric) but NOT `abbreviation`. ESPN abbreviations differ from MLB abbreviations for some teams (AZ vs ARI, etc.). Use the static `MLB_ID_TO_ESPN` map in `mlbPitchers.ts` to convert MLB team ID → ESPN abbreviation, then key the schedule map as `"homeAbbr|awayAbbr"`.

## Pitcher stats endpoint
`/people/{id}/stats?stats=season,gameLog&group=pitching&season=2026&gameType=R`

- Season aggregate: `type.displayName === "season"` (NOT "statsSingleSeason")
- Game log: `type.displayName === "gameLog"` — last 3 entries used for recent ERA
- Cache TTL: 4 hours (pitcher assignments rarely change day-of)

**Why:** Season aggregate is cumulative ERA. Recent ERA averages the season ERA values at the time of each of the last 3 starts — a reasonable proxy for current form since it shows ERA trajectory.

## Model integration
`computePitcherAdvantage()` in `mlbPitchers.ts` returns a value in `[-0.08, +0.08]` probability shift. Injected into `computeRunsModel()` after team-level stats, before the confidence multiplier step. Blends season ERA (30%) and recent ERA (70%).

**Why 70% recent:** Single-game outcomes are dominated by the specific pitcher on the mound, not season averages. A Cy Young caliber ace with a 6-run recent outing matters more than his 2.50 season ERA.
