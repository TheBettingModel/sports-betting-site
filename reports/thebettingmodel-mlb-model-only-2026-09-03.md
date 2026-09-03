# TheBettingModel — Current MLB Moneyline Model

**Audit date:** September 3, 2026  
**Scope:** MLB moneyline production path only.  
**Change status:** Read-only review. No code, weights, thresholds, production data, or registry state were changed.

---

## 1. Current production identity

| Item | Current value |
|---|---|
| Production model ID | `tbm-mlb-moneyline-v1` |
| Production model version | `3` |
| Market | MLB moneyline |
| Production registry status | `production` |
| Learning mode | `frozen_research_only` |
| MLB favorite price ceiling | `-160` |
| Public recommendation tiers | `Strong Buy`, `Buy` |
| Maximum public picks per ET calendar day | `6` |

The database has a separate MLB challenger row, `tbm-mlb-moneyline-v2`, but it has no production predictions and is not the active model.

The production champion was frozen on August 31, 2026. Its runtime snapshot says that the formula and current weights were preserved, units were not changed, grading was not changed, and publication thresholds were not changed.

---

## 2. What the MLB model actually predicts

The model's primary output is a **home-team win probability**.

It does not begin by asking which side has the better sportsbook value. It first computes a sports probability from:

- Team record
- Pythagorean run strength
- Recent form
- Run differential
- Rest
- Starting pitchers
- Bullpen workload/fatigue
- Lineup quality and matchup, when both lineups are confirmed
- Park factor
- Evidence-quality compression
- Deterministic game-ID noise

Only after the sports probability is calibrated does the model compare it with the sportsbook moneyline.

Important distinction:

- **Predicted winner:** side with the higher final sports probability.
- **Bet selection:** side with the larger model-versus-market value.

Those are not always the same. TBM can bet an underdog that it believes is less than 50% likely to win if the market prices that underdog even lower.

---

## 3. End-to-end MLB production pipeline

```text
ESPN schedule / records / venue
        +
The Odds API consensus / Pinnacle / current market
        +
MLB Stats API starters / bullpen / lineups / hitter splits
        +
Open-Meteo venue weather
        +
Internal completed-game team statistics
        ↓
routes/games.ts assembles ComputeOptions
        ↓
assessMlbDecisionEvidence()
        ↓
computeProjection()
        ↓
computeRunsModel()
        ↓
raw home probability
        ↓
park transformation
        ↓
confidence multipliers
        ↓
deterministic game-ID noise
        ↓
probability clamp
        ↓
piecewise calibration
        ↓
current market no-vig probability
        ↓
edge and selected side
        ↓
sharp/market score + price adjustment
        ↓
recommendation and final TBM score
        ↓
publication/effectiveness gates
        ↓
immutable model prediction
        ↓
published pick and units
```

Primary source files:

- `artifacts/api-server/src/routes/games.ts`
- `artifacts/api-server/src/services/model.ts`
- `artifacts/api-server/src/services/mlbDecisionEvidence.ts`
- `artifacts/api-server/src/services/mlbPitchers.ts`
- `artifacts/api-server/src/services/mlbBullpen.ts`
- `artifacts/api-server/src/services/mlbLineups.ts`
- `artifacts/api-server/src/services/mlbParkFactors.ts`
- `artifacts/api-server/src/services/oddsApi.ts`
- `artifacts/api-server/src/services/snapshot.ts`
- `artifacts/api-server/src/services/materialPregameRevisions.ts`

---

## 4. MLB data inputs

### 4.1 ESPN

ESPN supplies:

- MLB event identity
- Start time
- Home and away teams
- Team abbreviations and IDs
- Venue
- Game status
- Final scores
- Overall records
- Home records
- Road records
- ESPN/DraftKings odds fallback

The schedule is the anchor used to match the other providers.

### 4.2 The Odds API

The Odds API supplies:

- Current two-way moneyline
- Public-book consensus
- Pinnacle moneyline
- Spread and total candidates, although MLB production uses moneyline
- Best available price metadata

The current actionable MLB moneyline must have credible home and away American odds.

Credible odds require:

