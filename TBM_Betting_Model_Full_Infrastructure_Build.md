# TheBettingModel (TBM)
# Betting Model and Full Infrastructure Build

**Document type:** Copy-ready architecture and implementation specification  
**Scope:** Moneyline, spread, model learning, market evaluation, risk management, publication, grading, mobile presentation, administration, and operations  
**Primary objective:** Build a statistically disciplined, price-aware, auditable betting system without rewriting historical predictions or mixing independent markets.

---

## 1. Executive Summary

TheBettingModel is a sport-specific prediction and betting-decision platform. It is not simply a winner-picking engine.

The system must answer five separate questions:

1. **Prediction:** What is the probability of each outcome?
2. **Market:** Is the sportsbook price mispriced relative to TBM's calibrated probability?
3. **Betting policy:** Should TBM wager on that market?
4. **Risk:** How much capital should be exposed?
5. **Learning:** What evidence should influence future research and model versions?

These questions must remain separate.

The core architecture is:

```text
Raw sport data
    ↓
Point-in-time validation
    ↓
Sport-specific model
    ↓
Probability / expected margin
    ↓
Calibration
    ↓
Uncertainty and data quality
    ↓
Sportsbook market snapshot
    ↓
No-vig market probability
    ↓
TBM versus market comparison
    ↓
Edge and expected value
    ↓
Market intelligence
    ↓
Approval gates
    ↓
Risk engine
    ↓
Official candidate
    ↓
Market competition
    ↓
Published pick
    ↓
Immutable freeze
    ↓
Closing line and final result
    ↓
Evaluation and research evidence
    ↓
Candidate model versions
    ↓
Backtest / walk-forward / out-of-sample
    ↓
Shadow challenger
    ↓
Explicit approval
    ↓
New production champion
```

The target system optimizes:

```text
Calibrated probability
+ Price accuracy
+ Market advantage
+ Risk-adjusted return
```

It must not optimize raw win percentage by itself.

---

## 2. Non-Negotiable Architecture Rules

These rules apply permanently.

### Historical integrity

- Never rewrite historical predictions.
- Never rewrite previous grades.
- Never recalculate historical official records using new rules.
- Never retroactively change old units, prices, recommendations, or selected markets.
- Every published pick remains tied to the exact model version, market, price, probability, recommendation, and units that existed when it was published.
- New rules apply only to new predictions unless a separate research analysis explicitly says otherwise.

### Market isolation

- Moneyline learning and spread learning are separate.
- Moneyline grading cannot train spread models.
- Spread grading cannot train moneyline models.
- Shadow models cannot enter official subscriber records, official ROI, or official notifications.
- The selected official market must be recorded explicitly.

### Production safety

- One game can add evidence.
- One game cannot change the production model.
- Production weights remain frozen until a validated challenger is explicitly promoted.
- Every production model has a canonical version and an approval record.
- Promotion and rollback must be auditable.

### Data integrity

- Missing data is not the same as zero.
- Invalid or stale markets fail closed.
- Retrospective information cannot be used as pregame evidence.
- Every feature must have a point-in-time availability timestamp or cutoff.
- A prediction cannot be published if required evidence is missing.

### Metric separation

These fields must remain distinct:

```text
Model probability ≠ confidence ≠ uncertainty
TBM Score ≠ model probability
Edge ≠ expected value
Expected value ≠ guaranteed return
Prediction quality ≠ betting-policy quality
Win rate ≠ profitability
```

---

## 3. Product and Infrastructure Components

The current product is organized into four primary artifacts:

```text
Mobile app       → Expo / React Native subscriber experience
Admin dashboard  → Web administration and model operations
API server       → Data, model, market, grading, auth, and publication services
Database         → Persistent predictions, markets, grades, learning, and approvals
```

Current workspace services:

```text
Admin:       pnpm --filter @workspace/admin run dev
Mobile:      pnpm --filter @workspace/mobile run dev
API server:  pnpm --filter @workspace/api-server run dev
Mockups:     pnpm --filter @workspace/mockup-sandbox run dev
```

The API must bind to the environment-provided `PORT`.

### Main infrastructure responsibilities

#### API server

- Authentication and authorization
- Subscription entitlement checks
- Sportsbook data ingestion
- External sport-data ingestion
- Game normalization
- Feature construction
- Moneyline predictions
- Spread predictions
- Market comparison
- Approval and publication
- Pick freezing
- Grading
- Learning evidence
- Admin endpoints
- Health and operational status

#### Database

The database is the source of truth for:

- Games
- Team and player inputs
- Market snapshots
- Model predictions
- Published picks
- Pick results
- Learning evidence
- Model weights
- Model versions
- Champion/challenger records
- Spread validation
- Approval gates
- Notifications and delivery status
- Audit records

#### Mobile app

- Shows forecast feed
- Shows official picks
- Shows market type
- Shows TBM Score
- Shows odds and line
- Shows analysis behind an expansion action
- Shows completed results
- Never recomputes model decisions locally
- Reads versioned API responses

#### Admin dashboard

- Shows model and market health
- Shows publication state
- Shows approval status
- Shows learning evidence
- Shows champion/challenger comparisons
- Shows data quality
- Shows push and subscription operations
- Allows operational controls only through audited actions

---

## 4. End-to-End Prediction Lifecycle

### Step 1: Ingest games

Collect upcoming games from authoritative sport feeds.

Normalize:

- Sport
- League
- Season
- Game identifier
- Start time
- Home team
- Away team
- Venue
- Timezone
- Neutral-site state

Never identify a game solely from display names. Use stable provider IDs and canonical internal IDs.

### Step 2: Ingest pregame evidence

Collect only evidence available before the prediction cutoff:

