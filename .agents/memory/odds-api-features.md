---
name: Odds API Features
description: Phase 2 Odds API integration — what's implemented, how opening odds work, best line logic.
---

## What's built
1. **Consensus odds** — average across DraftKings, FanDuel, BetMGM, Caesars, etc. Replaces ESPN single-book moneyline.
2. **Pinnacle sharp signal** — divergence between Pinnacle implied prob and public consensus. ≥5pp divergence → +4 sharp score.
3. **Best available line** — per-book H2H odds stored in `GameOdds.bookmakerOdds`. After model determines pick direction, `getBestLine(gameOdds, pickIsHome)` finds the book with the best odds for that side.
4. **Line movement** — `openingHomeOdds` / `openingAwayOdds` columns on games table. Set on first insert via `COALESCE(existing, EXCLUDED)` in conflict update — so the value is always set on first sighting and never overwritten. Direction compared to current consensus to produce `lineMovedTowardHome` boolean for the model.

## DB columns (games table)
- `opening_home_odds`, `opening_away_odds` — set once via COALESCE in onConflictDoUpdate
- `best_line_book`, `best_line_odds` — refreshed each cycle; human-readable book name via `displayBookName()`

## COALESCE pattern for opening odds
```sql
-- in onConflictDoUpdate.set:
openingHomeOdds: sql`COALESCE(${gamesTable.openingHomeOdds}, EXCLUDED.opening_home_odds)`
```
**Why:** INSERT sets opening odds to current consensus. On conflict, COALESCE preserves the existing non-null value. This ensures opening odds are set on first sighting and never overwritten even as market moves.

## Line movement in model
`lineMovedTowardHome?: boolean` passed in ComputeOptions. In `finalizeResult()`, converted to `lineMoveConfirms` (relative to pick direction). Adjusts sharp score ±1.
