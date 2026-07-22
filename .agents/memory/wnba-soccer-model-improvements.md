---
name: WNBA + Soccer model improvements
description: Real Vegas odds, home/road splits, soccer 3-outcome model, 6 international leagues, new DB columns, advanced team analytics via teamStats.ts.
---

## Phase 1 — Real odds + records (completed earlier)

### ESPN data improvements (`espn.ts`)
- W-D-L records parsed correctly for soccer (e.g. "4-4-7"); plain W-L still used for other sports
- Home/road record splits extracted: `getHomeRecord()` looks for `type === "home"`, `getRoadRecord()` for `type === "road"|"away"`
- Real Vegas odds extracted from `competition.odds[0]`: `drawOdds.moneyLine` for draw; home ML parsed from `details` string ("CLB -115" = home team at -115) since `homeTeamOdds` is often absent in ESPN soccer response
- 6 international soccer leagues added: `Soccer_EPL`, `Soccer_LaLiga`, `Soccer_Bundesliga`, `Soccer_SerieA`, `Soccer_Ligue1`, `Soccer_UCL` — all map to canonical sport `"Soccer"` with distinct `league` label
- `homeTeamId`/`awayTeamId` (ESPN numeric team IDs) extracted for logo URLs
- `FetchedGame` now has: `homeHomeRecord`, `homeRoadRecord`, `awayHomeRecord`, `awayRoadRecord`, `vegasHomeOdds`, `vegasAwayOdds`, `vegasDrawOdds`, `vegasOverUnder`, `homeTeamId`, `awayTeamId`, `league`

### DB schema additions (migration applied)
```sql
ALTER TABLE games ADD COLUMN IF NOT EXISTS league TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS home_team_id TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS away_team_id TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS vegas_draw_odds INTEGER NOT NULL DEFAULT 0;
```

### Mobile changes
- `teamLogo.ts`: `getTeamLogoUrl(sport, abbr, teamId?)` — for Soccer, prefers ESPN numeric `teamId` over MLS abbreviation lookup
- `gameAdapter.ts`: maps `homeTeamId`/`awayTeamId`/`league`/`vegasDrawOdds` from API response
- `mockGames.ts`: `Team` gets `espnId?: string`; `Game` gets `league?: string`; `vegasLine` gets `drawOdds?: number`
- `GameCard.tsx`/`FeaturedPick.tsx`: pass `espnId` to `getTeamLogoUrl`

---

## Phase 2 — Advanced team analytics (teamStats.ts)

### New service: `artifacts/api-server/src/services/teamStats.ts`
Provides:
- `getWnbaTeamStats(teamId)` → `WnbaTeamStats | undefined`
- `getSoccerTeamStats(teamId)` → `SoccerTeamStats | undefined`
- `warmUpTeamStatsCache()` — called on server startup

**WNBA stats source:** ESPN team stats API + ESPN team schedule API
- `WnbaTeamStats` fields: `ppg`, `efgPercent` (ESPN `shootingEfficiency` — already 0–1 decimal), `trueShootingPercent`, `paceApprox`, `turnoverPercent`, `assistPercent`, `orebPg`, `threePointRate`, `threePointPct`, `ftRate`, `ftPct`, `spg`, `bpg`, `drebPg`, `last5WinPct`, `last10WinPct`, `last5PointDiff`, `last10PointDiff`, `restDays`
- ESPN percentage fields (`freeThrowPct`, `threePointPct`) return as e.g. `82.2` (not `0.822`) — divide by 100
- ESPN `shootingEfficiency` is already a 0–1 decimal (e.g. `0.55` = 55% eFG%) — do NOT divide by 100
- Cache: 15 teams fetched in parallel on first call / when expired, 4-hour TTL

**Soccer stats source:** Our own `games` DB table (completed matches already stored)
- `SoccerTeamStats` fields: `goalsPerGame`, `goalsAllowedPerGame`, `goalDifferential`, `last5Form` (W=1, D=0.4, L=0 avg), `last10Form`, `last5GoalDiff`, `restDays`
- Cache: 1-hour TTL (DB refreshed every 15 min by scheduler)

### New `ComputeOptions` fields in `model.ts`
```typescript
homeTeamStats?: WnbaTeamStats;   // WNBA/NBA advanced analytics
awayTeamStats?: WnbaTeamStats;
homeSoccerStats?: SoccerTeamStats;
awaySoccerStats?: SoccerTeamStats;
```

### WNBA model formula (multi-factor weighted blend)
```
prob = 0.5 + homeAdv (0.045)
     + (homeWinRate - awayWinRate) * 0.30      // season splits
     + (homeEfg - awayEfg) * 0.28              // eFG% differential (Tier 1 — strongest)
     + (awayTO% - homeTO%) * 0.22              // turnover battle
     + (homeOreb - awayOreb) * 0.004           // offensive rebounding
     + ((homeBpg + homeSpg) - (awayBpg + awaySpg)) * 0.003  // defensive presence
     + (homeLast5WinPct - awayLast5WinPct) * 0.12  // recent form (Tier 2)
     + (homeNetRating10 - awayNetRating10) * 0.003  // net rating proxy
     + restAdj (max ±0.035)                    // rest advantage (Tier 3)
```
Noise reduced from ±10pp to ±6pp when advanced stats are available.

### Soccer model formula (goals-based matchup engine)
```
prob = 0.42 + 0.05 (home adv)
     + (homeRate - awayRate) * 0.28            // W-D-L record (from home/away splits)
     + (homeGPG - awayGAPG) * 0.08            // attack vs defence matchup
     - (awayGPG - homeGAPG) * 0.08            // away attack penalty
     + (homeGD - awayGD) * 0.05               // overall goal differential
     + (homeLast5Form - awayLast5Form) * 0.10  // recent form
     + (homeLast5GD - awayLast5GD) * 0.025    // recent goal differential
     + restAdj (max ±0.025)                    // fixture congestion
```
Noise reduced from ±8pp to ±6pp when soccer stats are available.

### Call sites updated
- `scheduler.ts` `runOddsIngestion` loop: fetches team stats before computeProjection
- `scheduler.ts` `runResultGrading` loop: same
- `routes/games.ts` `refreshAll`: same
- `scheduler.ts` `startScheduler`: calls `warmUpTeamStatsCache()` (non-blocking)

**Why:** Previous model used only W/L record vs real Vegas line, producing shallow differentiation. Now eFG%, turnover%, form, rest produce meaningful edges — e.g. WSH Fade at -14.2% edge despite 13-12 record when efficiency stats reveal true weakness; NE vs TOR Strong Buy at +10.6% edge vs even money line.

### WNBA team IDs (ESPN numeric, for team stats API)
ATL=20, CHI=19, CON=18, DAL=3, GS=129689, IND=5, LV=17, LA=6, MIN=8, NY=9, PHX=11, POR=132052, SEA=14, TOR=131935, WSH=16
