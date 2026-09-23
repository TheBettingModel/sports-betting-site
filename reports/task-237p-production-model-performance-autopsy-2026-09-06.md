# TASK #237P — TBM PRODUCTION MODEL PERFORMANCE AUTOPSY

Audit timestamp: 2026-09-06T22:13:00Z  
Fixed production-data cutoff: 2026-09-06T22:04:36.749091Z  
Primary window: 2026-08-23T22:04:36.749091Z through 2026-09-06T22:04:36.749091Z  
Method: production read-only SQL plus source/test inspection; no collection, grading, mutation, training, promotion, or deployment  
Machine-readable companion: `reports/task-237p-production-model-performance-autopsy-2026-09-06.json`

## 1. Executive Summary

Primary classification: **D — BOTH FORECAST AND BET-SELECTION LAYERS DEGRADED**

Current 14-day record: **37-58-0** in the Results-API-style cohort; **26-39-0** in the subscriber-public cohort.  
Current 14-day units: **-36.17u** Results-API-style; **-25.91u** subscriber-public.  
Current 14-day ROI: **-17.91%** Results-API-style; **-18.91%** subscriber-public.  
Primary source of losses: MLB V1 forecast overconfidence plus non-monotonic edge/confidence/staking decisions; Soccer selection also materially lost.  
Worst sport: **MLB V1, -31.25u, -31.89% ROI (16-30)**.  
Worst market: **Moneyline**, the only actionable market present.  
Worst odds segment: **-149 to -110, -24.73u, -35.33% ROI (12-21)**.  
Worst edge segment: **10%+, -30.27u, -17.70% ROI (31-49)** using selected-side absolute edge.  
Worst confidence segment: **High, -28.32u, -30.45% ROI (15-25)**.  
CLV status: Current 14-day stored CLV is nominally +0.216 percentage points over 64 picks, median 0, 39.06% positive, but closing prices are not retained on those rows and historical CLV contains 35 bound violations; CLV is not strong enough for causal attribution.  
Forecast health: **Degraded platform-wide; MLB V1 severely degraded**.  
Bet-selection health: **Degraded; higher confidence, higher edge, and larger stakes did not improve outcomes**.  
Data-integrity status: Current 14-day ROI and calibration cohort is usable. Longer history requires explicit correction/exclusion for 22 Soccer draws graded as pushes, 35 invalid CLV values, and retired-test-model separation.  
Risk of continuing unchanged: **HIGH**, concentrated in current MLB V1 and Soccer publication decisions.

The current drawdown is not ordinary variance under the models' own claims. The 95 graded 14-day decisions produced -36.17u against a model-implied expectation of +87.00u, a **-4.59 standard-deviation** miss. Against market-implied probabilities the same result is a much more plausible **-1.53 standard-deviation** miss. This is direct evidence that production probabilities overstate forecast quality.

## 2. Authoritative Data Sources

| Lifecycle stage | Authoritative source | Fields used |
|---|---|---|
| Immutable forecast | `model_predictions` | probability, implied/fair probability, edge, confidence, recommendation, units, final/POD score, feature snapshot, prediction/data-cutoff timestamps |
| Model identity | `model_versions` | canonical model ID and registry status |
| Publication decision | `published_picks` | copied odds/units, public flag, POTD, revision/effectiveness, publication timestamp |
| Final settlement | `pick_results` | result, units risked/won, score, CLV, grading source/time/audit |
| Final game evidence | `game_results` | immutable final scores used for independent grade recomputation |
| Observed market | `odds_snapshots` | selection/price and capture time |
| Close | `closing_lines`; partially copied fields in `pick_results` | closing market data, but no exact prediction/publication foreign-key lineage |
| Eligibility ledger | `published_pick_performance_classifications` | append-only performance eligibility |
| User-facing record policy | `/api/results/summary`, ROI/results routes | effective Buy/Strong Buy, non-pending, NFL-preseason exclusion |

Lineage:

`model_predictions` → observed market in `odds_snapshots` → recommendation/unit decision → `published_picks` revision/publication → `pick_results`/`game_results` → `closing_lines`/stored CLV → Results API.

Missing links:

1. Predictions do not foreign-key the exact market snapshot used.
2. Stored CLV does not foreign-key a closing-line row.
3. Current CLV rows do not retain `closing_price`, so the value cannot be independently reproduced.
4. Provider-origin timestamps for odds, starters, lineups, injuries, weather, and team inputs are not consistently preserved in the immutable decision ledger.
5. Non-public actionable rows have no persisted reason proving whether the global cap caused the exclusion.