- Team records
- Home/road splits
- Team statistics
- Recent form
- Rest
- Injuries
- Availability
- Starting pitcher
- Starting quarterback
- Starting goalie
- Confirmed lineups
- Weather
- Venue and park information
- Schedule compression
- Travel
- Odds and market movement

Every input should retain:

```text
source
source identifier
retrieved timestamp
effective timestamp
game date
season
feature schema version
point-in-time cutoff
quality state
```

### Step 3: Validate evidence

Validation must distinguish:

```text
present and valid
present but stale
present but incomplete
not available
not applicable
invalid
```

Do not silently convert any of these into zero.

### Step 4: Run the sport-specific model

Generate:

- Model probability
- Expected margin when applicable
- Projected total when applicable
- Factor values
- Factor contributions
- Model version
- Input/evidence snapshot

### Step 5: Calibrate probability

Calibration is applied before edge, EV, and recommendation calculations.

The calibrated probability is the probability used by:

- Market comparison
- Expected value
- Brier score
- Log loss
- Risk engine
- Publication gates

### Step 6: Calculate uncertainty and data quality

Generate separate outputs for:

- Probability uncertainty
- Lower probability bound
- Upper probability bound
- Data quality
- Confidence
- Model maturity
- Model disagreement

These are not synonyms.

### Step 7: Capture the sportsbook market

Store a market snapshot containing:

- Book or source
- Market type
- Selection
- American odds
- Decimal odds
- Point spread
- Total
- Retrieved time
- Market effective time
- Opening price when available
- Current price
- Closing price after settlement
- Market completeness
- Market freshness

### Step 8: Remove vig

Compare TBM with the no-vig market probability.

For a two-outcome market:

```text
raw_home = implied probability of home price
raw_away = implied probability of away price
total = raw_home + raw_away
no_vig_home = raw_home / total
no_vig_away = raw_away / total
```

For Soccer, normalize home, draw, and away together.

### Step 9: Calculate edge

For a home selection:

```text
edge = TBM home probability - no-vig home probability
```

For an away selection:

```text
edge = TBM away probability - no-vig away probability
```

The stored home-perspective edge may be negative when the away side is the actual model selection. The API must also expose the selected-side edge explicitly to prevent display ambiguity.

### Step 10: Calculate expected value

Convert American odds to decimal odds.

```text
Positive American odds:
decimal = 1 + american_odds / 100

Negative American odds:
decimal = 1 + 100 / abs(american_odds)
```

Let:

```text
b = decimal odds - 1
p = calibrated model probability
q = 1 - p
```

Then:

```text
EV per unit = (p × b) - q
```

Positive EV means the estimated probability is high enough for the available price. It does not guarantee that the individual wager wins.

### Step 11: Apply market and publication gates

Check:

- Valid game
- Valid pregame evidence
- Complete market
- Approved sport/market/model version
- Minimum edge
- Minimum EV
- Uncertainty limit
- Data-quality floor
- Price guardrail
- Maturity rule
- Exposure limit
- Market-specific restrictions

### Step 12: Apply risk sizing

Determine whether the candidate is eligible for a stake and calculate the stake using the risk engine.

The TBM Score can rank and cap a candidate, but it should not be the primary bankroll formula.

### Step 13: Select the official market

Moneyline and spread candidates compete only after each independently passes its own gates.

If only one passes, it is the official candidate.

If both pass, compare them using a common risk-adjusted comparison:

- Expected value
- Selected-side edge
- Probability quality
- Uncertainty
- Price quality
- Market quality
- CLV history
- Drawdown risk
- Correlation and exposure

### Step 14: Freeze the published pick

At publication, freeze:

- Game
- Sport
- Market
- Selection
- Price
- Probability
- Fair price
- Edge
- EV
- Recommendation
- TBM Score
- Confidence
- Uncertainty
- Data quality
- Units
- Model version
- Feature snapshot
- Market snapshot
- Publication timestamp

After freeze, the published pick cannot be changed by a later refresh.

### Step 15: Grade the exact published pick

Grade using:

- The exact selected side
- The exact market
- The exact frozen price
- The final game result
- Push/void rules
- The frozen pregame evidence

Do not grade a historical pick using a later recommendation or a refreshed model.

### Step 16: Store research evidence

Every valid completed prediction produces research evidence, whether or not it was published.

Research evidence must not automatically alter production.

### Step 17: Evaluate and promote deliberately

Candidate changes require:

```text
Research evidence
    ↓
Candidate change
    ↓
Backtest
    ↓
Walk-forward validation
    ↓
Untouched out-of-sample evaluation
    ↓
Shadow challenger
    ↓
Approval gate
    ↓
New production version
```

---

## 5. Moneyline Model Architecture

Moneyline models estimate outcome probabilities. The current design is sport-specific rather than one universal formula.

### Shared moneyline inputs

Depending on sport:

- Home/road record
- Season record
- Pythagorean performance
- Efficiency
- Score or run differential
- Recent form
- Rest
- Back-to-backs
- Injuries and player availability
- Starting-player information
- Weather and venue
- Market information

Market information is used to evaluate price and market intelligence. It must be tracked separately from market-independent sport evidence.

### Shared probability pipeline

For two-outcome sports:

```text
base probability
    + sport-specific feature contributions
    + home advantage when applicable
    + roster/availability adjustments
    + context adjustments
    + calibrated probability
```

The final probability is bounded to prevent impossible or extreme outputs.

TBM must preserve a distinction between:

```text
market-independent evidence
market comparison
market intelligence
publication policy
```

---

## 6. Sport-Specific Moneyline Models

### MLB

Inputs:

