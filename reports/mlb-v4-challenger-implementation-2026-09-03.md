# MLB V4 Sports Forecasting Challenger — Implementation Report

Date: 2026-09-03  
Model ID: `tbm-mlb-moneyline-v4`  
Registry status: `challenger`  
Cohort: `shadow`  
Feature schema: `mlb-v4-features-v1`  
Dataset/input version: `mlb-v4-pit-input-v1`

## Executive summary

MLB V4 is implemented as a separate, shadow-only sports forecasting challenger. It does not alter, wrap, replace, or tune the existing production MLB champion.

The frozen champion remains:

- Model ID: `tbm-mlb-moneyline-v1`
- Production version: `3`
- Existing production weights: unchanged
- Existing confidence multiplier: unchanged

V4 starts with expected away runs and expected home runs, converts those run estimates into moneyline probabilities through an explicit run distribution, and evaluates the sportsbook only after the sports forecast exists.

V4 never:

- publishes a pick;
- sends a notification;
- assigns official units;
- enters public ROI or Results;
- becomes the free pick, Top Pick, or Play of the Day;
- updates champion learning;
- changes mutable game projections;
- rewrites historical evidence; or
- promotes itself.

## Architecture

The V4 implementation has three boundaries:

1. **Pure sports forecast**
   - Builds expected away and home runs from supported point-in-time baseball inputs.
   - Does not read the market while constructing expected runs or raw win probability.
2. **Explicit outcome distribution**
   - Uses independent Poisson run distributions, enumerated from 0 through 20 runs.
   - Normalizes truncated mass before calculating outcomes.
   - Splits regulation tie mass 50/50 because no validated extra-inning adjustment is yet registered.
3. **Research-only market layer**
   - Removes the two-way moneyline vig.
   - Calculates selected-side edge and expected value.
   - Applies data-quality and uncertainty gates.
   - Always stores `officialUnits = 0` and `SHADOW_NOT_OFFICIAL`.

The first distribution is intentionally simple and auditable. A negative-binomial or empirical score distribution remains a future candidate, but it must beat Poisson in chronological out-of-sample calibration and sharpness before replacement.

## Expected-run construction

V4 uses a league run-environment baseline of 4.5 runs per team and applies modular run contributions:

- **Team offense**
  - Runs scored per game from the internal completed-game ledger.
  - Bayesian shrinkage toward 4.5 runs using a 20-game prior.
- **Starting pitcher**
  - Run-rate estimate: 50% FIP, 25% season ERA, 25% recent ERA.
  - Expected innings come from recent innings per start, bounded to 3.0–7.2.
  - Season innings, batters faced, and recent-start count determine reliability and uncertainty.
- **Confirmed lineup**
  - Overall lineup OPS is recorded as observed lineup quality.
  - It is not added on top of historical team scoring, which would double-count the same hitters.
- **Platoon**
  - Confirmed lineup OPS against the opposing starter’s handedness.
- **Batter vs. pitcher**
  - Supplementary only.
  - Shrunk to 10% weight and capped at ±0.15 runs.
- **Bullpen availability/fatigue**
  - Uses the existing three-day weighted pitch-count workload.
  - Kept separate from bullpen talent.
- **Park**
  - Applies the existing park run-environment multiplier.
- **Weather**
  - Applies half of the existing total run adjustment to each team.
  - Dome games receive no weather adjustment.
- **Home field**
  - Adds a separately attributed provisional 0.12 runs to the home team.

Expected runs are bounded to 1.25–9.0 per team. Any bounding adjustment is preserved as its own factor contribution.

## Double-counting controls

V4 records but does not independently add record, Pythagorean win percentage, score differential, or recent win rate. Those fields are available as validation context, but independently adding them would count much of the same team run history again.

FIP, strikeout rate, walk rate, and K-BB% are not separately stacked. FIP already reflects strikeouts, walks, and home runs. K-BB%, workload, and sample sizes instead inform reliability and uncertainty.