## 3. Data Integrity

Full production ledger:

- 2,447 publication events.
- 1,105 effective game/market decisions and 1,105 distinct effective identities.
- 926 effective win/loss/push grades; 179 pending.
- 0 duplicate prediction publications.
- 0 duplicate effective game/market identities.
- 0 duplicate pick results or game results.
- 0 malformed American odds, invalid unit values, missing model probabilities, post-start publications, prediction-after-publication cases, or cutoff-after-prediction leakage cases.
- 0 payout-arithmetic mismatches at a 0.021u tolerance.
- 0 decisive grades missing final score/game-result evidence.
- All settled rows report `grading_source=espn`; no suspicious manual grading source was found.

Issues:

1. **22 Soccer draws were stored as pushes but current three-way team-selection semantics require losses.** They occurred from July 20 through August 19. None is in the current 14-day cohort. No records were changed; longer-window corrected metrics are diagnostic only.
2. **35 effective rows have `abs(CLV)>50`**, violating the documented clamp. The worst is -4826.11. These occur before August 17; 30/60-day CLV aggregates are invalid.
3. **543 effective decisions belong to retired model `test-mlb-moneyline-v99-1784573270185`; 180 were public.** They must not be attributed to current MLB V1.
4. **99 effective rows are marked `performance_eligible=false`.** Eight are graded, but none is actionable Buy/Strong Buy; therefore they do not alter the current official record. Results routes nonetheless ignore this ledger.
5. Results routes also ignore `is_public`, causing non-public actionable rows to enter the displayed record.
6. 87 completed NCAAF rows remain pending, but all are non-public Neutral rows and do not enter betting performance.
7. Publication/result `updated_at` changes are numerous, but correspond to revision supersession and pending-to-graded lifecycle changes; no conflicting final grade was found.

Current 14-day sample:

- Raw effective actionable decisions: 98.
- Graded valid decisions: 95.
- Excluded from graded metrics: 3 pending.
- Public actionable decisions: 67; graded public: 65; pending public: 2.
- Non-public actionable decisions: 31; graded non-public: 30; pending non-public: 1.
- No current-window Soccer push misgrades or CLV bound violations.

## 4. Cohort Definitions

1. **Results-API-style cohort (primary operational record):** effective Buy/Strong Buy, graded, NFL preseason excluded. This reproduces current route policy and includes non-public rows.
2. **Subscriber-public cohort:** the same rules plus `is_public=true`.
3. **Forensic valid public cohort:** subscriber-public plus `performance_eligible!=false`, valid grade arithmetic, pregame timing, and known Soccer-draw correction/exclusion. It equals the subscriber-public cohort in the current 7/14-day windows.
4. **Forecast cohort:** all effective, performance-eligible pregame opinions with win/loss outcomes, regardless of recommendation. This separates forecast quality from bet selection.

Primary attribution uses the current 14-day Results-API-style cohort because it is what the application currently calls official, while always disclosing the public-only result.

## 5. 7 / 14 / 30 / 60-Day Platform Performance

### Results-API-style record

| Window | Published | Graded | W-L-P | Risked | Units | ROI | Avg odds | Median | Avg market p | Avg model p | Avg selected edge | Avg stake |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7d | 60 | 57 | 17-40-0 | 124.5u | -50.13u | -40.27% | 15.42 | -105 | 48.11% | 66.14% | 20.20pp | 2.184u |
| 14d | 98 | 95 | 37-58-0 | 202.0u | -36.17u | -17.91% | 41.04 | -105 | 46.48% | 63.43% | 18.73pp | 2.126u |
| 30d | 264 | 261 | 113-144-4 | 576.5u | -60.62u | -10.52% | 14.72 | -105 | 61.25% | 67.93% | 20.39pp | 2.209u |
| 60d | 374 | 371 | 174-187-10 | 774.5u | -22.26u | -2.87% | 2.32 | -105 | 62.54% | 67.28% | 18.44pp | 2.088u |

The 30/60-day raw records include Soccer push misgrades. Integrity-adjusted units are **-68.62u at 30d** and **-39.26u at 60d/season-to-date**. The 14-day record is unaffected.

### Subscriber-public record

| Window | Published | Graded | W-L-P | Units | ROI | Integrity-adjusted units |
|---|---:|---:|---:|---:|---:|---:|
| 7d | 42 | 40 | 12-28-0 | -36.66u | -42.63% | -36.66u |
| 14d | 67 | 65 | 26-39-0 | -25.91u | -18.91% | -25.91u |
| 30d | 192 | 190 | 88-99-3 | -34.41u | -8.31% | -39.41u |
| 60d/season | 302 | 300 | 149-142-9 | +3.95u | +0.65% | -10.05u |