- Season record
- Pythagorean win percentage
- Recent form
- Run differential
- Rest
- Starting pitcher quality
- Pitcher recent form
- Bullpen quality and fatigue
- Confirmed lineup quality
- Batter/pitcher matchup information
- Park factor
- Weather
- Market and line movement

Operating behavior:

- Starting pitcher is the most important individual-game adjustment.
- Bullpen is a secondary late-game adjustment.
- Lineup evidence is used only when sufficiently confirmed.
- Park factor adjusts run-environment variance conservatively.
- Incomplete starter evidence can block a recommendation.

Current production thresholds:

```text
Home Buy:       approximately 7 percentage points of edge
Home Strong Buy: approximately 12 points
Away surcharge: approximately 3 additional points
Price guardrail: -160 or more expensive is rejected
```

### WNBA

Inputs:

- Home/road record
- Effective field-goal percentage
- True shooting
- Turnover rate
- Offensive rebounding
- Steals and blocks
- Recent win percentage
- Recent point differential
- Offensive efficiency
- Defensive efficiency
- Net rating
- Perimeter matchup
- Free-throw generation
- Pace interaction
- Rest
- Back-to-backs
- Schedule compression
- Travel and timezone shift
- Player availability

Operating behavior:

- Missing WNBA evidence remains missing and cannot become an inferred signal.
- Availability, schedule, travel, and advanced efficiency signals are isolated from generic NBA inputs.
- Large disagreement with the Vegas spread caps the usable moneyline edge.

Current production thresholds:

```text
Home Buy:       approximately 8 points
Home Strong Buy: approximately 12 points
Away surcharge: approximately 5 additional points
Price guardrail: -160 or more expensive is rejected
```

The WNBA spread model is currently a separate shadow model and must remain unpublished until its independent validation and approval requirements pass.

### NBA

Inputs:

- Home/road record
- Effective field-goal percentage
- Turnover rate
- Offensive rebounding
- Steals and blocks
- Recent form
- Recent point differential
- Rest
- Back-to-back state

NBA player availability is a planned depth improvement and must be implemented independently from the existing moneyline/spread contracts.

### NFL

Inputs:

- Season record
- Pythagorean performance
- Recent form
- Point differential
- Rest and bye weeks
- Injury adjustments
- Quarterback status
- Divisional matchup state
- Dome/outdoor mismatch
- Turnover-margin advantage

Operating behavior:

- Missing starters, especially quarterbacks, can materially alter probability.
- Divisional games compress the modeled edge.
- Turnover margin is treated as an important season-level signal.

### NCAAF

Inputs:

- Record when valid
- Pythagorean performance
- Recent form
- Point differential
- Rest
- Independent feature snapshot when sufficient evidence exists

Operating behavior:

- NCAAF subscriber-facing moneyline recommendations remain Neutral until the launch evidence gate is satisfied.
- The challenger can be captured and evaluated without becoming an official recommendation.
- Retrospective team information cannot be used as pregame evidence.

### NCAAB

Inputs:

- Record
- Pythagorean performance
- Recent form
- Point differential
- Rest

The richer model requires a minimum amount of team evidence. Early-season games must not receive false precision from incomplete samples.

### NHL

Inputs:

- Record
- Pythagorean quality
- Recent form
- Goal differential
- Rest and back-to-backs
- Confirmed goalie quality
- Power-play percentage
- Penalty-kill percentage

Goalie status is a major game-level variable. Special-teams adjustments are bounded and layered on top of the goalie signal.

### Soccer

Soccer is a three-outcome model:

```text
Home win
Draw
Away win
```

Inputs:

- Win/draw/loss record
- Goals scored
- Goals allowed
- Attack versus opposing defense
- Goal differential
- Recent form
- Recent goal differential
- Rest

Market requirements:

- Valid home price
- Valid draw price
- Valid away price

The probabilities must be normalized across all three outcomes.

Draw behavior:

- A draw is not treated as evidence that home or away direction was correct.
- Directional factor learning must not nudge toward either side after a draw.
- Soccer probability evaluation uses a three-outcome scoring rule.

### UFC

Current inputs are relatively limited:

- Fighter record
- Recent form
- Rest

UFC is effectively a neutral-site competition. The normal home/away flip logic is disabled. The model must not imply team-sport home advantage.

---

## 7. Market Comparison and Price Rules

### No-vig market probability

The sportsbook's raw implied probabilities include vig. TBM must normalize them before calculating edge.

The market snapshot used for forecast evaluation must be the market available at prediction time.

Closing prices are used separately for CLV.

### The -160 guardrail

Current production behavior:

```text
Moneyline price at -160 or more expensive → recommendation forced Neutral
```

This means:

```text
-160, -165, -180 → blocked
-159, -150, -110 → not blocked by this specific rule
```

The guardrail remains in place during the upgrade.

It should be moved into versioned sport-market configuration so it can eventually be evaluated by sport, market, price bucket, calibration, EV, CLV, uncertainty, and risk.

Prices beyond the guardrail may be stored as research observations, but they must not enter official publication or official ROI until explicitly approved.

### Edge

Edge is the difference between TBM probability and no-vig market probability.

Edge is not guaranteed ROI.

### Expected value

Expected value uses the actual available price. A `+250` wager has:

```text
Decimal odds = 3.50
Profit if successful = 2.50 units
Break-even probability = 1 / 3.50 = 28.57%
```

If TBM estimates a 35% win probability:

```text
EV = (0.35 × 2.50) - 0.65
EV = 0.225
EV = +22.5% per unit risked
```

It can lose more often than it wins and still be profitable over a large, calibrated sample.

---

## 8. Spread Model Architecture

Spread models remain independent from moneyline models.

Currently supported spread sports:

- NFL
- NCAAF
- NBA
- NCAAB
- WNBA

Each sport has its own:

- Margin formula
- Expected-margin inputs
- Uncertainty model
- Minimum team sample
- Edge threshold
- Expected-value threshold
- Validation requirements
- Approval state

### Spread prediction record

Every spread prediction should store:

```text
game_id
sport
market = spread
model_version
predicted_margin
market_spread
cover_probability
push_probability
no_vig_cover_probability
expected_value
uncertainty
actual_margin after settlement
margin_residual
absolute_margin_error
closing_spread
spread_clv
result = win/loss/push/void
```

### Margin residual

Use home-perspective margin consistently:

```text
margin_residual = actual_margin - predicted_margin
absolute_margin_error = abs(margin_residual)
```

A one-point miss that loses a `-6.5` wager is not equivalent to a twenty-point model miss. The betting outcome and the prediction error must both be recorded.

### Spread metrics

Track:

- ATS win/loss/push
- Margin mean error
- Absolute margin error
- MAE
- RMSE
- Cover-probability Brier score
- Market Brier score
- Brier Skill Score
- Log loss
- Calibration
- CLV
- ROI
- Units
- Maximum drawdown
- Coverage
- Data quality

### Spread approval

Spread models remain shadow-only until they pass independent gates for:

- Sample size
- Calibration
- Brier score
- Brier Skill Score
- Log loss
- ROI
- CLV
- Drawdown
- Coverage
- Data quality
- Point-in-time integrity

Do not automatically update spread weights after one game.

---

## 9. Three Separate Learning Systems

### A. Prediction learning

Question:

```text
How accurately does TBM estimate the true outcome or margin?
```

Metrics:

- Brier score
- Brier Skill Score
- Log loss
- Calibration
- Probability error
- Margin error
- MAE
- RMSE

### B. Market learning

Question:

```text
Does TBM identify information the market is mispricing?
```

Metrics:

- No-vig edge
- Expected value
- Closing-line value
- Percentage beating the close
- Line movement
- Pinnacle or sharp-market comparison
- Book disagreement
- Edge persistence

### C. Betting-policy learning

Question:

```text
When should TBM bet, and how much should it risk?
```

Metrics:

- ROI
- Units
- Drawdown
- Risk-adjusted return
- Kelly efficiency
- Recommendation-tier performance
- Edge-bucket performance
- Price-bucket performance
- Correlation
- Daily and sport exposure

These systems must not be interchangeable.

Examples:

- A losing bet can come from a good probability estimate and bad variance.
- A winning bet can come from a bad probability estimate and favorable randomness.
- A strong probability estimate may still deserve a small stake if the price is volatile or the model is immature.

---

## 10. Learning and Model-Version Infrastructure

### Current learning problem

The existing moneyline learner updates sport-level weights and confidence values after graded games. It is bounded and safer than unrestricted self-learning, but it still allows individual results to influence future production behavior directly.

### Target learning flow

```text
Graded prediction
    ↓
Evidence record
    ↓
Aggregate sufficient sample
    ↓
Candidate factor or policy change
    ↓
Backtest
    ↓
Walk-forward validation
    ↓
Out-of-sample comparison
    ↓
Shadow challenger
    ↓
Approval
    ↓
New production version
```

### Research evidence record

Every completed prediction should store:

```text
prediction_id
sport
market
model_version
selected_side
model_probability
market_probability
edge
expected_value
final_result
brier_score
market_brier_score
brier_skill_contribution
log_loss
clv
feature_values
feature_contributions
prediction_error
recommendation
data_quality
confidence
uncertainty
price_bucket
edge_bucket
probability_bucket
home_away_neutral
favorite_underdog
model_maturity
prediction_timestamp
point_in_time_cutoff
```

### Champion/challenger

Every production model has:

```text
champion
```

Potential replacements run as:

```text
challenger
```

Both must see the same:

- Games
- Point-in-time features
- Market snapshots
- Prediction cutoff
- Settlement rules

The challenger must not influence the champion while in shadow mode.

Promotion creates:

- New model version
- New approval record
- New effective timestamp
- New configuration snapshot
- Rollback reference

Old versions remain available for audit and historical interpretation.

---

## 11. Probability Evaluation

### Brier score

For a two-outcome prediction:

```text
TBM_BRIER = (model_probability - actual_outcome)^2
```

For Soccer, use the three-outcome vector:

```text
Brier = (home_probability - home_result)^2
       + (draw_probability - draw_result)^2
       + (away_probability - away_result)^2
```

### Market Brier score

Use the no-vig market probability from the same point-in-time market snapshot:

```text
MARKET_BRIER = (market_probability - actual_outcome)^2
```

### Brier Skill Score

Over a meaningful cohort:

```text
BRIER_SKILL = 1 - (mean TBM Brier / mean Market Brier)
```

Interpretation:

```text
positive → TBM is better than the market baseline
zero     → TBM is similar to the market
negative → TBM is worse than the market baseline
```

Track by:

- Sport
- Market
- Model version
- Season
- Home/away/neutral
- Favorite/underdog
- Odds bucket
- Edge bucket
- Probability bucket
- Confidence bucket
- Recommendation tier
- Model maturity

### Log loss

Log loss penalizes overconfident incorrect predictions. It is important because an incorrect 52% prediction is not equivalent to an incorrect 78% prediction.

### Calibration

Group predictions into probability buckets and compare predicted probability with actual frequency.

Example:

```text
Predicted 55–60% → actual result rate
Predicted 60–65% → actual result rate
Predicted 65–70% → actual result rate
```

The system should not claim calibration quality from tiny samples.

---

## 12. Price-Aware Risk Engine

