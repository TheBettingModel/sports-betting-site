# TheBettingModel Production Forensic Audit

**Audit date:** September 3, 2026  
**Scope:** Current production moneyline/3-way prediction, market evaluation, recommendation, publication, and sizing paths; separate spread challenger path; production database configuration and one immutable MLB decision.  
**Change policy:** Read-only audit. No application code, production weights, thresholds, registry state, or data were changed.

---

## 1. Executive findings

### 1.1 Is TBM a sports prediction model first?

**At the probability layer, yes.** Sportsbook prices do not enter the primary moneyline sports probability formula for MLB, NFL, NBA, WNBA, NCAAF, NCAAB, NHL, Soccer, or UFC.

The primary sequence is:

1. Build a sports-only home probability from records, team statistics, and any wired sport-specific signals.
2. Apply the stored confidence multiplier and any sport-specific evidence compression.
3. Add deterministic ID-based noise.
4. Clamp and calibrate the probability.
5. Only then compare the calibrated sports probability with sportsbook no-vig probability.

### 1.2 Where does the market have large influence?

The market has substantial influence after the sports forecast:

- It determines edge.
- Edge determines the selected side.
- Edge is the main recommendation threshold.
- Edge contributes up to 18 points to the displayed TBM score.
- Pinnacle-versus-consensus divergence and line movement alter market-intelligence score.
- Pick price changes the displayed score.
- The displayed score determines moneyline units.
- Missing or invalid prices force Neutral.
- Favorites at -160 or shorter are forced to Neutral.

Therefore, TBM is sports-first at Stage A/B, but **bet selection and sizing are strongly market-driven**, as they should be for a value-betting product. The displayed TBM score is not a pure sports-strength score.

### 1.3 Most important production risks

1. **MLB's stored production weights are materially larger than the hardcoded priors.** The frozen MLB champion uses a 1.3 confidence multiplier and learned team-factor weights from the legacy outcome-learning period.
2. **MLB starter, bullpen, and lineup signals affect probability but are absent from the saved `factorContributions` map.** They exist inside `decision.inputSignals`, so the decision is reproducible, but current factor-level review understates their role.
3. **Unconfirmed MLB lineups do not block publication.** They reduce the evidence multiplier, but Buy/Strong Buy can still publish.
4. **NFL situational signals and NHL special teams are implemented but not wired into the production game refresh.**
5. **NCAAF moneyline is a market-free challenger forecast and is deliberately forced to Neutral/zero units.**
6. **UFC is almost entirely record-based.** It has no verified fighter-level technical model.
7. **The Results routes do not filter `published_picks.is_effective = true`.** Superseded MLB revisions are included in total-pick reporting.
8. **Direct moneyline outcome-driven learning is frozen, but old mutating learning code remains in the repository.**
9. **Spread publication lifecycle can still change automatically from Brier/ROI/CLV and related metrics.** This changes publication eligibility, not the sports probability weights.
10. **The moneyline formula injects deterministic hash noise of several percentage points.** It is stable for a game ID but is not sports evidence.

---

## 2. Actual production pipeline

| Stage | Current implementation |
|---|---|
| External schedule/scores/records | ESPN in `services/espn.ts` |
| Actionable market | The Odds API consensus/Pinnacle, with ESPN fallback, in `services/oddsApi.ts` and `routes/games.ts` |
| Sport enrichments | Team stats, MLB Stats API, NHL API, ESPN injuries, Open-Meteo |
| Mutable working record | `games` |
| Sports probability | `computeProjection()` in `services/model.ts` |
| Immutable decision evidence | `model_predictions.feature_snapshot` |
| Publication record | `published_picks` |
| Settlement | `pick_results`, using immutable pick odds and final scores |
| Independent forecast review | `forecast_reviews` |
| Registry | `model_versions` |
| Runtime weights | `model_weights` |

### 2.1 Refresh and normalization

`routes/games.ts` runs the current production path:

1. Fetch ESPN games.
2. Load production model versions and `model_weights`.
3. Fetch/cache sport-specific enrichments.
4. Fetch Odds API event and book data.
5. Select a complete actionable moneyline.
6. Build `ComputeOptions`.
7. Compute the projection.
8. Build immutable decision context.
9. Upsert the mutable `games` row.
10. Write one immutable prediction per game/model/market.
11. Publish an effective pick when market approval permits it.

The mutable `games` table is a current operational view. For forensic work, `model_predictions.feature_snapshot`, `published_picks`, `pick_results`, and `forecast_reviews` are the authoritative evidence.

### 2.2 External providers

| Provider | Active production use |
|---|---|
| ESPN | Schedule, game identity, teams, status, score, records, venue, some odds, NBA/WNBA team statistics, NFL injuries |
| The Odds API | Consensus moneyline, Pinnacle moneyline, spreads, totals, best-line candidates |
| MLB Stats API | Probable starters, pitcher rates, recent starts, confirmed lineups, hitter splits/BvP, recent bullpen usage |
| NHL Web API | Goalie season profile; PP/PK service exists but is not wired |
| Open-Meteo | MLB/NFL venue weather and total adjustment |
| Internal PostgreSQL | Completed-game team form, score differential, Pythagorean strength, immutable predictions/results |

### 2.3 Missing-data behavior