Bullpen talent and bullpen fatigue are separate modules. Only fatigue is currently active because current point-in-time data does not provide reliable individual reliever talent.

## Missing and unsupported features

V4 preserves feature state using:

- `VALID`
- `PARTIAL`
- `STALE`
- `MISSING`
- `NOT_APPLICABLE`
- `INVALID`

Unsupported inputs receive zero run contribution and remain visible in the snapshot. V4 does not substitute league averages and call those metrics present.

Currently unsupported:

- xERA, xFIP, SIERA;
- wOBA, xwOBA, wRC+, OPS+;
- individual hard-hit rate, barrel rate, and exit velocity;
- pitcher and hitter pitch-type interactions;
- ground-ball/fly-ball and launch-profile interactions;
- individual reliever quality and platoon splits;
- defense, OAA, DRS, and catcher framing;
- baserunning value;
- umpire effects;
- MLB injury impact; and
- travel effects.

## Data-quality score

The 0–100 quality score is the weighted sum of:

| Component | Weight |
|---|---:|
| Starter confirmation | 20 |
| Starter feature completeness | 15 |
| Lineup confirmation | 15 |
| Lineup completeness | 10 |
| Bullpen completeness | 10 |
| Market freshness | 10 |
| Team-stat sample | 10 |
| Provider freshness | 4 |
| Park availability | 3 |
| Weather availability | 3 |

The score is separate from model probability. Missing data widens uncertainty and restricts research classifications; it does not randomly push a team’s win probability up or down.

## Uncertainty

V4 stores an uncertainty width in probability points with named sources:

- baseline model uncertainty;
- starter reliability or absence;
- lineup confirmation;
- bullpen availability;
- team-stat sample;
- stale providers; and
- unsupported player-level metrics.

There is no deterministic game-ID hash, pseudo-random shift, or hidden fallback probability.

## Calibration

Initial calibration status:

- Version: `mlb-v4-calibration-unfitted-v1`
- Method: identity
- Status: `UNFITTED_IDENTITY`
- Training sample: 0
- Training window: none
- Validation window: none

V4 intentionally does not reuse a generic or champion calibration transform. A future calibrator must be:

- MLB-only;
- chronological;
- trained only on immutable V4 shadow predictions;
- tested out of sample;
- registered with sample size, training window, validation window, Brier score, log loss, and calibration error; and
- demonstrably better than the raw probability.

## Attribution

Every run module stores:

- availability state;
- away-run contribution;
- home-run contribution;
- source values and method details; and
- home-win probability contribution.

Probability contribution is a single-factor counterfactual marginal: V4 removes one factor’s run contribution, reruns the same Poisson distribution, and records the change in home win probability. Because model modules interact, these marginals are explanatory and are not represented as strictly additive.

## Shadow storage and publication safety

Each materially distinct pregame MLB V4 forecast is written as an append-only revision to the existing immutable `model_predictions` ledger with:

- `is_challenger = true`;
- `cohort = shadow`;
- V4 registry version;
- selected-side model probability;
- raw and calibrated home/away probability;
- expected away and home runs;
- uncertainty;
- data-quality score;
- full run and probability attribution;
- explicit feature states;
- point-in-time cutoff;
- input and feature schema versions;
- market and expected-value research output;
- `units = 0`; and
- `SHADOW_NOT_OFFICIAL`.

The scheduler catches V4 failures independently. A V4 error is logged but cannot block or alter the production champion path.

The writer fingerprints the actual point-in-time sports and market inputs. An unchanged refresh is deduplicated, while a starter change, confirmed lineup, fresher provider capture, weather change, or market move creates a new immutable revision.

The shared registry marks `tbm-mlb-moneyline-v4` permanently non-deployable. It cannot transition from challenger to approved, production, retired, or another lifecycle status. The writer rechecks registry state on every write rather than caching it.

## Challenger outcome evaluation