- Integer American price
- Finite numeric value
- Absolute price between 100 and 2,000

The odds path has a roughly 30-minute in-memory cache and checks event identity, start time, sport, and team matching.

### 4.3 MLB Stats API — starting pitchers

The starter service matches probable pitchers using:

- MLB schedule
- Team identity
- Game date
- Start-time tolerance
- Probable-pitcher identity validation

It fetches or constructs:

- Pitcher name
- Player ID
- Handedness
- Season ERA
- Recent ERA
- FIP
- WHIP
- Strikeout percentage
- Walk percentage
- K-BB%
- Season innings
- Season batters faced
- Recent start count
- Recent innings average
- Recent pitch-count average

Starter evidence is considered required for an actionable MLB prediction. If either starter is missing or fails validation, the decision is blocked from publication.

### 4.4 MLB Stats API — bullpen

Bullpen data comes from completed boxscores and recent schedules.

The service uses recent reliever usage over the previous three days with recency weights:

- Most recent day: `1.00`
- Previous day: `0.65`
- Third day: `0.35`

The implementation treats pitchers after the starting pitcher as relievers. It is a workload/fatigue model, not a reliever-talent model.

### 4.5 MLB Stats API — lineups and hitters

The lineup service uses:

- Confirmed batting orders
- Batter count
- Season lineup OPS
- OPS versus left-handed pitchers
- OPS versus right-handed pitchers
- Career batter-versus-pitcher OPS when sufficient history exists

The lineup signal requires both lineups to be confirmed and complete. Otherwise it returns zero.

### 4.6 Park factors

Park factors are static multi-year run-environment values from the MLB park-factor table. The current implementation uses stored factors from recent FanGraphs data.

Unknown parks default to `100`, which is neutral.

### 4.7 Weather

Open-Meteo supplies:

- Temperature
- Wind speed
- Wind direction
- Precipitation
- Dome/retractable-venue status

In MLB, weather affects the projected total only. It does **not** directly change the moneyline win probability.

### 4.8 Internal team statistics

TBM builds MLB team statistics from completed internal games before the target date, up to a maximum of 20 games.

Required MLB sample size is eight completed games per team. Below that threshold, the DB team-stat object is absent and the model falls back to record/home-advantage terms.

Active internal team fields:

- Games played
- Wins/losses
- Runs scored
- Runs allowed
- Pythagorean win percentage
- Last-five win percentage
- Last-ten win percentage
- Last-five score differential
- Last-ten score differential
- Average score differential
- Rest days

---

## 5. Current MLB production weights

The active `model_weights` row contains:

| Weight | Current production value | Original hardcoded prior |
|---|---:|---:|
| Record | `0.396624` | `0.20` |
| Pythagorean | `0.579707` | `0.28` |
| Recent form | `0.235502` | `0.10` |
| Score differential | `0.083171` | `0.012` |
| Rest | `0.002000` | `0.005` |
| Confidence multiplier | `1.300000` | `1.00` |

The row reports:

- Accuracy rate: `0.7732081`
- Total predictions: `515`
- Correct predictions: `287`
- Brier score: `0.15524387`
- Last outcome-driven update: August 30, 2026

The accuracy and Brier values are retained historical model-weight metadata. Current production learning is frozen; these values are still active because they are part of the frozen champion configuration.

The stored weights materially exceed the hardcoded priors for record, Pythagorean strength, form, and score differential. This is the most important reason the current production model can be more team-strength-driven than the source code's default comments suggest.

---

## 6. MLB sports-probability formula

### 6.1 Starting point

```text
home_probability =
  0.50
  + 0.040 home advantage
  + record contribution
  + Pythagorean contribution
  + form contribution
  + score-differential contribution
  + rest contribution
  + pitcher contribution
  + bullpen contribution
  + lineup contribution
```

### 6.2 Team contributions

```text
record =
  (home W% - away W%) × 0.396624

Pythagorean =
  (home Pythagorean W% - away Pythagorean W%) × 0.579707

form =
  (home last-5 W% - away last-5 W%) × 0.235502

score differential =
  (home average run differential - away average run differential) × 0.083171

rest =
  clamp(home rest days - away rest days, -6, +6) × 0.002
```