- Missing records parse to 50%.
- Missing generic team stats remove Pythagorean/form/score-differential/rest contributions.
- Missing complete moneyline forces Neutral.
- Missing either MLB starter blocks an actionable prediction/publication.
- Missing both confirmed MLB lineups produces a zero lineup contribution and evidence compression, but does not block publication.
- Missing bullpen entries are treated as zero weighted pitches inside the bullpen calculation; the evidence layer records them as unavailable and compresses confidence.
- Missing NHL goalie makes the goalie contribution absent and is recorded as missing evidence, but does not automatically block a recommendation.
- Missing NFL/WNBA injuries produce absent/zero injury influence and are recorded as missing.
- Missing Soccer market produces synthetic display odds but forces Neutral.
- NCAAF insufficient independent evidence produces a blocked challenger forecast.

---

## 3. Stage A — Sports forecasting

### 3.1 Shared team model

For MLB, NFL, NHL, NCAAB, and the legacy fallback portions of NCAAF:

```text
home_raw =
  0.50
  + home_advantage
  + (home_win_rate - away_win_rate) × record_weight
  + (home_pythagorean - away_pythagorean) × pythagorean_weight
  + (home_last5_win_pct - away_last5_win_pct) × form_weight
  + (home_score_diff - away_score_diff) × score_diff_weight
  + capped_rest_difference × rest_weight
  + sport-specific adjustments
```

Generic team statistics use up to 20 completed games before the target date. Minimum samples:

- MLB: 8
- NFL: 3
- NHL: 8
- NCAAF: 4
- NCAAB: 6

Pythagorean exponents:

- MLB: 1.83
- NFL/NCAAF: 2.37
- NHL: 2
- NCAAB: 10.25

### 3.2 Home advantage

| Sport | Additive home probability |
|---|---:|
| MLB | +4.0 pp |
| NFL | +5.7 pp |
| NBA | +6.0 pp |
| WNBA | +2.0 pp |
| NCAAF legacy | +7.5 pp |
| NCAAB | +6.5 pp |
| NHL | +4.5 pp |
| Soccer | +5.0 pp |
| UFC | 0 |

### 3.3 Hardcoded factor priors

These are fallbacks. Stored `model_weights.factor_weights` override them.

| Sport | Record | Pythagorean | Form | Score diff | Rest |
|---|---:|---:|---:|---:|---:|
| MLB | .20 | .28 | .10 | .012 | .005 |
| NFL | .22 | .25 | .08 | .003 | .018 |
| NHL | .22 | .22 | .14 | .018 | .016 |
| NCAAF legacy | .35 | .18 | .10 | .002 | .007 |
| NCAAB | .28 | .22 | .12 | .003 | .006 |

UFC defaults are record .45 and fallback form .20. UFC receives no generic DB team stats from the game route.

---

## 4. Sport-by-sport probability factors

### 4.1 MLB

| Factor | Source | Formula / maximum | Active |
|---|---|---|---|
| Season record | ESPN | W% difference × stored record weight | Yes |
| Pythagorean strength | Stored final MLB games | Pythagorean W% difference × stored weight | Yes |
| Last-five form | Stored final games | Last-5 W% difference × stored weight | Yes |
| Run differential | Stored final games | Per-game differential gap × stored weight | Yes |
| Rest | Stored schedule | Rest gap × weight, aggregate contribution capped ±3 pp | Yes |
| Starting pitcher | MLB Stats API | 45% FIP gap + 30% recent ERA gap + 25% K-BB equivalent; reliability/workload scaling; cap ±8 pp | Yes |
| Bullpen fatigue | MLB Stats API boxscores | `(away weighted pitches - home weighted pitches) / 250`; cap ±4 pp | Yes |
| Confirmed lineup | MLB Stats API | OPS/platoon/BvP gap × .30; cap ±6 pp | Yes when both lineups confirmed |
| Park | Static multi-year run factor | Compress/expand distance from 50% by `1 - park_delta × .15` | Yes |
| Weather | Open-Meteo | Total adjustment only | No direct win-probability impact |
| Evidence quality | MLB provenance layer | Compress distance from 50%; clamp multiplier .55–1 | Yes |

#### MLB pitcher formula

```text
FIP gap       = away FIP - home FIP
Recent gap    = away recent ERA - home recent ERA
K-BB ERA eq   = (home K-BB% - away K-BB%) × 5
Blend         = FIP gap × .45 + recent gap × .30 + K-BB ERA eq × .25
Pitcher shift = blend × .025 × workload × pitch-count × sample-reliability
                + deep-starter variance adjustment
Final cap     = ±.08
```

Workload factors:

- Recent innings: 60% floor, full at six innings.
- Pitch count: 65% floor, full at 90 pitches.
- Sample reliability: season IP and batters faced, 35% floor.
- Both starters averaging six-plus innings: -0.3 pp home adjustment.

#### MLB bullpen formula

Recent reliever pitches are weighted across three days. The matchup becomes:

```text
home win shift = clamp((away weighted pitches - home weighted pitches) / 250, -.04, .04)
total shift    = clamp((home + away weighted pitches) / 400, 0, 1 run)
```

#### MLB lineup formula

The lineup model requires both confirmed batting orders and season OPS.

1. Select platoon OPS against the opposing starter's handedness when available.
2. Otherwise use lineup season OPS.
3. If at least three batters have at least five PA against the starter, blend 60% base OPS and 40% career BvP OPS.
4. Multiply the home-away OPS gap by .30.
5. Cap at ±6 pp.

### 4.2 NFL

Active:

- Overall W/L record
- Pythagorean points strength
- Last-five W%
- Average point differential
- Rest, capped ±5 pp before weight
- ESPN injury impact by status and position
- Home advantage

Implemented but not wired by `routes/games.ts`:

- Divisional-game 8% compression
- Away dome team outdoors: +3 pp home
- Turnover-margin gap × .003, cap ±3 pp

Not present in production probability:

- EPA/play
- CPOE
- success rate
- pressure/sack rate
- offensive-line or defensive-line grades
- explosive-play rate
- red-zone efficiency
- coaching/scheme model
- opponent-adjusted efficiency

### 4.3 NBA

```text
home_raw =
  .50 + .06
  + (home home W% - away road W%) × record weight
  + eFG% gap × .28
  + reversed turnover% gap × .22
  + offensive rebound gap × .004
  + (block + steal gap) × .003
  + last-five W% gap × .12
  + last-ten point differential gap × .003
  + rest gap × .009, capped at ±3.5 pp
  ± explicit 2 pp back-to-back adjustment
```

Active: eFG%, turnover rate, offensive rebounds, blocks, steals, form, point differential, rest, home/road records.

Derived or typed but not used in the NBA probability path: TS%, pace, assists, 3P rate, FT rate, defensive rebounds, offensive/defensive rating, net rating.

Player availability, expected minutes, lineups, rotations, and on/off impact are not active for NBA.

### 4.4 WNBA

WNBA uses a separate evidence-aware context model:

- Home/road W%
- True shooting
- Possession net rating
- Offensive efficiency
- Defensive efficiency
- Perimeter profile
- Turnover profile
- Rebounding/interior proxy
- Free-throw generation
- Pace × net-rating interaction
- Schedule compression
- Travel burden
- Player availability impact

Each contribution is bounded:

- TS and net-rating style contributions: generally ±2 pp
- Offense, defense, perimeter, turnover, rebounding, FT: generally ±1.5 pp
- Pace interaction: ±1 pp
- Schedule compression: ±2 pp
- Travel: ±2 pp
- Availability: ±3.5 pp

Missing evidence contributes zero rather than a fabricated average.

### 4.5 NCAAF

The current NCAAF forecast is a market-free challenger.

For each team:

- Overall adjusted margin = average scoring margin minus opponent average margin
- Offensive adjustment = points scored minus opponent points allowed
- Defensive adjustment = opponent points scored minus own points allowed
- Recent form = margin weighted with a 28-day half-life
- Prior season = 365-day half-life
- Current/prior blend uses four equivalent prior games

Forecast:

```text
expected margin = home adjusted overall - away adjusted overall + 2.5 points
probability = 1 / (1 + exp(-expected_margin / 13.5))
```

Readiness requires:

- At least two current-season games per team, or
- No current games and at least three valid prior-season games.

When ready, this probability overwrites the legacy record-based NCAAF probability. It is then calibrated. All NCAAF subscriber recommendations remain Neutral with zero units.

Not available in this challenger:

- QB performance
- EPA/play
- roster talent
- transfers
- injuries
- scheme/coaching
- opponent-adjusted drive efficiency

### 4.6 NCAAB

Active:

- W/L record
- Pythagorean points strength
- last-five W%
- score differential
- rest
- home advantage

Not active:

- KenPom-style offensive/defensive efficiency
- tempo-adjusted efficiency
- roster/player availability
- lineup/rotation data
- matchup-specific shot profile
- opponent-adjusted schedule strength

### 4.7 NHL

Active:

- W/L record
- Pythagorean goal strength
- last-five W%
- goal differential
- rest
- home advantage
- goalie proxy

Goalie proxy:

```text
save component = (home SV% - away SV%) × 3 × .70
GAA component  = (away GAA - home GAA) × .03 × .30
cap             = ±7 pp
```

The goalie is the roster goalie with the most starts, not a verified announced starter.

Implemented but not wired:

```text
special teams = PP% gap × .40 + PK% gap × .20
cap = ±4 pp
```

Not active: xG, shot quality, skater availability, line combinations, confirmed starter, opponent-adjusted team efficiency.

### 4.8 Soccer

Raw home probability:

```text
.42 + .05
+ record/form-rate gap × record weight
+ (home goals/game - away goals allowed/game) × attack/defense weight
- (away goals/game - home goals allowed/game) × attack/defense weight
+ goal-differential gap × goal-diff weight
+ last-five form gap × form weight
+ last-five goal-diff gap × weight
+ rest gap × weight, capped ±2.5 pp
```

Draw probability:

```text
max(.18, .30 - abs(home_probability - .50) × .50)
```

Away has a .10 floor; all three outcomes are normalized.

Active inputs come from ESPN records and TBM's stored completed-game goals/form. There is no xG/xGA, lineup, injury/suspension, goalkeeper, shot-quality, or league-strength adjustment.

### 4.9 UFC

UFC has no verified fighter analytics model.

Active:

- Fighter W/L record from ESPN
- Zero home advantage
- Record-weighted probability
- Deterministic game-ID noise

The generic DB team-stat route excludes UFC, so the intended Pythagorean/form/rest team inputs do not arrive. The away-flip recommendation path is disabled, meaning an away-labelled fighter cannot become an actionable away pick through the normal two-way finalizer.

Not active: striking, significant-strike accuracy, striking defense, takedowns, takedown defense, submissions, reach, age, opponent quality, layoffs, or style matchup.

---

## 5. Stage B — Probability estimation

### 5.1 Stored confidence multiplier

After the sport evidence is added:

```text
p = .50 + (p - .50) × model_weights.confidence_multiplier
```

MLB then receives a second evidence multiplier:

```text
p = .50 + (p - .50) × mlb_evidence_multiplier
```

### 5.2 Deterministic noise