The immutable forecast-review ledger accepts only the exact permanently shadow-only MLB V4 identity among challenger rows. Once a game has a final result, each valid pregame V4 revision receives an isolated research review containing:

- selection result;
- final score;
- selected-side probability;
- point-in-time fair probability and edge;
- Brier input;
- calibration input;
- recommendation coverage; and
- the exact feature snapshot used at prediction time.

This path writes no published pick, official ROI, units, champion learning, or game projection. Chronological comparison tooling can select the final valid pregame revision per game while retaining earlier revisions for drift and evidence-timing research.

## Public Results correction

Both public Results summary and ROI queries now require:

`published_picks.is_effective = true`

Superseded rows remain in storage for audit, but:

- an effective pick is counted;
- a superseded void is excluded; and
- multiple revisions count only the final effective revision.

## Learning safety

The legacy mutable learner and the former MLB confidence-normalization export were removed from the production module boundary. Champion snapshot capture now reads the live weight row without mutating it. The production learning facade exposes only the frozen, research-only evidence engine.

The active engine:

- records immutable outcome-review evidence;
- does not update champion weights;
- does not update the production confidence multiplier; and
- does not learn from V4 shadow rows as if they were official picks.

## Historical point-in-time reconstruction

Historical immutable source snapshot:

- Game: Miami Marlins at Washington Nationals
- Event ID: `MLB-401816747`
- Scheduled start: 2026-08-31 22:45 UTC
- Evidence capture: 2026-08-31 22:05:48 UTC
- Market: WSH -100 / MIA -112
- Park factor: 98
- Weather: 30.5°C, 3.8 mph wind, no precipitation, outdoor venue
- MIA starter: Ryan Gusto
- WSH starter: Will Dion
- Both lineups: unconfirmed at the cutoff
- WSH bullpen weighted pitches: 122
- MIA bullpen weighted pitches: 135
- Team-stat sample: 20 games per team

V4 reconstruction:

- MIA expected runs: **3.315**
- WSH expected runs: **3.347**
- Raw WSH win probability: approximately **50.3%**
- Calibrated WSH win probability: same as raw; calibration is currently identity
- Data-quality score: **75/100**
- Probability uncertainty: approximately **7.4 points**
- Lineup state: `MISSING`
- Pitch-type, defense, baserunning, and reliever-quality states: `NOT_APPLICABLE`
- Research recommendation: **Neutral**
- Official units: **0**
- Publication status: `SHADOW_NOT_OFFICIAL`

This reconstruction demonstrates the intended failure mode. The close sports forecast is preserved, but missing lineups widen uncertainty and prevent a high-conviction classification.

## Validation completed

Focused automated validation covers:

- normalized Poisson output;
- symmetry at equal expected runs;
- deterministic output when the game ID changes;
- historical point-in-time reconstruction;
- missing-input uncertainty behavior;
- explicit unsupported feature states;
- zero-unit shadow policy;
- public Results effective-ledger behavior;
- frozen research-only learning boundary;
- unchanged V3 production model tests;
- unchanged immutable snapshot behavior; and
- unchanged MLB promotion safeguards.

Validation at implementation time:

- API TypeScript typecheck: passed
- API build: passed
- Full API test files: 36 passed
- Full API tests: 284 passed
- API workflow restart and startup reconciliation: passed

## What remains before any promotion discussion

V4 is not promotion-ready. The next evidence phase is:

1. Collect a larger immutable V4 shadow sample.
2. Reconstruct additional historical games only where point-in-time evidence is valid.
3. Compare Poisson with negative-binomial and empirical score distributions.
4. Fit and freeze an MLB-only chronological calibrator.
5. Evaluate Brier score, log loss, calibration error, discrimination, uncertainty coverage, edge buckets, and closing-line comparison.
6. Evaluate whether any provisional coefficients improve out-of-sample forecasts.
7. Run the existing MLB champion/challenger promotion gate.
8. Obtain all required named approvals if, and only if, V4 passes.

No promotion, champion mutation, grading change, or historical rewrite was performed.