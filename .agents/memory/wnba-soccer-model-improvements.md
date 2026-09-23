---
name: WNBA + Soccer + All-Sport model improvements
description: Full tiered model architecture for all sports — ESPN stats for WNBA, DB stats for Soccer/MLB/NFL/NHL/NCAAF/NCAAB, and a per-factor learning engine that grows over time.
---

## Phase 1 — Real odds + records (completed earlier)

### ESPN data improvements (`espn.ts`)
- W-D-L records parsed correctly for soccer (e.g. "4-4-7"); plain W-L still used for other sports
- Home/road record splits extracted: `getHomeRecord()` looks for `type === "home"`, `getRoadRecord()` for `type === "road"|"away"`
- Real Vegas odds extracted from `competition.odds[0]`: `drawOdds.moneyLine` for draw; home ML parsed from `details` string ("CLB -115" = home team at -115)
- 6 international soccer leagues added: `Soccer_EPL`, `Soccer_LaLiga`, `Soccer_Bundesliga`, `Soccer_SerieA`, `Soccer_Ligue1`, `Soccer_UCL`
- `homeTeamId`/`awayTeamId` (ESPN numeric team IDs) extracted for logo URLs
- `FetchedGame` now has: `homeHomeRecord`, `homeRoadRecord`, `awayHomeRecord`, `awayRoadRecord`, `vegasHomeOdds`, `vegasAwayOdds`, `vegasDrawOdds`, `vegasOverUnder`, `homeTeamId`, `awayTeamId`, `league`

### DB schema additions (migration applied)
```sql
ALTER TABLE games ADD COLUMN IF NOT EXISTS league TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS home_team_id TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS away_team_id TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS vegas_draw_odds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model_weights ADD COLUMN factor_weights JSONB;  -- Phase 3
```

---

## Phase 2 — Advanced team analytics (teamStats.ts)

### `WnbaTeamStats` (ESPN batch fetch, 4h cache, all 15 teams in parallel)
Fields: `ppg`, `efgPercent` (0–1 decimal), `trueShootingPercent`, `turnoverPercent`, `orebPg`, `spg`, `bpg`, `drebPg`, `last5WinPct`, `last10WinPct`, `last5PointDiff`, `last10PointDiff`, `restDays`

**ESPN gotcha**: `shootingEfficiency` is already 0–1 (do NOT /100); `freeThrowPct`/`threePointPct` ARE percentage strings (divide by 100).

### `SoccerTeamStats` (DB-computed, 1h cache)
Fields: `goalsPerGame`, `goalsAllowedPerGame`, `goalDifferential`, `last5Form`, `last10Form`, `last5GoalDiff`, `restDays`

### `DbTeamStats` (DB-computed, 1h cache, key for MLB/NFL/NHL/NCAAF/NCAAB)
Fields: `scoredPerGame`, `allowedPerGame`, `scoreDifferential`, `pythagoreanWinPct`, `last5WinPct`, `last10WinPct`, `last5ScoreDiff`, `last10ScoreDiff`, `restDays`, `sampleSize`

**Critical: minimum sample size gate** — returns `undefined` (fallback to W/L record) when sample is too small. Single-game outliers (0-run shutout → Pythagorean of 0%) break the model completely.
```
MLB:   8 games minimum
NFL:   3 games
NHL:   8 games
NCAAF: 4 games
NCAAB: 6 games
UFC:   5 bouts
```

**Pythagorean exponents** (RS^exp / (RS^exp + RA^exp)):
- MLB: 1.83 (Bill James), NFL: 2.37, NHL: 2.0, NCAAF: 2.37, NCAAB: 10.25

WNBA team IDs (ESPN numeric):
ATL=20, CHI=19, CON=18, DAL=3, GS=129689, IND=5, LV=17, LA=6, MIN=8, NY=9, PHX=11, POR=132052, SEA=14, TOR=131935, WSH=16

---

## Phase 3 — Per-factor weight learning (learning.ts + model.ts)

### `SPORT_DEFAULT_WEIGHTS` in model.ts (exported constant)
Default factor weights per sport. Used as priors until the learning engine accumulates outcomes and overwrites them in `model_weights.factorWeights` JSONB.