The model hashes the game ID and adds a stable shift:

```text
((abs(hash) mod (range + 1)) - offset) × .01
```

For the shared model:

- With DB stats: range 7, offset 3, giving possible shifts from -3 pp to +4 pp.
- Without DB stats: range 10, offset 5, giving -5 pp to +5 pp.

This is not market input and not sports data. It can change the predicted winner in close games.

### 5.3 Raw clamps

- Shared model: 20% to 82%
- WNBA basketball: 22% to 82%
- Soccer raw home: 15% to 75%

### 5.4 Calibration

Calibration is a hardcoded tail trim:

| Raw probability | Adjustment |
|---|---:|
| ≥65% | -2 pp |
| 60–64.99% | -1.5 pp |
| 55–59.99% | -1 pp |
| 45.01–54.99% | none |
| 40.01–45% | +1 pp |
| 35.01–40% | +1.5 pp |
| ≤35% | +2 pp |

This is not empirical sport-specific calibration. It is a common piecewise rule.

---

## 6. Stage C — Market evaluation

### 6.1 American odds and no-vig probability

```text
positive odds: implied = 100 / (odds + 100)
negative odds: implied = abs(odds) / (abs(odds) + 100)
no-vig home = raw_home / (raw_home + raw_away)
```

Soccer normalizes home/draw/away in the same way.

### 6.2 Consensus

The Odds API path:

1. Collects complete prices from configured public books.
2. Converts each side's price to raw implied probability.
3. Averages raw implied probabilities by side.
4. Converts each average back to American odds.
5. Separately retains Pinnacle.

Consensus construction averages vig-inclusive side probabilities; the model later removes vig from the selected complete consensus market.

### 6.3 Edge

Moneyline edge is stored from the home perspective:

```text
edge_pp = round((model_home_probability - no_vig_home_probability) × 100, 1)
```

- Positive edge selects home.
- Negative edge selects away.
- For an away pick, `abs(edge)` equals away model probability minus away fair probability.

### 6.4 Sharp market signal

When Pinnacle and consensus exist:

```text
divergence = Pinnacle raw implied probability - consensus raw implied probability
```

Scoring:

- ≥5 pp: +4
- ≥3 pp: +3
- ≥1 pp: +1
- ≤-4 pp: -3
- ≤-2 pp: -2
- Absolute model edge ≥10 pp: +1
- Plus-money Pinnacle price with positive divergence: +1

Without Pinnacle/consensus, sharp score is derived from edge and price.

Line movement then adds one point when movement confirms the pick and removes one when it opposes it.

### 6.5 Market-use classification

| Market datum | Sports forecast | Calibration | Market evaluation | Bet selection | Sizing/display |
|---|---:|---:|---:|---:|---:|
| Current moneyline | No | No | Yes | Yes | Yes |
| No-vig probability | No | No | Yes | Yes | Yes |
| Pinnacle | No | No | Yes | Indirect | Score |
| Consensus | No | No | Yes | Yes | Score |
| Opening line | No | No | Line movement | Indirect | Score |
| Current vs opening move | No | No | Yes | Indirect | Score |
| Spread | WNBA edge anchor only | No | Yes | Spread path | Spread units |
| Total | No moneyline impact | No | Totals/display | No moneyline selection | Display |
| CLV | No | No | Postgame review | Lifecycle gates in spread/approval | Reporting |
| Historical ROI | No | No | Validation | Approval lifecycle | No direct unit formula |

### 6.6 Market contamination verdict

There is no direct moneyline-price term inside the primary sports probability.

One intentional exception affects recommendation-level edge rather than probability:

- WNBA compares projected and market-implied spread.
- A gap of at least five points caps edge at 8 pp.
- A gap of at least eight points caps edge at 5 pp.

This can suppress a recommendation, but it does not rewrite the stored sports probability.

---

## 7. Stage D — Bet selection

### 7.1 Moneyline thresholds

| Sport | Home Strong Buy | Home Buy | Away addition |
|---|---:|---:|---:|
| MLB | 12 pp | 7 pp | +3 pp |
| WNBA | 12 pp | 8 pp | +5 pp |
| Others | 10 pp | 5 pp | +3 pp |
| UFC | 10 pp | 5 pp | Away disabled |

Selection is determined by the edge sign. Rating is based on absolute effective edge.

Additional gates:

- Complete credible pregame market required.
- MLB starter evidence required.
- All NCAAF subscriber picks forced Neutral.
- Buy/Strong Buy at -160 or shorter forced Neutral.
- Strong Buy requires High confidence.
- High confidence means rounded home probability at least 18 points from 50%.

### 7.2 Publication

Immutable prediction eligibility:

- Pregame timestamp
- Complete market, except NCAAF challenger evidence path
- MLB complete starter pair
- Required independent NCAAF evidence

Publication:

- Exact market approval is checked upstream.
- `shouldPublishPrediction()` currently returns true and is not itself a restrictive allowlist.
- Strong Buy and Buy are marked public unless the daily public cap has been reached.
- Daily public cap is six across all sports.
- ESPN processing order decides which qualifying picks receive the remaining slots.
- Every newly published baseline row is `is_effective = true`.
- MLB material revisions can supersede an earlier effective pick before start and void its pending result.

### 7.3 TBM score

The displayed score starts at 50:

Edge:

- ≥6 pp: +18
- ≥4 pp: +14
- ≥2 pp: +8
- >0: +3

Numeric confidence:

- ≥88: +10
- ≥80: +7
- ≥70: +4
- ≥60: +2

Sharp score:

- ≥4: +8
- ≥2: +4
- Zero and signed `edge < 2`: -4

Price:

- Price adjustment ×5, rounded
- +120 or longer: +3 score points
- +100 to +119: +2
- -110 to +99: +1
- -111 to -130: 0
- -131 to -160: approximately -1 or -2 after rounding
- Shorter: -3, though actionable picks are already blocked at -160

Final score is clamped 0–100.

**Important:** The TBM score is a bet-quality score, not a pure sports forecast score. Edge and market intelligence can contribute more score than sports confidence.

---

## 8. Stage E — Position sizing

Moneyline units:

| Recommendation/score | Units |
|---|---:|
| Neutral/Fade | 0 |
| Buy/Strong Buy and score <70 | 1.5 |
| Score 70–79 | 2.0 |
| Score 80–84 | 2.5 |
| Score ≥85 | 3.0 |

Published private Neutral rows use a database fallback of 1 unit in `published_picks`, but they are not public wagers and their prediction units remain zero.

Moneyline sizing is therefore indirectly driven by:

- Model probability distance from 50
- Model-versus-market edge
- Pinnacle/consensus divergence
- Line movement
- Price profile

It is not Kelly sizing and does not explicitly use bankroll, EV, drawdown, or probability uncertainty.

Spread units use:

```text
round_to_half(clamp(.5 + edge × 12, .5, 2))
```

only after edge, EV, uncertainty, and approval gates pass.

---

## 9. Requested sports-data depth classification

Legend:

- **ACTIVE**: verified in the current probability path.
- **PARTIAL**: a proxy/subset is active.
- **AVAILABLE, NOT USED**: implementation/data exists but is not wired to production probability.
- **NOT AVAILABLE**: no production source/path found.

### 9.1 MLB

| Requested statistic | Classification | Evidence |
|---|---|---|
| Starting pitcher | ACTIVE | MLB probable starter pair |
| ERA | PARTIAL | Recent ERA active; season ERA retained but not directly weighted in pitcher formula |
| FIP | ACTIVE | 45% of pitcher blend |
| xFIP | NOT AVAILABLE | No traced field/provider calculation |
| WHIP | AVAILABLE, NOT USED | Captured in availability; not in pitcher formula |
| K-BB% | ACTIVE | 25% of pitcher blend after ERA-equivalent scaling |
| Strikeout rate | PARTIAL | Used through K-BB%; individual K% retained |
| Walk rate | PARTIAL | Used through K-BB%; individual BB% retained |
| Statcast | NOT AVAILABLE | No Statcast provider |
| xERA | NOT AVAILABLE | No traced field |
| Pitch repertoire | NOT AVAILABLE | No pitch-level model |
| Handedness | ACTIVE | Drives lineup platoon selection |
| Batter platoon splits | ACTIVE when lineup confirmed | OPS vs L/R |
| Confirmed lineup | ACTIVE when both confirmed | Otherwise lineup contribution is zero |
| Individual hitter quality | PARTIAL | Lineup OPS aggregation |
| wRC+ | NOT AVAILABLE | OPS used instead |
| OPS | ACTIVE | Baseline lineup signal |
| OBP/SLG | PARTIAL | Underlying stats may be fetched; production signal is OPS |
| Expected hitting metrics | NOT AVAILABLE | No xwOBA/xSLG |
| Recent hitting performance | NOT AVAILABLE | No active lineup recent-form term |
| Bullpen quality | PARTIAL | Workload/fatigue, not talent/skill quality |
| Bullpen availability | PARTIAL | Recent usage proxy |
| Bullpen fatigue | ACTIVE | Weighted pitches, ±4 pp |
| Reliever usage | ACTIVE as aggregate | Pitch counts, not named availability |
| Park factors | ACTIVE | Static run factor |
| Weather | PARTIAL | Total only |
| Wind | PARTIAL | Total only |
| Umpire | NOT AVAILABLE | No source |
| Team offense | PARTIAL | Runs scored, Pythagorean, score differential |
| Team defense | PARTIAL | Runs allowed inside Pythagorean/differential |
| Baserunning | NOT AVAILABLE | No source |
| Injuries | NOT AVAILABLE | No MLB injury model |
| Rest/travel | PARTIAL | Rest active; travel absent |
| BvP | ACTIVE when sample/lineup permits | 40% lineup blend |

### 9.2 NFL

| Requested statistic | Classification |
|---|---|
| EPA/play | NOT AVAILABLE |
| Success rate | NOT AVAILABLE |
| Offensive/defensive efficiency | PARTIAL via scoring/Pythagorean |
| QB performance | PARTIAL via injury position impact only |
| CPOE | NOT AVAILABLE |
| Pressure/sack performance | NOT AVAILABLE |
| Offensive line | NOT AVAILABLE |
| Defensive line | NOT AVAILABLE |
| Rushing efficiency | NOT AVAILABLE |
| Passing efficiency | NOT AVAILABLE |
| Explosive plays | NOT AVAILABLE |
| Red-zone performance | NOT AVAILABLE |
| Turnovers/regression | AVAILABLE, NOT USED |
| Injuries | ACTIVE, coarse ESPN weighting |
| Player availability | PARTIAL |
| Rest | ACTIVE |
| Travel | NOT AVAILABLE |
| Weather | PARTIAL, total only |
| Coaching/scheme | NOT AVAILABLE |
| Opponent-adjusted strength | NOT AVAILABLE |

### 9.3 NBA/WNBA

