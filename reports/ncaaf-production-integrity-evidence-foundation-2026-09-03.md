# NCAAF Production Integrity & Evidence Foundation

## 1. Scope
Implemented the production-integrity and evidence foundation requested in #220.

## 2. Date
September 3, 2026.

## 3. Executive conclusion
NCAAF remains research-only and is not ready for V4 modeling or promotion.

## 4. Production recheck
A final read-only production check still found exactly 99 NCAAF published-pick rows.

## 5. Legacy cohort identity
The quarantine targets the immutable NCAAF v1 Neutral/private/effective/one-unit cohort associated with the legacy NCAAF moneyline model.

## 6. Source preservation
No legacy prediction, published pick, or result is deleted or rewritten.

## 7. Append-only classification
An append-only performance-classification ledger records historical ineligibility.

## 8. Classification
The cohort is classified `LEGACY_INVALID_NON_ACTIONABLE`.

## 9. Reason
The reason is `NEUTRAL_NORMALIZED_TO_WAGER`.

## 10. Official record effect
Classified rows are excluded from official performance consumers.

## 11. Historical grades
Existing grades remain preserved as immutable historical facts.

## 12. Pending rows
Pending classified rows are excluded from future grading.

## 13. Results
Official Results aggregation excludes classified ineligible picks.

## 14. ROI
Official ROI and unit totals exclude classified ineligible picks.

## 15. Calibration
Performance-metric calibration inputs exclude classified ineligible picks.

## 16. Learning
The learning review pipeline excludes classified ineligible picks.

## 17. Validation
Legacy published-pick results do not become valid NCAAF challenger evaluation evidence.

## 18. Promotion
The invalid cohort cannot satisfy NCAAF promotion gates.

## 19. Public performance
The invalid cohort is not counted in official public performance.

## 20. Publication invariant
Only `Buy` and `Strong Buy` recommendations with finite positive units may create a published wager.

## 21. Neutral invariant
Neutral recommendations cannot create published wagers.

## 22. Zero-unit invariant
Zero-unit recommendations cannot create published wagers.

## 23. Negative-unit invariant
Negative-unit recommendations cannot create published wagers.

## 24. Invalid-number invariant
Non-finite unit values cannot create published wagers.

## 25. Blocked decisions
Blocked decisions remain non-publishable through the existing fail-closed eligibility boundary.

## 26. Approval boundary
Existing exact-market approval gates remain unchanged and fail closed.

## 27. Research-only boundary
Research-only paths retain immutable research evidence without creating official wagers.

## 28. Shadow boundary
Shadow model paths remain isolated from production publication.

## 29. Revision writers
Material-pregame and MLB policy revision publication paths use the same actionable-publication invariant.

## 30. Valid wagers
Positive-unit actionable Buy and Strong Buy records remain publishable when all existing gates pass.

## 31. Run single-flight
NCAAF evidence capture now has a process-wide keyed single-flight guard.

## 32. Scheduler overlap
Both scheduler capture callers share the ledger-level single-flight protection.

## 33. Exception safety
Capture exceptions finalize the evidence run instead of silently leaving it running.

## 34. Stale threshold
Running evidence runs older than 30 minutes are eligible for stale reconciliation.

## 35. Active-run safety
Recent running rows are not relabeled stale.

## 36. Reconciliation history
Stale reconciliation preserves prior details and appends status history.

## 37. Structured reasons
Partial and failed runs now record structured reason details.

## 38. Production run status
The final read-only recheck found 217 evidence runs: 37 running and 142 partial.

## 39. Operational interpretation
The existing production run population confirms that run reconciliation and structured diagnostics are necessary.

## 40. Market preservation
Unmatched and ambiguous market observations remain in the ledger.

## 41. No fuzzy linking
The matcher does not force-link ambiguous teams or events.

## 42. Exact matching
Ordered normalized home/away identity plus a plausible kickoff can match an event.

## 43. Alias matching
Only explicit one-to-one provider aliases are accepted.

## 44. Kickoff tolerance
Identity matches also require kickoff times within a bounded six-hour window.

## 45. Ambiguity handling
Multiple plausible candidates remain unmatched with an explicit ambiguity status.

## 46. Unmatched reasons
Market rows now record machine-readable identity status and reason.

## 47. Sports evidence separation
Admin reporting presents sports evidence coverage independently from market evidence.

## 48. Market evidence separation
Market match coverage is comparison evidence and does not become an independent sports feature.

## 49. PIT contract
Pregame readers continue enforcing a strict before-kickoff cutoff.

## 50. Post-kickoff handling
Post-kickoff evidence cannot be presented as pregame evidence.

## 51. FINAL_PREGAME
The current NCAAF schema does not persist explicit `FINAL_PREGAME` cohort membership; observability reports this as unsupported rather than inventing data.

## 52. LIVE_SHADOW
The current NCAAF schema does not persist explicit prospective `LIVE_SHADOW` membership; this remains an explicit launch blocker.

## 53. Admin endpoint
Authenticated Admin users can read `/api/admin/ncaaf-readiness`.

## 54. Admin contents
The endpoint reports legacy quarantine, feature readiness, run health, sports coverage, market matching, PIT, validation, and promotion state.

## 55. Admin UI
The Models page now includes a read-only NCAAF Readiness panel with explicit blockers.

## 56. API contract
The Admin readiness endpoint and response schemas are documented in the OpenAPI specification.

## 57. Verification
All 319 API tests passed across 46 files. API and Admin typechecks passed. API and Admin production builds passed. `git diff --check` passed.

## 58. Final readiness decision
`readyForV4` is hard-coded false in observability. No NCAAF V4 model, weight tuning, promotion, or other-sport model change was made.