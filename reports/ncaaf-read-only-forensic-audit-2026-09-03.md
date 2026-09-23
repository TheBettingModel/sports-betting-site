# NCAA Football Read-Only Forensic Audit — 2026-09-03

## 1. Scope
This audit traces production NCAA Football (`NCAAF`) data from provider capture through immutable evidence, feature construction, model prediction, publication, grading, and promotion. It is strictly read-only: no database rows, model configuration, publication state, grading record, result, or subscriber response was changed.

## 2. Executive finding
The current NCAAF challenger and promotion path is correctly fail-closed: all 528 current feature snapshots are blocked and both recorded promotion decisions are rejected.

Production also contains a separate legacy incident:

- 99 NCAAF predictions were created on July 20, 2026.
- All 99 predictions were `Neutral`.
- All 99 were nevertheless inserted into `published_picks` with 1 unit.
- All 99 are private (`is_public=false`) but effective (`is_effective=true`).
- All 99 seeded `pick_results`.
- Eight have been graded: 6 wins and 2 losses, totaling +3.01 recorded units.
- Ninety-one remain pending.

Subscriber exposure was prevented, but these rows can contaminate internal Results, ROI, and learning because private Neutral decisions were normalized into real 1-unit wagers.

## 3. Production data inventory

| Record family | Count | Finding |
|---|---:|---|
| Canonical NCAAF games | 99 | Aug. 29 through Sept. 7 slate |
| Immutable model predictions | 99 | All created July 20 |
| Legacy published-pick rows | 99 | Private but effective, all 1 unit |
| Linked pick-result rows | 99 | 8 settled, 91 pending |
| NCAAF feature snapshots | 528 | All blocked |
| NCAAF market-price evaluations | 2,706 | 902 each for moneyline, spread, total; all blocked |
| NCAAF evaluations | 0 | No eligible graded challenger evaluations |
| Walk-forward runs | 1 | Inconclusive |
| Promotion decisions | 2 | Both rejected |
| Game-evidence rows | 1,100 | Append-only captures |
| Market-observation rows | 1,182,205 | 705,796 matched; 476,409 unmatched |

## 4. Legacy prediction identity
All 99 legacy predictions use model version ID 21:

- Model ID: `tbm-ncaaf-moneyline-v1`
- Registry status: `production`
- Market: `moneyline`
- Prediction cohort flag: official (`is_challenger=false`)
- Recommendation: `Neutral`
- Units: 1 per prediction

The registry row has no training, validation, test, or approval timestamps populated.

## 5. Legacy publication timing
All 99 predictions and published-pick rows were created in a roughly four-second batch on July 20, 2026. Their game dates span August 29 through September 7.

The prediction timestamps and data-cutoff timestamps are identical. All were before kickoff, but temporal ordering alone does not establish evidence quality.

## 6. Legacy feature payload quality
The July 20 prediction payloads predate the current NCAAF feature schema. They contain basic schedule/display fields such as:

- Team abbreviations
- `0-0` records
- Vegas spread and total
- Home and away odds
- Game date

They do not contain:

- Current NCAAF feature schema version
- Independent team evidence sufficiency
- Feature forecast status
- Evidence provenance
- Missing-reason ledger
- Point-in-time evidence links

Therefore these rows cannot be treated as validated challenger evidence.

## 7. Why Neutral became a 1-unit record
The publication writer normalizes any nonpositive projected stake to 1 unit:

`proj.units > 0 ? proj.units : 1.0`

If a Neutral prediction reaches that writer, it is private rather than subscriber-visible, but it still receives a real stake and a pending result row. The current eligibility gate prevents blocked NCAAF challenger decisions from reaching that path; the July 20 batch was created before that current evidence-gated behavior was active.

## 8. Public exposure assessment
All 99 legacy rows have:

- `is_public=false`
- `is_effective=true`
- `recommendation=Neutral`
- `units=1`

No evidence in this audit shows these rows were exposed as subscriber Buy or Strong Buy recommendations. The defect is internal accounting/publication-state contamination, not public recommendation leakage.

## 9. Grading exposure
All 99 legacy publication rows have linked result rows:

| Result | Rows | Recorded units |
|---|---:|---:|
| Win | 6 | +5.01 |
| Loss | 2 | -2.00 |
| Pending | 91 | 0 |
| Total settled | 8 | +3.01 |

These records should not be interpreted as proof of model quality because the source recommendations were Neutral, the payload lacked current evidence provenance, and the one-unit wager was a normalization artifact.

## 10. Results, ROI, and learning risk
Because the rows are effective and linked to `pick_results`, any internal aggregation that does not explicitly exclude private Neutral legacy records can count them in:

- Win/loss records
- Units and ROI
- Sport-level performance
- Grading dashboards
- Learning/review pipelines

This audit did not mutate or exclude those rows.

## 11. Current canonical game state
The mutable `games` table has 99 NCAAF games:

- 8 final
- 91 upcoming

Mutable game ratings currently differ from the July 20 immutable predictions for some future dates. That is expected from later refreshes, but mutable ratings cannot be used to rewrite or reinterpret the original decision.

## 12. Current challenger architecture
The current `ncaaf-market-free-v1` feature pipeline is separate from the July 20 legacy predictions. It creates immutable feature snapshots from point-in-time evidence and never treats sportsbook prices as model inputs.

## 13. Current feature readiness
There are 528 `ncaaf-market-free-v1` feature snapshots:

- Ready: 0
- Blocked: 528
- Missing forecast status: 0

The observed block reasons are:

- `insufficient_home_independent_evidence`
- `insufficient_away_independent_evidence`

