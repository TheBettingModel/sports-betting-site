---
name: WNBA + Soccer model improvements
description: Real Vegas odds, home/road splits, soccer 3-outcome model, international leagues added in espn.ts, model.ts, and DB schema.
---

## What was done

### ESPN data improvements (`espn.ts`)
- W-D-L records parsed correctly for soccer (e.g. "4-4-7"); plain W-L still used for other sports
- Home/road record splits extracted: `getHomeRecord()` looks for `type === "home"`, `getRoadRecord()` for `type === "road"|"away"`
- Real Vegas odds extracted from `competition.odds[0]`: `drawOdds.moneyLine` for draw; home ML parsed from `details` string ("CLB -115" = home team at -115) since `homeTeamOdds` is often absent in ESPN soccer response
- 6 international soccer leagues added: `Soccer_EPL`, `Soccer_LaLiga`, `Soccer_Bundesliga`, `Soccer_SerieA`, `Soccer_Ligue1`, `Soccer_UCL` — all map to canonical sport `"Soccer"` with distinct `league` label
- `homeTeamId`/`awayTeamId` (ESPN numeric team IDs) extracted for logo URLs
- `FetchedGame` now has: `homeHomeRecord`, `homeRoadRecord`, `awayHomeRecord`, `awayRoadRecord`, `vegasHomeOdds`, `vegasAwayOdds`, `vegasDrawOdds`, `vegasOverUnder`, `homeTeamId`, `awayTeamId`, `league`

### Model improvements (`model.ts`)
- **WNBA/NBA**: uses `homeHomeRecord` for home team + `awayRoadRecord` for away team; falls back to overall record if splits missing
- **Soccer**: 3-outcome model (home/draw/away); draw probability modeled as `max(0.18, 0.30 - |prob - 0.5| * 0.5)`; when real Vegas odds present, derives no-vig probabilities via `removeVig3()`
- **All sports**: real Vegas home/away ML used when `realVegasHomeOdds` provided; simulated only as fallback
- `ComputeOptions` interface for all new optional params; backward compatible

### DB schema additions (migration applied)
```sql
ALTER TABLE games ADD COLUMN IF NOT EXISTS league TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS home_team_id TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS away_team_id TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS vegas_draw_odds INTEGER NOT NULL DEFAULT 0;
```

### Sports count accumulation (scheduler.ts)
- Multiple Soccer sub-leagues (EPL, La Liga, etc.) all return `sport="Soccer"`, so counts ACCUMULATE rather than overwrite: `sportCounts[sport] = (existing || 0) + games.length`

### API types updated
- `GameProjection` interface in all four locations updated: `lib/api-client-react/src/generated/api.schemas.ts`, dist `.d.ts`, `lib/api-zod/src/generated/types/gameProjection.ts`, dist `.d.ts`

### Mobile changes
- `teamLogo.ts`: `getTeamLogoUrl(sport, abbr, teamId?)` — for Soccer, prefers ESPN numeric `teamId` over MLS abbreviation lookup; international teams now get correct logos
- `gameAdapter.ts`: maps `homeTeamId`/`awayTeamId`/`league`/`vegasDrawOdds` from API response
- `mockGames.ts`: `Team` gets `espnId?: string`; `Game` gets `league?: string`; `vegasLine` gets `drawOdds?: number`
- `GameCard.tsx`/`FeaturedPick.tsx`: pass `espnId` to `getTeamLogoUrl`

**Why:** The previous model simulated all Vegas odds with hash noise, making "edge" meaningless since the model compared against its own noisy output. Real DraftKings lines from ESPN give genuine market comparison. WNBA home/road splits matter significantly — SEA (6-23) gets 28% at home when playing MIN (22-6) because MIN's dominance overrides home advantage.