| Requested statistic | NBA | WNBA |
|---|---|---|
| ORtg | AVAILABLE, NOT USED | ACTIVE |
| DRtg | AVAILABLE, NOT USED | ACTIVE |
| Net rating | PARTIAL via point differential | ACTIVE |
| Pace | AVAILABLE, NOT USED | PARTIAL interaction |
| eFG% | ACTIVE | PARTIAL/available through context |
| TS% | AVAILABLE, NOT USED | ACTIVE |
| Turnover rate | ACTIVE | ACTIVE |
| Rebounding | PARTIAL OREB | PARTIAL proxy |
| Shot profile | NOT AVAILABLE | PARTIAL perimeter profile |
| Player availability | NOT AVAILABLE | ACTIVE, coarse impact |
| Expected minutes | NOT AVAILABLE | NOT AVAILABLE |
| Starting lineup | NOT AVAILABLE | NOT AVAILABLE |
| Rotations | NOT AVAILABLE | NOT AVAILABLE |
| On/off impact | NOT AVAILABLE | NOT AVAILABLE |
| Rest | ACTIVE | ACTIVE |
| Back-to-back | ACTIVE | ACTIVE through schedule compression |
| Travel | NOT AVAILABLE | ACTIVE |
| Matchup offense/defense | PARTIAL team differential | PARTIAL team differential |

### 9.4 NCAAF/NCAAB

NCAAF:

- ACTIVE: point-in-time scoring margins, opponent scoring averages, recent decay, prior-season decay, uncertainty/readiness, home field.
- NOT AVAILABLE: EPA/play, success rate, QB, roster talent, transfers, injuries, scheme, drive efficiency.

NCAAB:

- ACTIVE: record, Pythagorean points, score differential, recent wins, rest, home advantage.
- NOT AVAILABLE: adjusted efficiency, tempo, player availability, lineup, rotations, shot profile, opponent quality.

### 9.5 NHL

| Requested statistic | Classification |
|---|---|
| Goalie | PARTIAL active proxy, not confirmed starter |
| xG | NOT AVAILABLE |
| Shot quality | NOT AVAILABLE |
| Special teams | AVAILABLE, NOT USED |
| Team efficiency | PARTIAL via goals/Pythagorean |
| Player availability | NOT AVAILABLE |
| Rest | ACTIVE |

### 9.6 Soccer

| Requested statistic | Classification |
|---|---|
| xG/xGA | NOT AVAILABLE |
| Lineup | NOT AVAILABLE |
| Injuries/suspensions | NOT AVAILABLE |
| Goalkeeper | NOT AVAILABLE |
| Shot quality | NOT AVAILABLE |
| Home/away attack/defense | PARTIAL: team goals for/against, not venue split |
| Rest | ACTIVE |
| Competition strength | NOT AVAILABLE |
| Matchup data | PARTIAL goals-for versus goals-allowed arithmetic |

### 9.7 UFC

All requested fighter-level statistics—striking, grappling, takedowns, defense, opponent quality, reach/size, age, recent technical performance, and stylistic matchup—are **NOT AVAILABLE in the production probability path**. Only record and deterministic noise are verified active.

---

## 10. Team vs player vs market influence

### 10.1 Where team strength can overpower today's matchup

MLB can combine multiple large team terms:

- Record gap × stored .3966
- Pythagorean gap × stored .5797
- Last-five W% gap × stored .2355
- Run-differential gap × stored .08317
- Global 1.3 amplification

Against those:

- Starter signal is capped ±8 pp.
- Bullpen is capped ±4 pp.
- Lineup is capped ±6 pp and is zero until both lineups confirm.

The team terms have no explicit aggregate cap before the final 20–82% clamp. Therefore, yes: **the current MLB model can say “Team A is better overall” strongly enough to overpower a major Team B starter/matchup advantage.**

### 10.2 Current production MLB weights

The production database contains:

| Setting | Current value |
|---|---:|
| Confidence multiplier | 1.3 |
| Record weight | .396624 |
| Pythagorean weight | .579707 |
| Form weight | .235502 |
| Score-differential weight | .083171 |
| Rest weight | .002 |

These values were last outcome-updated August 30, 2026 and frozen into the production champion snapshot on August 31.

For comparison, hardcoded MLB priors are .20, .28, .10, .012, and .005.

### 10.3 Influence categories

| Category | Current influence |
|---|---|
| Team historical performance | Large; several additive terms, amplified by stored multiplier |
| Recent team performance | Large in MLB because learned form/run weights exceed priors |
| Individual players/starters | MLB ±8 pp; WNBA availability ±3.5; NFL coarse injuries; NHL goalie ±7 |
| Matchup-specific analytics | MLB pitcher and lineup only; limited elsewhere |
| Injuries/availability | MLB lineup gate/compression, NFL coarse injuries, WNBA context |
| Rest/travel/weather | Sport-specific; mostly modest; weather does not change moneyline |
| Sportsbook information | Zero direct core-probability effect; large recommendation/score effect |
| Calibration | Fixed 0–2 pp tail compression |
| Market intelligence | Up to several TBM score points; no direct probability effect |
| Betting policy | Can force Neutral regardless of sports forecast |

---

## 11. Numerical production reconstruction

### 11.1 Game

**Oakland at Texas, August 31, 2026**

- Effective pick: Oakland away
- Pick price: +188
- Recommendation: Buy
- Units: 2
- Result: loss
- Stored selected probability: 57%
- Fair market selected probability: 33.686%
- Stored home-perspective edge: -23.7 pp
- Final TBM score: 77, Strong tier

### 11.2 Sports evidence

