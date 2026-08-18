---
name: MLB Lineup Matchup Signal
description: Platoon splits + career batter-vs-pitcher history added to the MLB lineup signal. Architecture decisions and fallback hierarchy.
---

## What was built
Three-layer hierarchy in `computeLineupAdvantage`:
1. **Career vs specific pitcher** (40% blend) — career OPS of each lineup batter vs the opposing starter. Requires ≥3 batters with ≥5 career PA. Fetched from MLB Stats API `/people/{pitcherId}/stats?stats=vsPlayer&group=pitching`.
2. **Platoon splits** — lineup OPS vs L or vs R pitching this season. Fetched via `sitCodes=vl`/`sitCodes=vr` in the batch `statSplits` hydration. Uses `computeAvgOpsIfAvailable` (not `computeAvgOps`) so empty platoon data doesn't inject league-avg as a false signal.
3. **Overall season OPS** — existing baseline fallback.

## Key types / fields added
- `PitcherStats`: +`pitchHand: "L" | "R" | null`, +`playerId: number | null` (set in `fetchSchedule` from `probablePitcher.pitchHand.code`, not in `fetchPitcherStats`)
- `LineupStatus`: +`platoonOpsVsL`, +`platoonOpsVsR`, +`careerOpsVsPitcher`, +`playerIds`
- New export `enrichLineupMatchup(matchup, starters)` in `mlbLineups.ts` — call AFTER both `getLineupMatchup` and `getProbablePitchers`; cached 30 min.

## Direction rule (CRITICAL)
Home batters face the AWAY pitcher → `awayStarterHand` selects platoon OPS for home lineup.
Away batters face the HOME pitcher → `homeStarterHand` selects platoon OPS for away lineup.

In `computeLineupAdvantage(home, away, homeStarterHand, awayStarterHand)`:
- `selectBestOps(home, awayStarterHand)` — home lineup vs away pitcher's hand
- `selectBestOps(away, homeStarterHand)` — away lineup vs home pitcher's hand

## Cap
Expanded from ±0.04 to **±0.06** to allow platoon/career signal full range.

## Caches
- Platoon splits: fetched alongside OPS in `fetchLineups` (30-min main lineup cache)
- Career vsPlayer: 4-hour cache in `careerCache` keyed by pitcherId
- Enrichment result: 30-min cache in `enrichmentCache` keyed by `homeId|awayId|homePlayerIds`

## Scheduler / games wiring
Both `scheduler.ts` and `games.ts` call `enrichLineupMatchup(lineupMatchup, starters)` then pass `starters.home?.pitchHand` and `starters.away?.pitchHand` to `computeLineupAdvantage`.

**Why:** Raw OPS ignores platoon mismatches (a RH-heavy lineup against a lefty is very different from against a righty) and doesn't account for a pitcher's specific tendencies vs individual batters.