Comparisons:

- Current 14d: 37-58, -36.17u, -17.91%.
- Prior 14d: 64-80-4, -31.63u, -9.39%.
- 30-day baseline preceding the current 14d: 124-114-8, +14.48u, +2.68%.
- Current 14-day maximum drawdown: **53.33u**.
- Longest current losing streak: **10**; longest winning streak: **5**.

## 6. Performance by Sport

Results-API-style actionable decisions:

| Window | Sport/model | Record | Units | ROI | Avg odds | Avg edge | CLV n/avg |
|---|---|---:|---:|---:|---:|---:|---:|
| 7d | MLB V1 | 16-30 | -31.25u | -31.89% | -42.9 | 20.4pp | 29 / +0.16pp |
| 7d | Soccer V1 | 1-10 | -18.88u | -71.25% | +259.5 | 19.1pp | 11 / +0.47pp |
| 14d | MLB V1 | 16-30 | -31.25u | -31.89% | -42.9 | 20.4pp | 29 / +0.16pp |
| 14d | retired MLB test | 10-7 | +6.75u | +20.15% | +23.3 | 12.6pp | 12 / -0.08pp |
| 14d | NFL V1 | 6-4 | +7.17u | +34.98% | +5.8 | 17.5pp | 7 / +1.11pp |
| 14d | Soccer V1 | 3-12 | -16.46u | -45.10% | +243.9 | 21.0pp | 15 / +0.47pp |
| 14d | WNBA V1 | 2-5 | -2.38u | -17.63% | +251.6 | 19.7pp | 1 / -4.57pp |
| 30d | retired MLB test | 57-55 | -4.56u | -1.87% | -59.1 | 22.6pp | invalid historical CLV |
| 30d | NFL V1 | 14-15-1 | +4.14u | +6.32% | +44.4 | 17.6pp | invalid historical CLV |
| 30d | Soccer V1 | 17-32-3 | -19.49u | -15.53% | +156.0 | 17.8pp | invalid historical CLV |
| 30d | WNBA V1 | 9-12 | -9.46u | -21.50% | +143.0 | 18.6pp | invalid historical CLV |
| 60d | retired MLB test | 107-91-3 | +23.32u | +5.99% | -42.1 | 18.5pp | invalid historical CLV |
| 60d | NFL V1 | 14-16-1 | +2.14u | +3.17% | +39.8 | 17.3pp | invalid historical CLV |
| 60d | Soccer V1 | 24-32-6 | -0.59u | -0.38% | +120.6 | 18.3pp | invalid historical CLV |
| 60d | WNBA V1 | 13-18 | -15.88u | -24.81% | +83.8 | 16.4pp | invalid historical CLV |

No valid recent actionable sample exists for NCAAF, NBA, NHL, or UFC. Current 14-day gross losing-sport units were MLB V1 -31.25u (62.4%), Soccer -16.46u (32.9%), and WNBA -2.38u (4.8%); NFL and the retired test model offset 13.92u.

## 7. Performance by Market

All current actionable decisions are `moneyline`. No spread, total, run-line, first-five, prop, or other market should be inferred. Moneyline therefore equals the platform totals: 95 graded, 37-58, -36.17u, -17.91% ROI in 14 days.

## 8. Favorites vs Underdogs

| Segment | n | Record | Units | ROI | Avg edge | CLV n/avg |
|---|---:|---:|---:|---:|---:|---:|
| Favorite (`<=-110`) | 40 | 16-24 | -26.31u | -30.77% | 18.27pp | 29 / +0.22pp |
| Near pick'em (`-109..+109`) | 9 | 3-6 | -6.10u | -30.50% | 17.73pp | 6 / -0.08pp |
| Underdog (`>=+110`) | 46 | 18-28 | -3.76u | -3.90% | 19.33pp | 29 / +0.27pp |

Losses are concentrated in favorites, not longshots.

## 9. Odds-Bucket Performance

| Odds bucket | Record | Units | ROI |
|---|---:|---:|---:|
| -300 or shorter | no sample | — | — |
| -299 to -200 | no sample | — | — |
| -199 to -150 | 4-3 | -1.58u | -10.19% |
| -149 to -110 | 12-21 | -24.73u | -35.33% |
| -109 to +109 | 3-6 | -6.10u | -30.50% |
| +110 to +149 | 8-12 | -5.88u | -14.52% |
| +150 to +199 | 7-8 | +6.86u | +22.49% |
| +200 or longer | 3-8 | -4.74u | -18.59% |