```text
Base                                                    50.000%
MLB home advantage                                      +4.000
Record contribution                                     +4.053
Pythagorean contribution                                -3.307
Last-five form contribution                             -4.710
Run-differential contribution                           -3.327
Rest contribution                                        0.000
Starting-pitcher contribution                           +0.931
Bullpen contribution                                    -4.000
Lineup contribution                                      0.000
                                                       --------
Pre-park sports probability                             43.640%
Park-factor transformation (Texas 107)                  43.707%
Stored global confidence multiplier 1.3                 41.819%
MLB evidence multiplier .78                             43.618%
Deterministic game-ID noise                             -2.000
Raw clamped home probability                            41.618%
Tail calibration                                        +1.000
                                                       --------
FINAL TBM HOME PROBABILITY                              42.618%
Displayed rounded home probability                         43%
Displayed selected Oakland probability                     57%
```

The lineup was unconfirmed for both teams, causing lineup contribution zero and evidence compression to .78.

Starter evidence favored Texas slightly:

- Oakland starter Gage Jump: FIP 3.65, recent ERA 4.67, K-BB 14.3%
- Texas starter Jacob deGrom: FIP 3.21, recent ERA 3.98, K-BB 22.6%
- Home pitcher shift: +0.93 pp

Bullpen fatigue favored Oakland strongly enough to hit the -4 pp cap from the home perspective.

### 11.3 Market

```text
Texas -216 raw implied                                  68.354%
Oakland +188 raw implied                                34.722%
Two-way overround                                      103.077%
No-vig Texas probability                                66.314%
No-vig Oakland probability                              33.686%
TBM Oakland probability (displayed)                     57.000%
Selected-side edge                                      23.314 pp
```

The exact internal edge uses the unrounded home probability:

```text
42.618% - 66.314% = -23.696 pp
stored edge = -23.7 pp
```

### 11.4 Recommendation and units

- Away MLB Buy threshold = 7 + 3 = 10 pp.
- Away MLB Strong Buy threshold = 12 + 3 = 15 pp.
- Edge cleared Strong Buy, but confidence was Low because the home probability was only seven rounded points from 50%.
- Strong Buy was downgraded to Buy.
- TBM score reached 77 from edge, confidence, sharp/line movement, and plus-money price.
- Score 70–79 produced 2 units.

This game demonstrates the architecture:

- Sports evidence chose Oakland before market evaluation.
- The market did not make Oakland the predicted winner.
- The enormous model-versus-market gap made it an actionable wager and raised the score.
- Team-form, run-differential, and bullpen terms outweighed the starting-pitcher disadvantage.

---

## 12. ROI, results, and learning audit

### 12.1 Can poor ROI change which team TBM predicts?

**Moneyline: not through the active production learning path.**

`learningEngine.ts` exports frozen research-only behavior:

- Outcomes receive evidence reviews.
- `pick_results.learning_review` and processing timestamps are updated.
- `model_weights` are not changed.

### 12.2 Can previous wins/losses change probability?

Not after the freeze through normal current callers. However:

- The current stored weights still contain the legacy outcome-driven values learned before August 31.
- The old mutating learner remains in `services/learning.ts`.
- It is currently shadowed by the frozen export, but its continued presence is a regression hazard.

### 12.3 Can historical win rate change confidence?

- Active normal moneyline learning: no new automatic changes.
- Existing `confidence_multiplier` values were historically learned and remain active.
- Explicit registry promotion can select a different production model after metric review.

### 12.4 Can ROI change model weights?

- Active moneyline path: no.
- Legacy learner code: primarily accuracy/Brier/factor agreement, not direct ROI.
- Spread approval lifecycle: ROI can contribute to approval status, affecting whether spread picks publish.

### 12.5 Can CLV change the sports forecast?

No direct moneyline probability path uses CLV.

CLV is used in:

- Postgame evaluation
- Qualification/promotion evidence
- Spread/market approval lifecycle

It can affect whether a market is approved for publication, not the underlying sports formula.

### 12.6 Can betting results alter recommendation thresholds automatically?

Fixed moneyline thresholds are hardcoded and are not automatically updated by the current learning run.

Spread configuration status can automatically move among production/challenger/suspended based on validation and betting metrics. That changes whether qualifying spread bets can publish.

### 12.7 Task-201 freeze verdict

The intended sequence:

```text
Completed game
→ immutable result/research review
→ production moneyline weights unchanged
```

is currently satisfied by the exported learning path.

Remaining risks:

1. Legacy mutating code still exists.
2. Existing learned values remain the production champion.
3. Spread approval can change automatically from outcomes.
4. Explicit model-registry promotion can change the production model after metric/master approval.

---

## 13. Database and auditability findings

### 13.1 Strong immutable components

- `model_predictions` is append-only by decision identity.
- Feature snapshot contains exact input options, availability, data-quality evidence, model version, game start, and prices.
- `published_picks` has a one-effective-pick-per-game/market invariant.
- MLB material revisions preserve the previous decision and void its pending result.
- Grading uses immutable pick odds rather than current mutable game odds.
- Forecast reviews are independent and do not mutate predictions or weights.

### 13.2 Gaps

1. `factorContributions` records baseline team factors but not pitcher, bullpen, lineup, park, evidence compression, learned multiplier, noise, or calibration.
2. The `games` table retains only summary MLB fields, not the full FIP/K-BB/lineup/BvP snapshot.
3. Reproduction therefore depends on `model_predictions.feature_snapshot`, not `games`.
4. The production MLB challenger registry row exists but has zero predictions.

