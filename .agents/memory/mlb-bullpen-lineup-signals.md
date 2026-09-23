---
name: MLB Bullpen Fatigue + Lineup Signals
description: Implementation details for the mlbBullpen and mlbLineups services added in Phase 4 of the model engine.
---

# MLB Bullpen Fatigue + Lineup Confirmation

## Bullpen Service (`mlbBullpen.ts`)

**Why:** `hydrate=boxscore` on the schedule endpoint does NOT inline boxscore data — the top-level game object has a `content` key but no `boxscore` field. Boxscores must be fetched individually via `GET /api/v1/game/{gamePk}/boxscore`.

**How to apply:** Two-step fetch — schedule to get gamePks for last 3 days, then `Promise.allSettled` for all boxscores in parallel (typically 30–45 calls, all fast). Only games with `abstractGameState === "Final"` have complete data.

Pitcher IDs in appearance order live at `boxscore.teams.{home|away}.pitchers[]`. First = starter, rest = relievers. Pitch counts at `players["ID{id}"].stats.pitching.numberOfPitches`.

Fatigue formula: `Σ(reliefPitches × weight)` where yesterday=1.0, 2 days ago=0.65, 3 days ago=0.35. Normalizer 250 → probability cap ±0.04.

## Lineup Service (`mlbLineups.ts`)

**Why:** Lineups post 1–3 hours before game time. Before that, `lineups.homePlayers` returns an empty array. Service returns `confirmed: false` gracefully. Cache TTL is 30 minutes (short — lineups can change late).

**Route optimization:** Seed the cache with the first game's await, then sequential lookups for remaining games — avoids 15 concurrent fetches all missing the cache simultaneously.

**Doubleheader identity rule:** Keep the date-level fetch cache, but index both lineup and probable-starter results by home team, away team, and the precise scheduled UTC start. MLB and ESPN event IDs differ, so a matchup-only key is unsafe when the same teams play twice on one date. Never use a formatted display time or an ordered “first/second game” fallback.

**Why:** The second game could overwrite the first game’s lineup or starting pitchers, silently pairing the wrong evidence with an otherwise valid moneyline pick. Bullpen fatigue remains intentionally team/date scoped because both games share the same recent relief workload.

## Schema (`lib/db/src/schema/games.ts`)

Added 6 columns: `homeBullpenFatigue`, `awayBullpenFatigue` (real, weighted pitch count), `homeBullpenLabel`, `awayBullpenLabel` (text: Fresh/Moderate/Tired/Exhausted), `homeLineupConfirmed`, `awayLineupConfirmed` (boolean). All nullable (non-MLB = null).

## Model integration

`bullpenAdvantage` added to `ComputeOptions` and applied in `computeRunsModel()` for MLB only (after pitcher adjustment). Also folds `bullpenTotalAdjustment` into the weather total adjustment slot for the projected total.