The most damaging price range is ordinary favorites from -149 to -110, not extreme chalk.

## 10. Edge-Bucket Performance

Production stores edge as rounded percentage points from the **home** perspective: calibrated home probability minus no-vig fair home probability. For an away selection the selected-side edge reverses sign; the report therefore uses `abs(stored edge)` after confirming selections follow the sign.

| Selected edge | n | Record | Units | ROI | Avg predicted p | Actual win rate | CLV |
|---|---:|---:|---:|---:|---:|---:|---:|
| 4-5pp | 2 | 1-1 | +0.04u | +0.89% | 31.0% | 50.0% | +0.18pp |
| 5-7.5pp | 3 | 2-1 | +1.76u | +25.14% | 40.3% | 66.7% | -0.24pp |
| 7.5-10pp | 10 | 3-7 | -7.70u | -39.49% | 57.9% | 30.0% | -0.45pp |
| 10pp+ | 80 | 31-49 | -30.27u | -17.70% | 65.8% | 38.8% | +0.32pp |

There are no current actionable observations below 4pp. Higher reported edge did not produce better outcomes; the 10pp+ segment contains 84% of volume and 84% of the net loss.

## 11. Confidence-Bucket Performance

Confidence is not a calibrated probability. It is absolute calibrated-probability distance from 50%: High >=18pp, Medium 9-17pp, Low <9pp.

| Confidence | Record | Units | ROI | Avg model p | Actual win rate |
|---|---:|---:|---:|---:|---:|
| High | 15-25 | -28.32u | -30.45% | 72.85% | 37.50% |
| Medium | 10-17 | -12.60u | -22.50% | 60.30% | 37.04% |
| Low | 12-16 | +4.75u | +8.96% | 53.00% | 42.86% |

Monotonicity is reversed: the highest-confidence tier performs worst.

## 12. Probability Calibration

The all-opinion 14-day forecast cohort shows:

| Sport | n | Avg predicted | Actual | Brier | Log loss | ECE |
|---|---:|---:|---:|---:|---:|---:|
| MLB | 136 | 62.26% | 47.79% | 0.28715 | 0.77915 | recommendation-specific: Neutral 0.080, Buy 0.155, Strong Buy 0.409 |
| NFL | 15 | 60.33% | 60.00% | 0.23947 | 0.67643 | small sample |
| Soccer | 32 | 56.44% | 34.38% | 0.23177 | 0.65417 | probability contract limited by three-way outcome semantics |
| WNBA | 13 | 44.15% | 30.77% | 0.25468 | 0.70372 | small sample |

MLB upper buckets are severely overconfident: 70-75% predicted realized 37.5% (n=8), 75-80% realized 52.6% (n=19), and 80%+ realized 38.5% (n=13). Across all sports, Strong Buy averaged 75.79% predicted but won 39.47%, with Brier 0.37417 versus market 0.25399.

Calibration slope/intercept was not fit because the short sample, rounded probabilities, mixed sports, and Soccer three-way semantics make it non-defensible.

## 13. Forecast Discrimination

Fourteen-day all-opinion AUC:

- MLB: **0.4872**, no useful discrimination.
- NFL: **0.5741**, directionally positive but n=15.
- Soccer: **0.7446**, apparent ranking signal, but not enough to overcome probability/selection and three-way semantics limitations.
- WNBA: **0.4722**, no useful discrimination, n=13.

Within MLB Buy picks, winners averaged 57.60% predicted and losers 59.00%; within MLB Strong Buy, winners 76.73% and losers 76.15%. The current MLB ranking does not separate outcomes.

## 14. Model vs Market

Fourteen-day all-opinion Brier comparison:

| Sport | Model Brier | Market Brier | Brier skill |
|---|---:|---:|---:|
| MLB | 0.28715 | 0.24997 | -0.1488 |
| NFL | 0.23947 | 0.26989 | +0.1127 |
| Soccer | 0.23177 | 0.22091 | -0.0492 |
| WNBA | 0.25468 | 0.19876 | -0.2813 |

Current production forecasts do not add reliable information beyond the market at platform level. MLB and WNBA are materially worse; Soccer is slightly worse; only NFL is better in a very small sample. The 14-day market-implied expected outcome was +3.88u with 26.22u standard deviation, versus the model-implied +87.00u.

## 15. CLV Analysis