Forecast probability, projected margin, and projected total remain unavailable rather than being fabricated.

## 14. Current market decisions
The challenger market-pricing ledger contains:

- 902 blocked moneyline rows
- 902 blocked spread rows
- 902 blocked total rows
- 0 ready rows

The canonical decision-market table has no rows, consistent with no eligible actionable challenger decisions.

## 15. Current evaluation status
The NCAAF evaluation ledger contains zero rows. No valid out-of-sample ROI, CLV, Brier score, log loss, calibration, drawdown, or stability result exists yet.

## 16. Walk-forward status
One walk-forward run exists and is `inconclusive`. It is not evidence for promotion.

## 17. Promotion status
Both promotion decisions are rejected. The latest rejection cites:

- Insufficient evaluation seasons
- Required moneyline market unavailable
- Required spread market unavailable
- Minimum sample metric missing
- Calibration metric missing
- Brier score missing
- Log loss missing
- ROI missing
- CLV missing
- Maximum drawdown missing
- Season stability missing
- Week stability missing
- Coverage metric missing

No promotion gate passed by substituting a default value.

## 18. Evidence-run health
The production evidence ledger has 216 runs:

| Status | Runs |
|---|---:|
| Completed | 29 |
| Partial | 142 |
| Failed | 8 |
| Running | 37 |

The large partial/running population is an operational-quality concern. Repeated ESPN date fetch timeouts are recorded explicitly instead of being silently treated as complete evidence.

## 19. Current-day evidence health
For September 3 UTC at audit time:

- Completed: 7
- Partial: 14
- Failed: 1
- Running: 5

Recent completed runs captured hundreds of future schedule games and thousands of market observations. This is broad provider-response capture, not a count of unique actionable decisions.

## 20. Market matching quality
Production contains 1,182,205 market-observation rows:

- Matched to a game: 705,796 (59.7%)
- Unmatched: 476,409 (40.3%)

The unmatched proportion is high and prevents those observations from becoming valid event-specific evaluation evidence. The rows are preserved as unavailable for matching rather than force-linked.

## 21. Evidence-time integrity
All 1,100 game-evidence rows have a persisted kickoff.

Thirty-five rows were captured/modelled at or after kickoff. Their existence is not itself a violation because the ledger is append-only and can capture live/final provider state. They must never be returned for a pre-kickoff decision cutoff. The current as-of readers enforce:

- Caller cutoff strictly before persisted kickoff
- `captured_at <= cutoff`
- `modeled_as_of <= cutoff`
- Correct season boundary

No post-kickoff row was used to claim historical pregame availability in this audit.

## 22. Historical-market limitation
The configured Odds API path supplies current markets only. Historical capture explicitly records historical market evidence as unavailable instead of attaching today's market or inventing a zero line.

## 23. Missing independent evidence
The ESPN scoreboard feed does not supply the independent team evidence needed for a promotable model:

- Offensive efficiency
- Defensive efficiency
- Special teams
- Pace
- Historical roster state
- Historical player availability/injuries
- Starter probability
- Supported drive/play-level total evidence

The current system preserves these as missing reasons.

## 24. Point-in-time safety conclusion
The current feature/evaluation path is point-in-time safe by design and fails closed. The July 20 legacy prediction batch is temporally pregame but not eligible for current validation because it lacks the current immutable evidence contract.

## 25. Publication-safety conclusion
Current subscriber-facing NCAAF logic is conservative:

- Raw/current NCAAF recommendations are forced to Neutral.
- Blocked feature snapshots cannot create new prediction snapshots.
- Promotion remains disabled.
- Market decisions remain blocked.

The unresolved issue is historical internal contamination from the 99 legacy effective publication/result rows.

## 26. Severity assessment

### High: internal performance contamination
Eight invalidly staked Neutral rows are already graded and 91 remain pending. They can distort Results/ROI and possibly learning if consumers rely on effectiveness without also requiring an actionable recommendation and valid evidence provenance.

### Medium: evidence-capture operational health
Most evidence runs are partial, many remain running, and 40.3% of market observations are unmatched.

### Correct safety behavior
No current challenger feature is ready, no evaluation exists, both promotion decisions are rejected, and no legacy row was public.

## 27. Read-only remediation recommendation
Any remediation must be separately authorized and should preserve every original record. The safest path is:

1. Classify the 99 July 20 rows as one immutable legacy-invalid cohort.
2. Prevent the 91 pending rows from entering future grading without deleting them.
3. Exclude all 99 from Results, ROI, learning, and promotion metrics through an auditable policy/effectiveness revision.
4. Preserve the eight existing grades as historical facts while excluding them from model-performance calculations.
5. Add an invariant preventing Neutral or zero-unit predictions from being normalized into wagered publication rows.
6. Reconcile stranded evidence runs and reduce unmatched market capture before relying on coverage metrics.

No remediation was performed by this audit.

## 28. Promotion recommendation
Do not promote NCAAF. There are:

- Zero ready feature snapshots
- Zero valid evaluations
- One inconclusive walk-forward run
- Two explicit promotion rejections
- Missing independent team evidence
- Missing required historical market evidence
- A legacy publication/result cohort that must be isolated from evaluation

## 29. Model-development recommendation
Do not begin an NCAA Football production model revision from the legacy 99-row cohort. Continue live-forward immutable evidence collection, improve identity-safe market matching, obtain genuinely independent team evidence, and require season/week out-of-sample gates before a separate promotion review.

## 30. Audit guarantee
This report was created from read-only production queries and source inspection. It made no database writes, no code-path changes, no model changes, no public-display changes, and no deployment changes.