The general code caps rest contributions at ±3 percentage points for non-NFL sports. The current stored rest weight is small enough that this cap is rarely the binding limit.

### 6.3 Starting-pitcher contribution

The pitcher service computes a home-team advantage:

```text
FIP gap       = away FIP - home FIP
Recent ERA gap = away recent ERA - home recent ERA
K-BB ERA eq   = (home K-BB% - away K-BB%) × 5

blend =
  FIP gap × 0.45
  + recent ERA gap × 0.30
  + K-BB ERA eq × 0.25
```

The raw blend is scaled by:

```text
workload factor
× pitch-count factor
× sample-reliability factor
```

Workload:

```text
workload = clamp(average recent innings / 6.0, 0.60, 1.00)
```

Pitch count:

```text
pitch-count factor = clamp(average recent pitches / 90, 0.65, 1.00)
```

Reliability:

```text
innings reliability = min(1, season IP / 60)
batters reliability = min(1, season batters faced / 250)
pitcher reliability = clamp((innings reliability + batters reliability) / 2,
                            0.35, 1.00)

pair sample factor = minimum(home reliability, away reliability)
```

If both starters average at least six innings, the model applies a tiny `-0.003` variance compression.

Final pitcher shift:

```text
pitcher advantage =
  blend × 0.025
  × workload factor
  × pitch-count factor
  × sample factor
  + times-through-order adjustment
```

Final cap:

```text
[-0.08, +0.08]
```

Positive means the home starter is better. Negative means the away starter is better.

### 6.4 Bullpen contribution

```text
fatigue difference =
  away weighted pitches - home weighted pitches

bullpen probability adjustment =
  clamp(fatigue difference / 250, -0.04, +0.04)
```

Positive means the home bullpen is fresher.

The same data produces a total adjustment:

```text
total adjustment =
  clamp((home weighted pitches + away weighted pitches) / 400, 0, 1.0)
```

The total adjustment affects projected runs, not moneyline win probability.

If a bullpen entry is missing, its weighted pitch count is treated as zero in the arithmetic. The evidence layer still records the bullpen as unavailable and reduces confidence.

### 6.5 Lineup contribution

The lineup model first requires:

```text
home.confirmed = true
away.confirmed = true
home.lineupOps != null
away.lineupOps != null
```

If not, lineup advantage equals zero.

When available:

```text
home base OPS = home lineup OPS vs away starter handedness
away base OPS = away lineup OPS vs home starter handedness
```

If a platoon split is unavailable, overall lineup OPS is used.

If career BvP data exists:

```text
blended home OPS =
  base home OPS × 0.60
  + career home BvP OPS × 0.40

blended away OPS =
  base away OPS × 0.60
  + career away BvP OPS × 0.40
```

Then:

```text
lineup advantage = clamp((home OPS - away OPS) × 0.30, -0.06, +0.06)
```

### 6.6 Park transformation

After all additive sports and matchup terms:

```text
park effect = (park factor - 100) / 100

home_probability =
  0.50
  + (home_probability - 0.50) × (1 - park effect × 0.15)
```

Examples:

- Park factor 100: no change.
- Park factor above 100: compresses the win probability toward 50%.
- Park factor below 100: expands the probability away from 50%.

There is no explicit clamp on the park factor itself before this transformation.

### 6.7 Evidence-quality compression

The MLB evidence layer starts at 1.0 and applies:

- Both lineups unavailable: `×0.78`
- One lineup confirmed/one unavailable: `×0.88`
- One or both bullpens unavailable: `×0.80` if both unavailable; `×0.90` if one available
- Weather unavailable/stale: `×0.92`
- Team stats unavailable/stale: `×0.86`

It clamps the final evidence multiplier to `.55–1.00`.

The probability transformation is:

```text
home_probability =
  0.50
  + (home_probability - 0.50) × evidence_multiplier
```

Missing starters are different: they block the actionable MLB decision rather than merely compressing confidence.

### 6.8 Deterministic noise