Current 14-day stored CLV: n=64, average **+0.216pp**, median **0**, positive **39.06%**. Current values are within the documented ±50pp bound.

This does not establish that TBM is reliably beating the close:

- all 64 current CLV values lack retained `closing_price`;
- no exact closing-line foreign key exists;
- 35 historical effective rows breach the clamp, including -4826.11;
- many current values are exactly zero;
- sport/segment samples are small.

Conclusion: recent picks are losing while stored CLV is slightly positive, but CLV lineage is insufficient to distinguish true price capture from measurement noise. Historical 30/60-day CLV is unusable.

## 16. Forecast vs Bet-Selection Attribution

**Forecast failure evidence:** MLB all-opinion AUC 0.487, Brier 0.287 versus market 0.250, and selected MLB V1 average probability 69.83% versus 34.78% realized. WNBA is also worse than market. Strong Buy calibration is severely wrong.

**Selection failure evidence:** Buy/Strong Buy Brier is worse than Neutral; 10pp+ edge loses -30.27u; High confidence loses -28.32u; 2.5u and 3.0u tiers lose -27.92u; the cap excludes stronger-scored later rows; Soccer actionable decisions lose -16.46u.

No evidence supports an implied-probability arithmetic error or post-start publication. Persisted odds snapshots are contemporaneous, but provider-origin freshness cannot be proven. Multiple causes are present; variance alone is rejected.

## 17. Model Opinion vs Publication Permission

Current 14 days:

- 1,570 predictions.
- 1,400 publication/revision events.
- 200 effective opinions after 1,200 superseded events.
- 98 actionable Buy/Strong Buy candidates.
- 67 public actionable candidates.
- 31 non-public actionable candidates.
- 92 Neutral and 10 Fade effective opinions.
- 170 predictions had no publication row.

The system separates opinion and permission structurally, but downstream reporting collapses them by counting non-public rows. Rejection reasons are not persisted; 27 of 31 non-public actionable rows can be reconstructed as likely cap-demoted, not proven.

## 18. Global Six-Pick Cap Analysis

The code enforces six public picks per Eastern calendar day across all sports and scheduler runs. Sports/games are processed in provider order; there is no global sort by edge, final rating, or POD score. Earlier sports can consume capacity.

- Current 14d: cap reached on 10 calendar dates; 9 also had non-public actionable rows; 30 such rows on capped dates.
- Current 30d: cap reached on 23 dates; 13 had non-public actionable rows; 69 rows on capped dates.
- Current 60d: cap reached on 31 dates; 13 had non-public actionable rows.
- Of 27 likely cap-demoted current rows, 23 exceeded the weakest public pick's final rating and edge, 6 exceeded every public pick's rating and edge, and 13 exceeded every public pick's POD score.
- On capped days, graded public picks were 22-32, -20.66u; non-public were 10-16, -7.98u. Both groups lost, so reconstruction does not prove that publishing excluded rows would improve returns.

Processing order clearly prevents the cap from selecting the globally strongest six.

## 19. Unit-Sizing Analysis

Current 14-day actual result: **-36.17u**.  
Flat one-unit counterfactual on the same picks: **-14.45u**.  
Loss amplification attributable to sizing: **-21.72u**.

| Tier | n | Record | Actual units | Flat units | Actual ROI |
|---|---:|---:|---:|---:|---:|
| 1.5u | 8 | 4-4 | +3.35u | +2.23u | +27.92% |
| 2.0u | 59 | 25-34 | -11.60u | -5.80u | -9.83% |
| 2.5u | 24 | 7-17 | -23.54u | -9.42u | -39.23% |
| 3.0u | 4 | 1-3 | -4.38u | -1.46u | -36.50% |

TBM is not placing more units on bets that perform better.

## 20. Play of the Day Analysis

| Window | n | Record | Units | ROI | Avg odds | Avg edge | Avg POD score | CLV |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 7d | 12 | 2-10 | -16.86u | -63.62% | +373.1 | 19.87pp | 53.25 | +0.21pp |
| 14d | 22 | 7-15 | -8.74u | -21.06% | +345.2 | 22.88pp | 53.82 | +0.13pp |
| 30d | 89 | 36-50-3 | +13.20u | +7.06% | +306.1 | 21.21pp | 52.74 | invalid historical CLV |
| 60d | 114 | 50-57-7 | +34.32u | +14.18% | +238.8 | 20.36pp | 52.58 | invalid historical CLV |

POTD has a positive longer raw history but failed badly in the current week. Because historical Soccer grades and CLV are defective and current POTD volume is unusually high, current evidence does not establish durable ranking value.