The risk engine must replace TBM Score as the primary mathematical sizing mechanism.

### Fractional Kelly reference

For decimal odds:

```text
b = decimal_odds - 1
p = conservative calibrated probability
q = 1 - p
```

Full Kelly:

```text
kelly_fraction = ((b × p) - q) / b
```

Only positive Kelly values are eligible.

Use a conservative multiplier:

```text
adjusted_kelly = kelly_fraction × 0.10
adjusted_kelly = kelly_fraction × 0.20
adjusted_kelly = kelly_fraction × 0.25
```

Full Kelly should not be used automatically.

### Risk reductions

Reduce sizing for:

- Probability uncertainty
- Poor calibration
- Low data quality
- Low model maturity
- Weak market liquidity
- Correlated selections
- Excess sport exposure
- Excess daily exposure
- Current drawdown
- Shadow or provisional approval state
- Missing key player confirmation

Conceptual formula:

```text
final_stake =
fractional_kelly
× calibration_factor
× data_quality_factor
× uncertainty_factor
× maturity_factor
× exposure_factor
× drawdown_factor
```

### Hard caps

Configure:

```text
MAX_UNITS_PER_PLAY
MAX_UNITS_PER_GAME
MAX_UNITS_PER_SPORT
MAX_UNITS_PER_DAY
MAX_CORRELATED_EXPOSURE
```

### Plus-money protection

High-payout bets must not automatically receive large stakes.

At `+250`, the correct question is not:

```text
Does this win more than 50%?
```

The correct questions are:

```text
Is the probability calibrated?
Is it above the 28.6% break-even threshold?
Is the EV positive after uncertainty?
Is the segment historically stable?
Is the model beating the closing line?
Is the proposed stake tolerable during losing streaks?
```

Use a conservative probability or lower-bound probability when estimating stake. Do not use a fragile point estimate as if it were certain.

---

## 13. Uncertainty, Confidence, and Data Quality

Every prediction should eventually expose:

```text
model_probability
probability_uncertainty
lower_probability_bound
upper_probability_bound
data_quality
confidence
model_maturity
model_disagreement
```

Example:

```text
Model probability:       57.4%
Uncertainty range:       53.8%–60.9%
Data quality:            91/100
Confidence:              72/100
```

Do not call the range a statistical confidence interval unless the method supports that interpretation. A safer label is:

```text
Estimated uncertainty range
```

### Uncertainty inputs

- Historical residual variance
- Sample size
- Player availability certainty
- Lineup confirmation
- Pitcher, quarterback, or goalie certainty
- Data coverage
- Model maturity
- Market quality
- Missing inputs
- Submodel disagreement
- Recent drift

### Data-quality inputs

- Market completeness
- Market freshness
- Player availability
- Lineup confirmation
- Starter confirmation
- Injury completeness
- Weather completeness
- Team-stat coverage
- Historical sample
- Feature completeness
- Point-in-time validity

Missing data must lower confidence or force Neutral. It must not silently become zero.

---

## 14. Thresholds and Recommendation Policy

Thresholds belong in a versioned sport-market configuration layer.

Example:

```text
sport = MLB
market = moneyline
buy_edge = 0.07
strong_buy_edge = 0.12
away_edge_addition = 0.03
max_price = -160
```

Example:

```text
sport = NCAAF
market = spread
minimum_edge = 0.05
minimum_ev = 0.05
maximum_uncertainty = configured value
```

### Current two-outcome recommendation behavior

Typical thresholds:

```text
MLB:
  Buy around 7% home edge
  Strong Buy around 12% home edge
  Away selections require additional edge

WNBA:
  Buy around 8% home edge
  Strong Buy around 12% home edge
  Away selections require more additional edge

Other two-outcome sports:
  Buy around 5% home edge
  Strong Buy around 10% home edge
  Away selections require additional edge
```

Strong Buy requires High confidence.

No verified market, blocked sport, blocked price, missing key evidence, or failed approval gate forces Neutral.

### Threshold research

Research multiple candidates:

```text
edge >= 2%
edge >= 3%
edge >= 4%
edge >= 5%
edge >= 6%
edge >= 8%
edge >= 10%
```

Evaluate each by:

- Brier
- Brier Skill
- Calibration
- CLV
- ROI
- Drawdown
- Sample size
- Stability

Do not continuously auto-tune the production threshold.

---

## 15. Model Maturity and Approval States

Maturity and publication approval are separate.

### Maturity states

```text
EXPERIMENTAL
DEVELOPING
VALIDATED
MATURE
```

### Approval states

```text
UNVALIDATED
SHADOW
PROVISIONAL
PRODUCTION_APPROVED
SUSPENDED
```

Example:

```text
Model: NCAAF Spread v0
Maturity: EXPERIMENTAL
Approval: SHADOW
Publication units: 0
```

Example:

```text
Model: MLB Moneyline v3
Maturity: MATURE
Approval: PRODUCTION_APPROVED
```

Maturity can constrain:

- Maximum confidence
- Maximum units
- Recommendation tier
- Publication eligibility
- Market-selection priority

Approval gates must include:

### Data integrity

- Point-in-time integrity
- No leakage
- Required data
- Sufficient coverage
- Valid market provenance
- Sufficient sample

### Predictive quality

- Brier
- Brier Skill
- Log loss
- Calibration
- Prediction or margin error
- Stability

### Betting quality

- CLV
- ROI
- Units
- Drawdown
- Edge-bucket performance
- Recommendation-tier performance

No exact production approval means:

```text
publication_units = 0
official_pick = false
subscriber_eligible = false
notification_eligible = false
official_record_eligible = false
```

---

## 16. Universal Evaluation Record