With valid DB team statistics, MLB receives a deterministic hash-based shift:

```text
noise =
  ((abs(hash(game ID) mod 8)) - 3) × 0.01
```

Possible values are:

```text
-3 pp, -2 pp, -1 pp, 0 pp, +1 pp, +2 pp, +3 pp, +4 pp
```

This is stable for a game ID but is not sports evidence.

### 6.9 Probability clamp

Before calibration:

```text
home_probability = clamp(home_probability, 0.20, 0.82)
```

### 6.10 Calibration

The finalizer applies a fixed global tail adjustment:

| Probability before calibration | Adjustment |
|---|---:|
| ≥65% | -2.0 pp |
| 60–64.99% | -1.5 pp |
| 55–59.99% | -1.0 pp |
| 45.01–54.99% | 0 |
| 40.01–45% | +1.0 pp |
| 35.01–40% | +1.5 pp |
| ≤35% | +2.0 pp |

This is not a fitted MLB calibration curve; it is a fixed piecewise transformation shared by the general moneyline model.

---

## 7. Actual influence ranges

| Component | Direct home-probability influence |
|---|---:|
| Home advantage | +4.0 pp |
| Record | No independent hard cap; depends on record gap and stored weight |
| Pythagorean | No independent hard cap; depends on run-strength gap and stored weight |
| Form | No independent hard cap; depends on last-five gap and stored weight |
| Score differential | No independent hard cap; depends on differential gap and stored weight |
| Rest | Approximately ±3 pp aggregate cap |
| Starting pitcher | ±8 pp cap |
| Bullpen fatigue | ±4 pp cap |
| Confirmed lineup/BvP | ±6 pp cap |
| Park factor | Multiplicative compression/expansion; normally subtle |
| Evidence quality | Multiplier `.55–1.00` around 50% |
| Hash noise | -3 pp to +4 pp with DB stats |
| Calibration | 0–2 pp toward 50% |

### Can team-level strength overpower a major matchup?

Yes.

There is no aggregate pre-finalization cap on the sum of:

- Record
- Pythagorean
- Form
- Score differential

The production weights for those factors are also much larger than the hardcoded priors. The pitcher signal is capped at ±8 pp, the bullpen at ±4 pp, and the lineup at ±6 pp. A strong overall team profile can therefore overpower a substantial one-game starter or lineup disadvantage.

---

## 8. What is active versus absent in MLB

### Active in the production probability

- Overall W/L record
- Home/road records as model input context, though the main generic MLB formula uses the supplied overall records
- Pythagorean win percentage
- Last-five W%
- Average run differential
- Rest
- Starting pitcher FIP
- Starting pitcher recent ERA
- Starting pitcher K-BB%
- Starter workload/sample reliability
- Bullpen recent weighted workload
- Confirmed lineup OPS
- Platoon OPS
- Career BvP OPS when sufficient
- Static park factor
- Evidence-quality multiplier

### Active only indirectly or for totals

- Season ERA: stored and available; the pitcher probability blend directly uses recent ERA, not season ERA
- WHIP: stored in pitcher evidence; not a direct probability term
- Strikeout rate: contributes through K-BB%
- Walk rate: contributes through K-BB%
- Weather
- Wind
- Bullpen combined workload total

### Available but not active in the MLB win probability

- Expected ERA/xERA
- xFIP
- Statcast metrics
- Pitch repertoire
- Pitch-level batter/pitcher matchup
- Individual hitter wRC+
- Individual hitter recent hitting form
- Named reliever skill quality
- Umpire
- Team defense as a standalone metric
- Baserunning
- MLB injury adjustment
- Travel

### Not present in the traced MLB production path

- xERA/xFIP provider data
- Statcast quality model
- Pitch mix/repertoire matchup model
- Umpire model
- MLB player-injury impact model
- Defensive runs saved/OAA model
- Baserunning model
- Opponent-adjusted hitter quality model

---

## 9. Stage C — MLB market evaluation

### 9.1 Current market

The route prefers the current complete actionable moneyline selected from the multi-book lookup. ESPN odds remain a fallback source when the Odds API market is unavailable, but an incomplete or invalid two-way market cannot support an actionable moneyline decision.