## 21. Publication-Timing Analysis

| Time to start | n | Record | Units | ROI | Avg CLV |
|---|---:|---:|---:|---:|---:|
| <30m | 15 | 6-9 | -2.94u | -9.48% | -0.02pp |
| 30-60m | 7 | 1-6 | -9.60u | -64.00% | +0.21pp |
| 1-3h | 29 | 13-16 | -8.14u | -13.02% | +0.20pp |
| 3-6h | 10 | 3-7 | -8.59u | -39.05% | -0.29pp |
| 6-12h | 14 | 7-7 | +2.77u | +9.23% | +1.02pp |
| 12h+ | 20 | 7-13 | -9.67u | -23.30% | +0.21pp |

No monotonic early/late failure is established. The 30-60m bucket is worst but small.

## 22. Data-Freshness Analysis

No pick was published at/after start. Immutable prediction cutoffs and persisted odds captures are essentially contemporaneous with publication. Median lead time was 1.80h for MLB, 15.57h NFL, 4.65h Soccer, and 16.79h WNBA; 15 MLB picks were inside 30 minutes.

However, the near-zero persisted odds age reflects a snapshot written at publication, not necessarily the sportsbook provider's source timestamp. Starter, lineup, injury, weather, and team-data provider timestamps are not consistently frozen in the auditable ledger. Therefore stale-input incidents cannot be quantified reliably; no stale incident was proven, but freshness is not fully auditable.

## 23. Model-Version Stability

Registry champions remain V1. MLB V4 and NCAAF V4 are not active.

The 14-day MLB history contains two models:

- Retired `test-mlb-moneyline-v99-1784573270185`: last publication 2026-08-29T23:42:55.360Z; current-window 10-7, +6.75u.
- Production `tbm-mlb-moneyline-v1`: current publications through 2026-09-06T18:09:29.588Z; current-window 16-30, -31.25u.

The test model materially contaminates 14/30/60-day aggregate history and was separated throughout. No stored runtime event supplied a reason for the transition.

## 24. 30-Day Daily Performance

Results-API-style daily series; historical CLV before August 17 is invalid.

| ET date | Picks | W-L-P | Units | ROI | Cumulative | Avg odds | Avg edge |
|---|---:|---:|---:|---:|---:|---:|---:|
| Aug 08 | 7 | 3-4-0 | -2.77 | -18.47% | -2.77 | -82 | 23.4 |
| Aug 09 | 11 | 9-2-0 | +9.95 | +44.22% | +7.18 | -144 | 19.8 |
| Aug 10 | 5 | 4-1-0 | +5.99 | +52.09% | +13.17 | -130 | 24.2 |
| Aug 11 | 9 | 6-3-0 | +5.45 | +28.68% | +18.62 | -87 | 24.0 |
| Aug 12 | 9 | 6-3-0 | +5.38 | +25.62% | +24.00 | -36 | 22.0 |
| Aug 13 | 12 | 4-7-1 | -7.35 | -26.73% | +16.65 | -19 | 16.7 |
| Aug 14 | 9 | 4-5-0 | -6.04 | -31.79% | +10.61 | -165 | 15.4 |
| Aug 15 | 16 | 9-6-1 | +11.72 | +32.11% | +22.33 | -7 | 19.3 |
| Aug 16 | 11 | 2-9-0 | -15.65 | -68.04% | +6.68 | -68 | 20.6 |
| Aug 17 | 3 | 1-1-1 | -1.18 | -18.15% | +5.50 | +63 | 33.8 |
| Aug 18 | 3 | 2-1-0 | +1.49 | +21.29% | +6.99 | -47 | 18.1 |
| Aug 19 | 17 | 5-11-1 | -16.23 | -37.74% | -9.24 | -50 | 24.9 |
| Aug 20 | 10 | 6-4-0 | +2.67 | +11.87% | -6.57 | +64 | 25.3 |
| Aug 21 | 13 | 6-7-0 | -3.49 | -11.63% | -10.06 | +23 | 26.9 |
| Aug 22 | 23 | 9-14-0 | +4.61 | +8.95% | -5.45 | +157 | 18.5 |
| Aug 23 | 9 | 0-9-0 | -21.00 | -100.00% | -26.45 | +285 | 19.1 |
| Aug 24 | 0 | 0-0-0 | 0.00 | — | -26.45 | — | — |
| Aug 25 | 6 | 2-4-0 | -2.54 | -19.54% | -28.99 | +44 | 14.8 |
| Aug 26 | 6 | 3-3-0 | +0.01 | +0.09% | -28.98 | +136 | 13.8 |
| Aug 27 | 2 | 1-1-0 | +1.10 | +27.50% | -27.88 | +149 | 21.8 |
| Aug 28 | 13 | 9-4-0 | +15.90 | +60.00% | -11.98 | +60 | 15.3 |
| Aug 29 | 10 | 5-5-0 | +1.49 | +7.27% | -10.49 | +97 | 20.2 |
| Aug 30 | 0 | 0-0-0 | 0.00 | — | -10.49 | — | — |
| Aug 31 | 7 | 2-5-0 | -8.60 | -55.48% | -19.09 | +60 | 20.3 |
| Sep 01 | 8 | 3-5-0 | -5.20 | -30.59% | -24.29 | -94 | 21.2 |
| Sep 02 | 9 | 1-8-0 | -13.62 | -66.44% | -37.91 | -7 | 21.2 |
| Sep 03 | 6 | 2-4-0 | -4.09 | -34.08% | -42.00 | +12 | 14.6 |
| Sep 04 | 8 | 3-5-0 | -4.37 | -26.48% | -46.37 | -7 | 23.5 |
| Sep 05 | 11 | 4-7-0 | -6.95 | -28.96% | -53.32 | +5 | 19.4 |
| Sep 06 | 8 | 2-6-0 | -7.30 | -38.42% | -60.62 | +150 | 19.6 |