Create one evaluation snapshot for every:

```text
sport + market + model_version
```

Suggested fields:

```text
sport
market
model_version
evaluation_version
dataset_version
feature_schema_version
evaluation_start
evaluation_end
point_in_time_cutoff
prediction_count
graded_count
wins
losses
pushes
average_model_probability
average_edge
average_ev
brier_score
market_brier_score
brier_skill_score
log_loss
calibration_error
average_clv
median_clv
percent_beating_close
roi
units
max_drawdown
margin_mae
margin_rmse
data_coverage
data_quality
favorite_roi
underdog_roi
home_roi
away_roi
status
maturity
approval_status
created_at
```

Fields that do not apply to a market should be nullable, not fake zeros.

Keep separate evaluation views for:

- All forecasts
- Candidate bets
- Official published bets
- Shadow challengers

---

## 17. Segmented Performance Analytics

Evaluate deeper than sport-level ROI.

Minimum segments:

- Sport
- Market
- Model version
- Season
- Home
- Away
- Neutral
- Favorite
- Underdog
- Odds bucket
- Spread bucket
- Edge bucket
- Probability bucket
- Confidence bucket
- Recommendation tier
- Data quality
- Model maturity

Additional segments:

- Rest category
- Injury certainty
- Weather
- Starting pitcher
- Quarterback status
- Goalie status
- Conference
- Team tier
- Large spread
- Key number
- Price profile

Example:

```text
Overall ROI:       +4%
Favorites:         -3%
Underdogs:         +9%
Edge 2–4%:         -5%
Edge 6%+:          +11%
High confidence:   +7%
Low confidence:    -8%
```

Do not assume overall positive performance means every subgroup is useful.

Every subgroup should display:

- Sample size
- Confidence interval or uncertainty
- ROI
- Units
- Drawdown
- Brier Skill
- CLV
- Stability

Avoid promoting a subgroup based on a small lucky sample.

---

## 18. Data Model and Audit Contracts

### Games

Stores canonical game identity and stable sport context:

```text
game_id
provider_game_ids
sport
league
season
start_time
home_team
away_team
venue
neutral_site
status
final_score
lineup_status
starter_status
availability_status
weather_snapshot
created_at
updated_at
```

### Market snapshots

Stores point-in-time market facts:

```text
game_id
market_type
provider
book
selection
american_odds
decimal_odds
point_spread
total
opening_value
current_value
closing_value
retrieved_at
effective_at
market_freshness
market_completeness
source_payload_hash
```

### Model predictions

Stores immutable prediction decisions:

```text
prediction_id
game_id
sport
market
model_version
feature_schema_version
feature_snapshot
selected_side
model_probability
fair_probability
fair_price
market_probability
edge
expected_value
projected_margin
uncertainty
confidence
data_quality
recommendation
tbm_score
model_tier
stars
units
approval_state
created_at
point_in_time_cutoff
```

### Published picks

Stores the exact subscriber-facing decision:

```text
pick_id
prediction_id
game_id
sport
market
selection
published_price
published_probability
published_edge
published_ev
recommendation
units
model_version
approval_record_id
published_at
superseded_by
supersession_reason
```

Published records must be append-only. If an unstarted pick must be revised under a permitted policy, create a superseding record rather than mutating history.

### Pick results

Stores exact settlement:

```text
pick_id
result
final_score
settled_price
profit_units
roi
clv
graded_at
learning_processed_at
grading_evidence
learning_review
```

### Learning evidence

Stores research facts and derived metrics:

```text
prediction_id
sport
market
model_version
feature_values
feature_contributions
actual_outcome
prediction_error
brier_score
market_brier_score
brier_skill_contribution
log_loss
clv
price_bucket
edge_bucket
probability_bucket
segment_labels
created_at
```

### Model registry

Stores lifecycle and provenance:

```text
model_id
canonical_model_key
sport
market
model_version
role = champion/challenger
maturity
approval_status
effective_from
effective_to
parent_model_version
dataset_version
feature_schema_version
configuration_snapshot
rollback_source
approved_at
approved_by
```

There must be one active production champion per sport/market slot.

### Approval ledger

Approval must be exact and append-only:

```text
approval_id
sport
market
model_version
configuration_version
approval_status
required_gate_results
effective_from
effective_to
created_at
```

Missing or mismatched approval fails closed.

---

## 19. API Contract

All new API routes must be represented in the OpenAPI specification before mobile hooks are generated.

Core API domains:

```text
/games
/games/{id}
/forecasts
/picks
/results
/models
/models/{id}/evaluation
/models/{id}/approval
/markets
/admin/model-health
/admin/learning
/admin/approval
/admin/notifications
/subscription
/health
```

### Game response requirements

The game response should distinguish:

```text
selectedPick
selectedMarket
moneylineMarket
spreadMarket
forecast
analysis
approvalState
```

The legacy moneyline recommendation must remain separate from the selected-market object.

### Mobile behavior

The mobile adapter maps server objects into display models. The client must not infer:

- Which market is official
- Whether a shadow model is approved
- Whether a pick is eligible
- Whether missing data means zero
- Whether a spread should replace a moneyline

The API is authoritative.

### Presentation hierarchy

Collapsed card:

```text
Team / selection
Market type and line
Odds
TBM Score X/100
Higher = stronger model conviction
MODEL LEAN when appropriate
NO OFFICIAL BET when blocked or Neutral
```

Expanded analysis:

- Probability
- Confidence
- Edge
- Fair price
- Market probability
- Line movement
- Data quality
- Uncertainty
- Model factors
- Approval state

TBM Score must never be presented as a win probability.

---

## 20. Scheduled Jobs and Operational Cadence

### Before games

