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

## Pregame market integrity
Only credible, future-starting American prices may become pregame market data: whole-number prices from ±100 through ±2000, with every outcome present in one source market (two sides for two-way sports; home/draw/away for Soccer). Model edge compares the selected probability to the no-vig market, not a raw one-sided implied probability.

**Why:** Live/post-start and malformed prices can be extreme enough to manufacture false model edge, premium ratings, and polluted learning evidence.

**How to apply:** Retain provider event timing separately from usable prices so a matched live, suspended, or malformed provider event blocks any secondary-feed fallback, but never consume its odds. Reject invalid prices before consensus, best-line, prediction, snapshot, or closing-line logic. Do not combine sides from different sources or reuse a stored game-row quote as fresh decision evidence. Recheck the scheduled start immediately before persistence in case provider status lags. Preserve the last valid pregame snapshot for closing-line analysis; never replace it with a later live/final quote or a model projection.

Prediction snapshots should store the selected side's no-vig market probability as `fairProbability`, separate from the model probability.

**Why:** Keeping those measurements distinct makes later closing-line and calibration analysis trustworthy instead of silently treating the model output as market fair value.

**How to apply:** When writing an immutable prediction snapshot, remove vig from the valid two-way odds first, then select the home/away probability matching the published side.