The drawdown begins August 19, breaks sharply on August 23, briefly recovers August 28-29, then resumes without a positive day from August 31 through the cutoff. The August 31 boundary also marks the recent MLB V1 publication run.

## 25. Worst Segments

Ranked by loss with sample discipline:

1. MLB V1: 46, 16-30, -31.25u, -31.89%.
2. 10pp+ selected edge: 80, 31-49, -30.27u, -17.70%.
3. High confidence: 40, 15-25, -28.32u, -30.45%.
4. Favorites: 40, 16-24, -26.31u, -30.77%.
5. 2.5u tier: 24, 7-17, -23.54u, -39.23%.
6. -149 to -110: 33, 12-21, -24.73u, -35.33%.
7. Soccer V1: 15, 3-12, -16.46u, -45.10%.

## 26. Best Segments

Evidence-supported positive segments are small:

- NFL V1: 10, 6-4, +7.17u.
- Retired MLB test model: 17, 10-7, +6.75u; not current and not eligible for promotion.
- +150 to +199: 15, 7-8, +6.86u.
- Low confidence: 28, 12-16, +4.75u.
- 1.5u tier: 8, 4-4, +3.35u.

None justifies scaling or a retrospective production rule.

## 27. Variance / Expected Performance

For 95 graded current decisions:

- Actual: -36.17u.
- Model-implied expected value: +87.00u.
- Model-implied standard deviation: 26.82u.
- Miss versus model expectation: **-4.593σ**, highly inconsistent with stated probabilities.
- Market-implied expected value: +3.88u.
- Market-implied standard deviation: 26.22u.
- Miss versus market expectation: **-1.528σ**, unpleasant but plausible.

The contrast is the finding: the realized drawdown is not implausible under market probabilities; it is implausible only because TBM claims much stronger probabilities. This flags calibration/forecast failure rather than exonerating the system as variance.

## 28. Forecast Health by Sport

| Sport | Flag | Basis |
|---|---|---|
| MLB | **SEVERELY DEGRADED** | n=136; Brier worse than market, AUC 0.487, severe upper-bucket overconfidence, selected V1 16-30 |
| Soccer | **DEGRADED** | model Brier worse than market, selected 3-12, three-way probability semantics limit calibration legitimacy |
| WNBA | **DEGRADED** | Brier materially worse than market and AUC 0.472; n=13 requires caution |
| NFL | **INSUFFICIENT EVIDENCE** | directionally positive Brier/AUC and 6-4 selection, but only 15 forecasts |
| NCAAF | **INSUFFICIENT EVIDENCE** | no valid recent actionable grades |
| NBA | **INSUFFICIENT EVIDENCE** | no valid recent actionable grades |
| NHL | **INSUFFICIENT EVIDENCE** | no valid recent actionable grades |
| UFC | **INSUFFICIENT EVIDENCE** | no valid recent actionable grades |

## 29. Bet-Selection Health by Sport

