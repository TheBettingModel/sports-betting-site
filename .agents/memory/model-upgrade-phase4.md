---
name: Model Upgrade Phase 4 — Signal Wiring & New Signals
description: Scheduler signal wiring (Tasks 103-105); new NFL/NHL/NBA signals; what was skipped and why.
---

## What was implemented

### Task #103: Wire existing signals into scheduler.ts
Both `runOddsIngestion` and `runResultGrading` previously called `computeProjection()` with only ESPN odds + team stats.
They now match the full signal set from `routes/games.ts`:
- Pinnacle odds, consensus odds (via `getOddsForGame`)
- Line movement detection (opening vs. current odds from DB, `existingByGameId` map)
- MLB pitcher advantage (`getProbablePitchers` + `computePitcherAdvantage`)
- MLB bullpen fatigue (`getBullpenMatchup` + `computeBullpenAdvantage`)
- Weather for NFL/MLB (`getVenueWeather` + `computeWeatherEffect`)
- NHL goalie advantage (`getGoalieMatchup` + `computeGoalieAdvantage`)
- NHL special teams advantage (new — see Task 104)
- NFL injury advantage (`getTeamInjuryImpact` + `computeInjuryAdvantage`)
- WNBA injury advantage (`getWnbaTeamInjuryImpact` + `computeWnbaInjuryAdvantage`)
- NFL situational signals (new — see Task 105)

**Why:** The scheduler ran every 30 min but used a stripped-down model; only the games route had the full signal set. Every snapshot was missing sharp/multi-book data and phase-3 signals.

### Task #104: NBA/NHL/Soccer efficiency metrics

**NBA (new file additions in teamStats.ts):**
- Added `getNbaTeamStats(teamId)` — mirrors `getWnbaTeamStats` but hits ESPN NBA endpoint.
  - URL: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{teamId}/statistics`
  - Form: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{teamId}/schedule?season={year}`
  - Returns same `WnbaTeamStats` shape so basketball model works for both leagues.
  - Scheduler updated: NBA calls `getNbaTeamStats`, WNBA calls `getWnbaTeamStats` (split from old combined call).

**NHL (added to nhlGoalies.ts):**
- Added `NhlTeamSpecialTeams` interface `{ ppPct, pkPct }`
- Added `getNhlTeamSpecialTeams(espnAbbr)` — fetches all 32 teams from `/v1/standings/now`, 6h cache
- Added `computeNhlSpecialTeamsAdvantage(home, away)` → [-0.04, +0.04] probability shift
- Wired into `ComputeOptions` as `nhlHomeSpecialTeams` / `nhlAwaySpecialTeams`
- Applied in `computeRunsModel` for NHL: `ppAdv * 0.40 + pkAdv * 0.20`, max ±0.04

**Soccer xG:** Skipped — FBref requires scraping, football-data.org is rate-limited. ESPN soccer stats have shots but not clean xG. Revisit if a reliable public API is found.

### Task #105: NFL + MLB targeted signals

**NFL (new file: `nflTeamSignals.ts`):**
- `computeNflSituationalSignals(homeAbbr, awayAbbr)` returns `{ isDivisional, domeMismatch, turnoverAdvantage }`
- Divisional flag: static `NFL_DIVISION` map keyed by ESPN abbreviation (AFC/NFC East/North/South/West)
  - Applied in model: `prob = 0.5 + (prob - 0.5) * 0.92` (8% edge compression for division games)
- Dome/outdoor mismatch: static `DOME_TEAMS` set (ATL, NO, DAL, HOU, IND, MIN, DET, LV, ARI)
  - Away dome team at outdoor venue = +0.03 home advantage
- Turnover differential: ESPN team stats endpoint `/apis/site/v2/sports/football/nfl/teams/{id}/statistics`
  - Category "turnovers" → `defensiveTurnovers` (takeaways) and `offensiveTurnovers` (giveaways)
  - Scale: ±10 margin diff → ±0.03 pp shift, capped at ±0.03; 4h cache

**NFL ESPN team IDs** are hardcoded in `NFL_ESPN_IDS` constant in `nflTeamSignals.ts`.

**MLB gaps (skipped):**
- Platoon splits (L/R handedness) — MLB Stats API has handedness in `hydrate=person` on lineup but adds significant parsing complexity
- Umpire data — requires Rotowire scraping or paid API
- Series position — ESPN schedule available but low priority vs. other signals

## How to apply

When adding any new NFL signal: add to `computeNflSituationalSignals` return value + `NflSituationalSignals` interface, then wire in scheduler.ts (both loops) and model.ts `computeRunsModel`.

When the scheduler's model output seems stale vs. the games route: check that both `runOddsIngestion` and `runResultGrading` pass the same `ComputeOptions` shape as `routes/games.ts`'s `computeProjection` call. These three call sites must be kept in sync.