- Refresh upcoming games
- Refresh sport features
- Refresh injuries and availability
- Refresh starters and lineups
- Refresh weather
- Refresh markets
- Generate or update shadow candidates
- Run eligibility gates
- Publish approved picks
- Freeze published predictions
- Send eligible notifications

### After games

- Detect final results
- Grade exact published selections
- Calculate profit and ROI
- Calculate CLV
- Store learning evidence
- Store margin residuals for spreads
- Do not modify production weights directly

### Daily

- Reconcile game status
- Reconcile markets
- Reconcile settlement
- Refresh analytics
- Check notification delivery
- Check subscription access
- Check stale jobs

### Weekly

- Run model diagnostics
- Recompute segmented reports
- Check calibration and Brier Skill
- Check CLV drift
- Check data-quality failures
- Review candidate threshold performance

### Monthly or after a minimum sample

- Generate candidate model changes
- Run backtests
- Run walk-forward validation
- Compare champion and challenger
- Review risk and drawdown

### End of season

- Perform full model review
- Review feature stability
- Review market efficiency
- Review sport-specific structural changes
- Decide whether to retrain or retain the champion

Evaluation frequency and production-change frequency are different.

---

## 21. Drift Detection

Monitor:

- Calibration drift
- Brier Skill drift
- Log-loss drift
- CLV drift
- Scoring-environment drift
- Feature-performance drift
- Odds-market efficiency changes
- Rule changes
- Sport-specific structural changes

Example:

```text
Last 500 predictions Brier Skill: +0.08
Recent 100 predictions:            -0.04
```

Drift should:

- Raise an operational flag
- Trigger research review
- Potentially lower risk limits
- Potentially suspend a model if deterioration is severe

Drift must not automatically rewrite model weights or thresholds.

---

## 22. Security and Reliability

### Authentication and authorization

- Use the configured authentication provider.
- Enforce subscription entitlement on the server.
- Never trust mobile-only access checks.
- Admin privileges must be checked server-side.
- Do not allow admin accounts to bypass subscription rules unless that behavior is explicitly authorized and audited.

### Secrets

- Keep provider credentials in the workspace secrets system.
- Never place secrets in source code, API responses, logs, documents, or commits.
- Never ask users to paste credentials into chat.

### External feeds

- Validate provider responses.
- Apply timeouts and retries.
- Use single-flight refreshes for expensive server work.
- Never convert a transport failure into an empty feed.
- Mark data unavailable when refresh fails.
- Preserve last-known data only when its freshness is explicit.

### Database safety

- Run schema changes through the project migration process.
- Do not perform production DDL during startup before the production port is ready.
- Use append-only history for model decisions and approvals.
- Use transactional claims for one-time grading and learning.

### Observability

Log:

- Job start/end
- Provider response status
- Game count
- Market count
- Prediction count
- Publication count
- Grading count
- Learning evidence count
- Approval failures
- Data-quality failures
- Notification failures
- Latency
- Retry count

Never log:

- Secrets
- Access tokens
- Private keys
- Full credential payloads
- Sensitive personal data

---

## 23. Rollout Plan

### Phase 0: Safety contract

Implement and test:

- Historical immutability
- Market isolation
- Point-in-time provenance
- Exact approval matching
- No shadow contamination
- One champion per market slot
- Append-only publication and approval records

### Phase 1: Evidence ledger and champion freeze

- Capture the current production weights as an explicit champion.
- Stop direct game-by-game production weight changes.
- Continue recording learning evidence.
- Preserve current historical behavior.
- Keep current publication rules unchanged.

### Phase 2: Universal evaluation

- Add market Brier
- Add Brier Skill
- Add log loss
- Add calibration
- Add segment labels
- Add price and edge buckets
- Add forecast/candidate/official/shadow cohorts
- Add spread residual metrics

### Phase 3: Champion/challenger

- Add model registry lifecycle
- Add candidate configuration snapshots
- Add backtest runner
- Add walk-forward runner
- Add out-of-sample evaluation
- Add shadow challenger
- Add approval and rollback records

### Phase 4: Risk engine

- Add fractional Kelly reference
- Add uncertainty haircut
- Add data-quality and maturity modifiers
- Add sport/game/day caps
- Add correlation handling
- Run in shadow mode first
- Compare against current unit sizing
- Activate only for new predictions after validation

### Phase 5: Spread residual learning

- Persist predicted margin
- Persist actual margin
- Calculate residual and absolute error
- Add residual distributions
- Add spread probability calibration
- Add spread Brier Skill
- Generate candidate improvements without direct production changes

### Phase 6: Versioned configuration and monitoring

- Move thresholds into configuration
- Move price guardrail into configuration while preserving `-160`
- Add maturity state
- Add drift monitoring
- Add scheduled research reports
- Add admin visibility

### Phase 7: Sport-specific depth

Prioritize thinner areas:

- NCAAF
- NCAAB
- UFC
- NBA player availability
- NFL efficiency
- Soccer expected-goal depth

Do not rebuild MLB or WNBA merely because another sport needs more depth.

---

## 24. Testing and Acceptance Criteria

### Historical safety tests

- Updating a current model does not alter old prediction rows.
- Updating thresholds does not alter old recommendations.
- Updating unit sizing does not alter old units.
- Regrading cannot use a refreshed model.
- Superseding a pick creates a new record rather than rewriting history.

### Market isolation tests

- Moneyline grades cannot update spread metrics.
- Spread grades cannot update moneyline weights.
- Shadow picks cannot enter official ROI.
- Unapproved markets cannot trigger subscriber notifications.

### Pricing tests