| Sport | Flag | Basis |
|---|---|---|
| MLB | **SEVERELY DEGRADED** | V1 -31.25u; Strong Buy/High/10pp+/2.5u tiers fail monotonicity |
| Soccer | **SEVERELY DEGRADED** | 3-12, -16.46u; most current selections were non-public because cap order had already consumed capacity |
| WNBA | **DEGRADED** | 2-5, higher claimed edge did not protect results; small sample |
| NFL | **INSUFFICIENT EVIDENCE** | 6-4 positive but n=10 |
| NCAAF/NBA/NHL/UFC | **INSUFFICIENT EVIDENCE** | no current actionable sample |

## 30. Failure Attribution

- Sports forecast quality: materially causal, especially MLB.
- Calibration: materially causal; Strong Buy and High confidence are sharply overconfident.
- Market/edge calculation: arithmetic appears internally consistent, but edge magnitude is not predictive.
- Bet selection: materially causal; selected cohorts are worse than Neutral and monotonicity fails.
- Publication logic: degraded; non-public rows contaminate Results and cap order excludes stronger later rows.
- Unit sizing: materially amplifies loss by 21.72u versus flat staking.
- Data freshness: not proven causal; provider-origin freshness is unauditable.
- Market timing: no monotonic failure; small 30-60m segment is poor.
- Sport mix: MLB and Soccer dominate gross losses.
- Variance: contributes but cannot explain the gap to claimed probabilities.
- Data/grading errors: material to 30/60-day history, not to current 14-day attribution.

No defensible numeric percentage allocation is available because forecast, selection, and stake size are dependent.

## 31. Immediate Risk Assessment

**HIGH RISK.** This is based on clean current-window grades, MLB forecast underperformance versus market, reversed edge/confidence/stake monotonicity, a 4.59σ miss versus stated probabilities, and a seven-day 17-40, -50.13u Results-API-style run. Current MLB V1 and Soccer moneyline decisions are the clearest risks. This report does not disable or change them.

## 32. Relationship to MLB/NCAAF V4

The finding strengthens the need for a validated MLB replacement/challenger but **does not support promoting MLB V4**: #237 remains blocked/research-only and has no approved artifact/executor. Future MLB work should emphasize prospective out-of-sample calibration, market Brier/log-loss comparison, selected-side probability semantics, and publication/stake monotonicity.

Nothing in this audit strengthens the case for NCAAF V4 promotion. NCAAF has no valid recent actionable cohort, and V4 remains unapproved.

## 33. Limitations

- Production history begins July 20, so 60-day and season-to-date are the same partial season.
- Exact prediction-to-odds and prediction-to-close foreign keys do not exist.
- Current stored CLV cannot be independently reproduced; historical CLV is corrupted.
- Soccer is a three-outcome sport while generic selected-side probability fields can be ambiguous.
- Cap exclusions are reconstructed, not explicitly reason-coded.
- Confidence is categorical, not a calibrated probability; no fake numeric average is reported.
- Calibration slope/intercept and formal sport-level significance were not estimated on small/mixed samples.
- All hypothetical corrections and flat-unit calculations are retrospective diagnostics only; no production rule was optimized or changed.

## 34. Tests / Validation

| Command | Result |
|---|---|
| `pnpm --filter @workspace/api-server run typecheck` | PASS |
| `pnpm exec tsc -p lib/db/tsconfig.json --noEmit` | PASS |
| `pnpm --filter @workspace/api-server exec vitest run src/routes/results.test.ts src/services/officialRecordPolicy.test.ts src/services/publicationEligibility.test.ts src/services/recommendationPublicationAudit.test.ts src/services/modelRegistryReconciliation.test.ts` | PASS, 5 files / 28 tests |
| `pnpm --filter @workspace/api-server exec vitest run src/services/snapshot.test.ts src/services/forecastReviews.test.ts src/services/mlbPointInTime.test.ts` | PASS, 3 files / 21 tests |

Independent SQL integrity checks also passed duplicate, payout, timing, and leakage assertions. No production mutation was executed.

Checksums over deterministic pipe-delimited ledger rows:

- Full 2,447-row publication ledger SHA-256: `884428ff12ab4664bcf2efb2eab6fd16340eb81d6ea03d17a57cd797e535c252`
- Current 98-row effective actionable cohort SHA-256: `62bc948a493d9470b2ea81c243b985ef359acc6dbc4a92b8c33fd75848f2f8b5`

## 35. Final Classification

**D — BOTH FORECAST AND BET-SELECTION LAYERS DEGRADED**

## 36. Next Recommended Action

**Authorize one separate fail-closed bet-selection/publication remediation task first, making the official record honor public/performance eligibility and preventing cap order plus variable staking from amplifying unvalidated forecast claims before any forecast retraining or V4 promotion.**