### 9.2 No-vig market probability

```text
if odds > 0:
  raw implied = 100 / (odds + 100)

if odds < 0:
  raw implied = abs(odds) / (abs(odds) + 100)

no-vig home =
  raw home / (raw home + raw away)
```

### 9.3 Edge

```text
edge =
  round((TBM calibrated home probability - no-vig home probability)
        × 100, 1)
```

The stored edge is always home-perspective:

- Positive edge: home side is the value side.
- Negative edge: away side is the value side.

For an away pick, the selected-side edge is the absolute edge magnitude.

### 9.4 Pinnacle and consensus

Pinnacle does not change the sports probability. It changes the sharp-market score:

```text
divergence =
  Pinnacle raw implied probability for pick
  - public-consensus raw implied probability for pick
```

Pinnacle divergence score:

- At least +5 pp: +4
- At least +3 pp: +3
- At least +1 pp: +1
- At most -4 pp: -3
- At most -2 pp: -2

Additional:

- Model absolute edge ≥10 pp: +1
- Plus-money Pinnacle pick with positive divergence: +1

Without Pinnacle and consensus, the fallback score is based on edge magnitude and odds.

### 9.5 Opening-line movement

Opening odds are write-once. Current odds are refreshed.

The route computes whether the home implied probability increased relative to opening:

```text
lineMovedTowardHome =
  current home implied probability
  > opening home implied probability
```

For an away pick, the Boolean is inverted before affecting sharp score.

- Movement toward the selected side: +1 sharp score
- Movement against the selected side: -1 sharp score
- Unknown movement: no change

Moneyline CLV is calculated at grading time from immutable pick price and closing price. It is not fed back into the sports probability.

---

## 10. Stage D — MLB recommendation logic

### 10.1 Thresholds

MLB uses:

```text
home Strong Buy: 12 pp
home Buy:         7 pp
away Strong Buy: 15 pp
away Buy:         10 pp
```

The away thresholds are higher because the model was calibrated around home probabilities and treats away edges as less proven.

### 10.2 Rating sequence

```text
if abs(edge) >= effective Strong Buy threshold:
  Strong Buy
else if abs(edge) >= effective Buy threshold:
  Buy
else:
  Neutral
```

Then:

1. Invalid or missing market → Neutral.
2. Missing MLB starter evidence → Neutral/block.
3. Pick price `<= -160` → Neutral.
4. Strong Buy with non-High confidence → downgraded to Buy.

Confidence is based on the calibrated home-probability distance from 50:

- High: at least 18 pp
- Medium: at least 9 pp
- Low: below 9 pp

The away threshold is based on edge magnitude, while confidence is based on home-probability distance from 50. Those are related but not identical.

### 10.3 Strong Buy is not a pure sports-strength label

Strong Buy requires:

- Large model-versus-market edge
- High probability confidence
- Complete credible market
- Complete starter evidence
- Price above the -160 ceiling

It does not require:

- Both lineups confirmed
- A positive starting-pitcher advantage
- A positive bullpen advantage
- Positive line movement
- Positive Pinnacle divergence

---

## 11. Stage D — TBM score

The MLB final score starts at 50.

### Edge points

- Edge ≥6 pp: +18
- Edge ≥4 pp: +14
- Edge ≥2 pp: +8
- Edge >0 pp: +3

### Confidence points

- Numeric confidence ≥88: +10
- ≥80: +7
- ≥70: +4
- ≥60: +2

### Sharp points

- Sharp score ≥4: +8
- Sharp score ≥2: +4
- No sharp signal and signed edge <2: -4

### Price points

The price adjustment is:

| Pick odds | Adjustment |
|---|---:|
| ≥ +120 | +0.6 |
| +100 to +119 | +0.4 |
| -110 to +99 | +0.2 |
| -111 to -130 | 0 |
| -131 to -160 | -0.3 |
| Shorter than -160 | -0.6 |

The adjustment is multiplied by five and rounded into score points.

Final score is clamped to 0–100.

Score tiers:

- 85+: Elite, five stars
- 72–84: Strong, four stars
- 60–71: Playable, three stars
- 50–59: Watchlist, two stars
- Below 50: Pass, one star

Because edge can contribute 18 points, TBM Score is primarily a **wager-quality/conviction score**, not a standalone sports probability score.

---

## 12. Stage E — MLB units

Moneyline units are determined by final score and recommendation:

| Final score | Units |
|---|---:|
| Neutral/Fade | 0 |
| Below 70 | 1.5 |
| 70–79 | 2.0 |
| 80–84 | 2.5 |
| 85+ | 3.0 |

The unit formula does not directly use:

- Bankroll
- Kelly fraction
- Expected value
- Drawdown
- Explicit probability variance
- Historical ROI

Those factors can affect whether the wager is approved, but not the final moneyline unit formula itself.

---

## 13. Stage D/E — publication and revision behavior

### Required before immutable MLB prediction

- Pregame start time
- Credible two-way moneyline
- Both probable starters complete and valid

### Not required for MLB publication

- Confirmed home lineup
- Confirmed away lineup
- Available bullpen data
- Positive lineup advantage
- Positive pitcher advantage
- Positive market movement

### Public publication

- Strong Buy and Buy are public-eligible.
- A six-pick daily ET cap can demote later picks to private.
- The cap is global across sports.
- Processing order is ESPN order.
- Newly created baseline picks are marked effective.

### Material pregame revisions

MLB can automatically revise an effective pick before start when there is a material change in:

- Starter
- Lineup
- Bullpen
- Weather
- Data-quality fingerprint
- Recommendation
- Side
- Market/model state

The previous row is preserved and voided as superseded. The replacement becomes effective. This is intended to protect subscribers from stale pregame decisions, but it creates multiple audit rows for one game.

---

## 14. Immutable evidence and grading

The prediction snapshot stores:

- Model version
- Game start
- Home/away teams
- Market prices
- Selected side
- Model probability
- Implied probability
- Fair probability
- Edge
- Recommendation
- Confidence
- Units
- TBM score/tier
- Factor weights
- Baseline factor contributions
- Full input signals
- MLB availability data
- Evidence quality
- Capture timestamp
- Data cutoff timestamp

Grading uses:

- Immutable pick odds
- Immutable selected side
- Final game result
- Closing price when available

It does not use mutable current `games` projections to rewrite the original decision.

Important audit limitation:

`factorContributions` currently records:

- Record
- Pythagorean
- Form
- Score differential
- Rest

The actual pitcher, bullpen, lineup, park, evidence multiplier, deterministic noise, and calibration inputs are stored elsewhere in the snapshot. The decision can be reconstructed, but the factor-contribution map does not provide a complete one-line decomposition.

---

## 15. Real immutable MLB example

### Oakland at Texas — August 31, 2026

Effective pick:

- Selection: Oakland away
- Odds: +188
- Recommendation: Buy
- Units: 2
- Result: Loss
- Stored selected probability: 57%
- Fair selected market probability: 33.686%
- Stored home-perspective edge: -23.7 pp
- TBM score: 77
- Score tier: Strong

### Team terms

Home advantage:

```text
50.000%
+4.000%
=54.000%
```

Saved factor contributions:

```text
Record                         +4.053 pp
Pythagorean                    -3.307 pp
Form                           -4.710 pp
Score differential             -3.327 pp
Rest                            0.000 pp
```

### Matchup terms

Starting pitchers:

- Oakland: FIP 3.65, recent ERA 4.67, K-BB 14.3%
- Texas: FIP 3.21, recent ERA 3.98, K-BB 22.6%
- Pitcher adjustment: +0.931 pp toward Texas/home

Bullpens:

- Oakland: Tired, weighted pitches 135
- Texas: Tired
- Home bullpen adjustment: -4.0 pp after cap, favoring Oakland

Lineups:

- Oakland unconfirmed
- Texas unconfirmed
- Lineup adjustment: 0

Park:

- Texas park factor: 107

Evidence:

- Starter evidence: available
- Bullpen evidence: available
- Weather evidence: available
- Both lineups: unavailable
- MLB evidence multiplier: 0.78
- Recommendation blocked: false