```typescript
MLB:   { recordWeight:0.20, pythagoreanWeight:0.28, formWeight:0.10, scoreDiffWeight:0.012, restWeight:0.005 }
NFL:   { recordWeight:0.22, pythagoreanWeight:0.25, formWeight:0.08, scoreDiffWeight:0.003, restWeight:0.018 }
NHL:   { recordWeight:0.22, pythagoreanWeight:0.22, formWeight:0.14, scoreDiffWeight:0.018, restWeight:0.016 }
NCAAF: { recordWeight:0.35, pythagoreanWeight:0.18, formWeight:0.10, scoreDiffWeight:0.002, restWeight:0.007 }
NCAAB: { recordWeight:0.28, pythagoreanWeight:0.22, formWeight:0.12, scoreDiffWeight:0.003, restWeight:0.006 }
UFC:   { recordWeight:0.45, formWeight:0.20, restWeight:0.008 }
WNBA:  { recordWeight:0.30, efgWeight:0.28, toWeight:0.22, orebWeight:0.004, defWeight:0.003, formWeight:0.12, netRatingWeight:0.003, restWeight:0.009 }
Soccer:{ recordWeight:0.28, attackDefWeight:0.08, goalDiffWeight:0.05, formWeight:0.10, lastGoalDiffWeight:0.025, restWeight:0.007 }
```

### `computeFactorContributions()` in model.ts (exported)
Returns `Record<string, number>` — signed probability contribution per factor (positive = predicts home win). Used by learning engine to determine which factors were right/wrong.

### How factor weight learning works (learning.ts)
After each graded game:
1. Fetch team stats for both teams (from cache — same data as prediction time)
2. Call `computeFactorContributions()` to compute what each factor contributed
3. For each factor: if `contribution > 0` predicted home win, `< 0` predicted away win
4. Compare direction to actual outcome → nudge weight:
   - Correct direction: `weight + 0.004` (bounded at 0.60)
   - Wrong direction:   `weight - 0.003` (bounded at 0.002)
5. Store updated factorWeights in `model_weights.factorWeights` JSONB
6. Also runs the existing EMA accuracy update and confidenceMultiplier tuning

factorWeights start as `null` in model_weights. On the first graded game, they're bootstrapped from `SPORT_DEFAULT_WEIGHTS[sport]` and then nudged.

### `effectiveWeights()` helper in model.ts
Merges stored factorWeights (from DB) with sport defaults:
`return { ...defaults, ...stored }` — stored values override defaults, missing keys fall back.

### model_weights schema addition
```typescript
factorWeights: jsonb("factor_weights").$type<FactorWeights>()
// Null until first graded game; populated and updated by learning engine thereafter
```

---

## Call sites

All three entry points fetch stats for all sports:
- `scheduler.ts` `runOddsIngestion` loop
- `scheduler.ts` `runResultGrading` loop  
- `routes/games.ts` `refreshAll()`

Pattern:
```typescript
const DB_SPORTS = new Set(["MLB", "NFL", "NHL", "NCAAF", "NCAAB"]);
const [homeTeamStats, awayTeamStats, homeSoccerStats, awaySoccerStats, homeDbStats, awayDbStats] =
  await Promise.all([
    (sport === "WNBA" || sport === "NBA") ? getWnbaTeamStats(homeId) : undefined,
    (sport === "WNBA" || sport === "NBA") ? getWnbaTeamStats(awayId) : undefined,
    sport === "Soccer" ? getSoccerTeamStats(homeId) : undefined,
    sport === "Soccer" ? getSoccerTeamStats(awayId) : undefined,
    DB_SPORTS.has(sport) ? getDbTeamStats(homeId, sport) : undefined,
    DB_SPORTS.has(sport) ? getDbTeamStats(awayId, sport) : undefined,
  ]);
```

---

## How the system improves over time

1. **Immediately**: Richer factor models for all sports (vs just W/L records before)
2. **Each graded game**: `factorWeights` nudged for whichever factors were right/wrong
3. **Each season**: Pythagorean quality + form + rest all accumulate more historical data
4. **Minimum sample gate**: Prevents DB stats from firing until enough games are stored — model falls back gracefully to season W/L record until then
5. **EMA confidence multiplier**: Still running — continues to amplify/dampen the whole model's edges based on rolling accuracy

---

## Known future phases not yet implemented
- Injury impact ratings (no public WNBA/MLB injury API)
- Sharp money / line movement tracking  
- xG for soccer (would need FBref/Understat scraping)
- Player-level usage and on/off splits
- Referee engine for soccer