### 13.3 Results reporting defect

`routes/results.ts` filters Strong Buy/Buy but not `is_effective`.

Consequences:

- Superseded pregame revisions appear in total picks.
- Voided audit rows inflate graded counts.
- Weekly period assignment uses mutable `games.game_date`.
- Non-pending nonstandard outcomes could count toward total picks without entering W/L/P.

This does not rewrite the effective result, but it makes the subscriber ledger misleading.

---

## 14. Actual code versus intended/commented architecture

| Intended/commented behavior | Actual production behavior |
|---|---|
| Factor snapshot fully explains decision | Baseline factors only; matchup adjustments live separately in `inputSignals` |
| NHL special teams available to model | Service and formula exist, route does not pass them |
| NFL turnover/divisional/dome signals available | Service and consumers exist, route does not call them |
| NBA advanced efficiency model | Only a subset of box-score efficiency fields actively reaches probability |
| UFC form/rest model | UFC is not in DB team-stat route; effectively record/noise only |
| Calibration reflects empirical calibration | Fixed global piecewise tail trim |
| `shouldPublishPrediction` controls publication | It always returns true; exact approval happens elsewhere |
| Public Results are official effective plays | Results query includes superseded non-effective rows |
| Sharp score documented 0–5 | Effective line-movement adjustment can reach 10; persisted raw `sharpScore` return is not always the adjusted score used in TBM score |
| Weather is a general contextual input | Weather changes projected total, not moneyline probability |

---

## 15. Final answers to the owner's core questions

### Who does TBM think will win based on sports information?

The sign of the sports-only calibrated probability relative to the sportsbook no-vig probability selects the wagered side. Strictly speaking, the displayed predicted winner by probability is the side above 50%; the wager side is the side with value versus market. In ordinary cases those can differ conceptually:

- A team can be predicted to lose with 45% probability.
- If the market prices it at 35%, TBM can recommend that team as the value side.

Therefore, the app must not equate “pick” with “most likely game winner.” A pick is the model's preferred wager.

### Can market math make TBM predict a different winner?

It does not alter the core moneyline probability. It can make TBM bet the less-likely team because that team is underpriced.

### Can overall team quality overpower a major individual matchup?

Yes, especially in MLB. Current learned team weights plus the 1.3 multiplier can exceed the capped starter, bullpen, and lineup shifts.

### Is market intelligence carrying too much influence?

It carries no direct probability influence, but it has significant influence on TBM score and units. Edge is the dominant score input. The answer depends on how TBM Score is presented:

- As bet quality: current composition is conceptually consistent.
- As confidence that a team will win: it is misleading.

### Is production outcome learning frozen?

The active moneyline learning export is frozen and research-only. Existing pre-freeze learned weights remain live. Spread publication approval can still change automatically from performance evidence.

### Is every advertised sports statistic truly used?

No. The production depth is strongest for MLB and WNBA, moderate but incomplete for NBA/NFL/NHL, shallow for Soccer/NCAAB, challenger-only for NCAAF, and extremely shallow for UFC.

---

## 16. Audit disposition

This audit supports the existing decision:

1. Do not change MLB production weights yet.
2. Correct auditability and publication-safety defects first.
3. Generate a real MLB challenger with complete factor attribution.
4. Replay immutable historical evidence.
5. Require predefined calibration, sample-size, and betting-quality gates.
6. Change production only through explicit registry promotion.

No production change was made as part of this audit.

---

## 17. Primary source map

- `artifacts/api-server/src/routes/games.ts`
- `artifacts/api-server/src/services/model.ts`
- `artifacts/api-server/src/services/teamStats.ts`
- `artifacts/api-server/src/services/espn.ts`
- `artifacts/api-server/src/services/oddsApi.ts`
- `artifacts/api-server/src/services/mlbPitchers.ts`
- `artifacts/api-server/src/services/mlbBullpen.ts`
- `artifacts/api-server/src/services/mlbLineups.ts`
- `artifacts/api-server/src/services/mlbParkFactors.ts`
- `artifacts/api-server/src/services/mlbDecisionEvidence.ts`
- `artifacts/api-server/src/services/weatherService.ts`
- `artifacts/api-server/src/services/nflInjuries.ts`
- `artifacts/api-server/src/services/nflTeamSignals.ts`
- `artifacts/api-server/src/services/nhlGoalies.ts`
- `artifacts/api-server/src/services/wnbaContext.ts`
- `artifacts/api-server/src/services/ncaafFeatures.ts`
- `artifacts/api-server/src/services/spreadModel.ts`
- `artifacts/api-server/src/services/snapshot.ts`
- `artifacts/api-server/src/services/grading-runner.ts`
- `artifacts/api-server/src/services/grading.ts`
- `artifacts/api-server/src/services/forecastReviews.ts`
- `artifacts/api-server/src/services/learningEngine.ts`
- `artifacts/api-server/src/services/learning.ts`
- `artifacts/api-server/src/services/marketApproval.ts`
- `artifacts/api-server/src/services/modelRegistry.ts`
- `artifacts/api-server/src/services/materialPregameRevisions.ts`
- `artifacts/api-server/src/routes/results.ts`
- `lib/db/src/schema/games.ts`
- `lib/db/src/schema/model-predictions.ts`
- `lib/db/src/schema/published-picks.ts`
- `lib/db/src/schema/pick-results.ts`
- `lib/db/src/schema/forecast-reviews.ts`
- `lib/db/src/schema/model-weights.ts`
- `lib/db/src/schema/model-versions.ts`