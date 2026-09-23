---
name: Phase 3 Model Signals
description: Weather, NHL goalies, NFL injuries — integration patterns and gotchas
---

# Phase 3 Model Signals

## Weather Service (Open-Meteo)

**API pattern that works:**
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude=...&longitude=...
  &hourly=wind_speed_10m,wind_direction_10m,precipitation,temperature_2m
  &wind_speed_unit=mph
  &timezone=America/New_York
  &forecast_days=2     ← CRITICAL: do NOT use start_date/end_date — returns 0 hourly slots
```

**Why:** `start_date`/`end_date` params return empty `hourly.time` arrays in the Replit environment. `forecast_days=2` returns 48 slots and works reliably.

**ESPN abbreviations for MLB homes (differ from "standard"):**
- `CHW` (not CWS) — Chicago White Sox at Guaranteed Rate Field
- `ATH` — Oakland/Sacramento Athletics

**Dome detection:** `isDome: true` in venue map → return early, weather_wind_mph stays null (correct — domes don't have weather). Currently: ARI, HOU, MIA, MIL, SEA, TB, TEX, TOR in MLB; ATL, DAL, DET, HOU, IND, LAC, LAR, LV, MIN, NO in NFL.

**Pre-fetching is mandatory:** Running weather fetches sequentially inside the game loop causes 15 × 8s timeout = 2-minute bootstrap hang. Always pre-batch with `Promise.all` BEFORE the game loop starts.

## NHL Goalie Service

**API:** `https://api-web.nhle.com/v1/club-stats/{TEAM_CODE}/now`
- Returns `goalies[]` with `gamesStarted`, `savePercentage`, `goalsAgainstAverage`
- Use goalie with most `gamesStarted` as presumed starter
- Only works during active season (Oct–Jun); returns empty in July offseason

**ESPN → NHL code mapping needed for:**
- `TB` → `TBL`, `NJ` → `NJD`, `LA` → `LAK`, `CLB` → `CBJ`, `SJ` → `SJS`

## NFL Injury Service

**API:** `https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries?limit=100`
- Returns all 32 teams' injuries in one call (cache the full report, look up by team)
- Status abbreviations that mean absent: `O` (Out), `IR`, `PUP`, `D` (Doubtful), `Q` (Questionable), `DNP`
- All statuses show as `Active` during offseason (July) — correct behavior, no adjustments needed
- Full report loads in one call; the shared cache is keyed to the report, per-team lookups use it

## Model Integration Pattern

All three signals inject BEFORE the multiplier in `computeRunsModel`:
```typescript
if (sport === "NHL" && opts.goalieAdvantage != null) prob += opts.goalieAdvantage;
if (sport === "NFL" && opts.injuryAdvantage != null) prob += opts.injuryAdvantage;
```

Weather affects `projectedTotal` (not win prob) in `finalizeResult`:
```typescript
const projectedTotal = Math.round((baseTotal + (opts.weatherTotalAdjustment ?? 0)) * 10) / 10;
```
`vegasTotal` stays as the market line; only `projectedTotal` gets the weather adjustment.

**Why:** Weather hurts both teams equally — it's an O/U signal, not a moneyline signal.