### Reconstructed probability

```text
Initial sports probability                         43.640%
Park transformation                               43.707%
Stored global multiplier 1.30                     41.819%
MLB evidence multiplier 0.78                      43.618%
Game-ID deterministic noise                       -2.000 pp
Pre-calibration probability                       41.618%
Piecewise calibration                             +1.000 pp
Final home probability                             42.618%
Displayed home probability                           43%
Displayed Oakland probability                        57%
```

### Market calculation

```text
Texas -216 raw implied                            68.354%
Oakland +188 raw implied                           34.722%
No-vig Texas probability                           66.314%
No-vig Oakland probability                         33.686%
TBM Oakland probability                            57.000%
Selected-side edge                                23.314 pp
```

The exact stored edge is calculated from the unrounded home probability:

```text
42.618% - 66.314% = -23.696 pp
stored edge = -23.7 pp
```

### Why it became a Buy

- The away Buy threshold is 10 pp.
- The absolute away edge exceeded that threshold.
- The probability confidence was Low, so a Strong Buy was downgraded to Buy.
- The model still assigned a 77 score because edge, confidence, sharp/price logic, and market context lifted the composite score.
- A 77 score produced two units.

This example shows that the model did not use the market to create the Oakland probability. The market made the Oakland probability look like a large value opportunity and drove the bet classification and sizing.

---

## 16. What the MLB model does not do

The current MLB model does not:

- Fit a statistical baseball win model from raw player-level outcomes.
- Use Statcast.
- Use xERA or xFIP.
- Model pitch repertoire against hitter weaknesses.
- Model individual hitter projections or wRC+.
- Model defensive alignment or defensive runs.
- Model baserunning.
- Model umpire tendencies.
- Model MLB injuries as a direct player-impact adjustment.
- Use weather in the moneyline probability.
- Use travel.
- Use a confirmed lineup as a hard requirement.
- Use named reliever quality, only recent bullpen workload.
- Automatically update MLB weights after every graded game in the current path.

---

## 17. MLB-only risk assessment

### High-risk findings

1. Current stored team weights are much larger than hardcoded priors.
2. There is no aggregate cap on team-level additive terms.
3. Lineup uncertainty compresses confidence but does not block Strong Buy/Buy publication.
4. Complete matchup adjustments are not exposed in the factor-contribution ledger.
5. Deterministic noise can move close-game probabilities despite not being sports evidence.
6. UFC-style shallow modeling is not relevant here; MLB is richer, but still not a full player-level baseball model.

### Medium-risk findings

1. Bullpen missing data behaves numerically like zero workload while being marked unavailable.
2. Season ERA and WHIP are captured but not direct pitcher-probability terms.
3. Park factor has no explicit input clamp.
4. Consensus prices average vig-inclusive side probabilities before later no-vig normalization.
5. A global fixed calibration curve is used instead of an MLB-specific empirical calibration model.

### Low-risk or intentional behavior

1. Sportsbook prices are kept out of the core moneyline probability.
2. Missing starters block actionable MLB recommendations.
3. Predictions and pick odds are immutable for grading.
4. Pregame revisions preserve superseded history rather than silently overwriting it.
5. -160 favorite protection prevents short-price MLB favorites from becoming public wagers.

---

## 18. Bottom-line MLB model statement

The current production MLB model is best described as:

> A run-based team-strength probability model, augmented by capped probable-pitcher, bullpen-workload, confirmed-lineup, and park adjustments; compressed for evidence quality; perturbed by deterministic game-ID noise; globally tail-calibrated; and then compared with a no-vig sportsbook moneyline to choose value bets and size them by a market-heavy composite score.

It is **not** currently a fully player-driven baseball matchup model.

The dominant production forces are:

1. Stored team record/Pythagorean/form/run-differential weights
2. The 1.3 global confidence multiplier
3. Starting-pitcher adjustment
4. Bullpen workload adjustment
5. Market edge and price rules after the sports probability

No MLB production weights should be changed based on a single poor week before the auditability/publication-safety and challenger-replay stages are complete.