- American odds convert correctly for positive and negative prices.
- No-vig probabilities sum to one.
- Soccer no-vig probabilities sum across home/draw/away.
- `-160` and more expensive prices are blocked.
- A missing or one-sided market is Neutral.
- EV uses the frozen published price.

### Learning tests

- One game writes evidence but does not change production weights.
- Candidate changes require a sufficient sample.
- Completed evidence is processed once.
- Draws do not directionally train Soccer home/away factors.
- Model versions remain linked to their original predictions.

### Spread tests

- Predicted and actual margins use the same orientation.
- Pushes are handled consistently.
- Spread residuals are recorded separately from ATS results.
- Shadow spread results never enter moneyline records.

### Risk tests

- Negative Kelly produces zero eligible stake.
- Fractional Kelly is applied correctly.
- Uncertainty reduces stake.
- Correlated exposure is capped.
- Daily exposure is capped.
- Historical units are unchanged.

### Product tests

- Mobile displays the selected market, not merely legacy moneyline data.
- Spread cards show team, line, market type, and odds.
- Neutral games show `NO OFFICIAL BET`.
- TBM Score is not labeled as probability.
- Analysis details remain behind the intended expansion control.

### Operational tests

- Provider timeouts do not become empty feeds.
- Refreshes are single-flight where required.
- Workflow startup binds to `PORT`.
- Logs contain no secrets.
- Admin operations are authenticated and audited.

---

## 25. Example Decision Records

### Example A: Profitable plus-money underdog

```text
Sport:                MLB
Selection:            Away team
Price:                +250
TBM probability:      35%
Market break-even:    28.6%
Expected value:       +22.5%
CLV:                  Positive
Uncertainty:          Moderate
Data quality:         High
Approval:             Production approved
Risk result:          Small fractional-Kelly stake
```

Interpretation:

This can be a valid long-term wager even if it loses most individual games. It should not automatically receive a large stake merely because the payout is high.

### Example B: Strong-looking favorite at -175

```text
Sport:                WNBA
Selection:            Home team
Price:                -175
TBM probability:      Positive edge
Expected value:       Positive
Price guardrail:      Failed
Recommendation:       Neutral
Official units:       0
Research record:      Stored separately
```

Interpretation:

The model can continue studying expensive favorites without publishing them during the guardrail phase.

### Example C: Spread loses by half a point

```text
TBM predicted margin: Home by 7.0
Market spread:        Home -6.5
Actual margin:        Home by 6
Bet result:           Loss
Margin residual:      -1.0
Absolute error:       1.0
```

Interpretation:

The bet lost, but the margin model was close. Betting-policy loss and prediction error must be reported separately.

### Example D: NCAAF insufficient evidence

```text
Model probability:    Captured if available
Data quality:         Insufficient
Approval:              Shadow or blocked
Recommendation:       Neutral
Units:                 0
Subscriber eligible:   false
Research eligible:     true
```

Interpretation:

The system may collect evidence without manufacturing an official recommendation.

---

## 26. Final Target Architecture

```text
RAW SPORT DATA
        ↓
CANONICAL GAME NORMALIZATION
        ↓
POINT-IN-TIME VALIDATION
        ↓
SPORT-SPECIFIC MODEL
        ↓
PROBABILITY / EXPECTED MARGIN
        ↓
CALIBRATION
        ↓
UNCERTAINTY
        ↓
DATA QUALITY
        ↓
SPORTSBOOK MARKET SNAPSHOT
        ↓
NO-VIG NORMALIZATION
        ↓
MODEL VS MARKET
        ↓
EDGE
        ↓
EXPECTED VALUE
        ↓
MARKET INTELLIGENCE
        ↓
SPORT-MARKET THRESHOLDS
        ↓
APPROVAL GATES
        ↓
RISK ENGINE
        ↓
OFFICIAL CANDIDATE
        ↓
MONEYLINE / SPREAD COMPETITION
        ↓
SELECTED OFFICIAL MARKET
        ↓
POSITION SIZE
        ↓
PUBLISH
        ↓
FREEZE PREDICTION
        ↓
CLOSING LINE
        ↓
FINAL RESULT
        ↓
EXACT PICK GRADING
        ↓
BRIER
        ↓
BRIER SKILL
        ↓
LOG LOSS
        ↓
CALIBRATION
        ↓
CLV
        ↓
ROI / UNITS / DRAWDOWN
        ↓
RESEARCH EVIDENCE
        ↓
CANDIDATE IMPROVEMENT
        ↓
BACKTEST
        ↓
WALK-FORWARD VALIDATION
        ↓
OUT-OF-SAMPLE TEST
        ↓
SHADOW CHALLENGER
        ↓
APPROVAL
        ↓
NEW PRODUCTION CHAMPION
```

---

## 27. Core Rules to Preserve

1. Prediction quality and betting results are not the same thing.
2. Win rate is not the primary profitability measure.
3. Probability must be evaluated against the no-vig market baseline.
4. Brier Skill must measure whether TBM improves on the market.
5. CLV is a major signal of whether TBM identifies real market value.
6. One result must never directly rewrite production weights.
7. All production changes require versioning and validation.
8. Moneyline and spread models learn independently.
9. TBM Score is not win probability.
10. Confidence is not win probability.
11. Edge is not guaranteed ROI.
12. Expected value must use the actual price.
13. Unit sizing must account for price and variance.
14. Missing data must reduce confidence or block publication.
15. Shadow models cannot enter official performance.
16. Historical picks and grades are immutable.
17. New models must prove themselves against the current champion.
18. Every production decision must have an audit trail.
19. Approval is exact, versioned, and fail-closed.
20. The objective is calibrated probability, good pricing, positive expected value, and disciplined risk-adjusted performance—not simply picking the most winners.
