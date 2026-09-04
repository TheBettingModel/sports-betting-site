#222C FINAL

TARGETS ASSESSED:
779

MODEL-ELIGIBLE FBS-vs-FBS TARGETS:
656

OUT-OF-DOMAIN TARGETS:
123

IDENTITY-RESOLVED TARGETS:
656

IDENTITY-UNRESOLVED TARGETS:
0

ELIGIBLE V4 FEATURE INPUTS:
656

INTERNAL BASELINE D PREDICTIONS:
656

MODEL-ELIGIBLE FEATURE COVERAGE:
100.0%

AMBIGUOUS IDENTITIES ACCEPTED:
0

FUZZY IDENTITIES ACCEPTED:
0

POST-CUTOFF IDENTITY VIOLATIONS:
0

PIT VIOLATIONS:
0

MARKET LEAKAGE VIOLATIONS:
0

HISTORICAL REPLAY CHECKSUM:
7cee52d5188179d81a177aa55b9ac54e06211f11ed8a5b0d29b032ff94095abc

BASELINE D CONFIGURATION HASH:
212a6c78431a181821106721877155745724d3619ec63cf5424f098b07f9ae86

BASELINE D PARAMETER HASH:
792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81

2026 CORE FEATURE COMPATIBILITY:
PASS

V4 PROSPECTIVE EVALUATION READY:
TRUE

FULL LIVE PUBLICATION DATA READY:
FALSE

MODEL REGISTRY:
CHALLENGER / UNVALIDATED / champion FALSE / publication FALSE

CHAMPION CHANGED:
NO

PUBLICATION CHANGED:
NO

NFL CHANGED:
NO

FINAL DECISION:
B. #222C COMPLETE — CORE MODEL-ELIGIBLE BRIDGE PASS WITH DOCUMENTED OUT-OF-DOMAIN EXCLUSIONS; READY FOR #223

NEXT TASK:
#223, only when separately authorized; not started by #222C.

## 1. Executive summary

The 2026 NCAAF identity and feature bridge passes for the legitimate model-supported universe. At the fixed 2026-09-04T13:40:00Z assessment, 656 of 779 future targets were FBS-vs-FBS and all 656 produced exact chronological V4 inputs and frozen Baseline D predictions. The other 123 targets were proven outside the FBS-vs-FBS training domain. No identity remained unresolved.

## 2. Starting blocker

#222B reported 780 future targets, 531 safe inputs, and 249 exclusions. Those exclusions had ESPN IDs but lacked an explicit classification inside the snapshot payload. Treating every exclusion as an identity failure overstated the supported denominator.

## 3. 249-target forensic audit

The original 249 records were future ESPN targets with both provider team IDs present. They were not missing-ID or PIT-unavailable records. The provider mapping table contained 138 exact mapped 2026 schools and 693 unmapped CFBD-domain schools. The forensic audit therefore examined the authoritative season team ledger rather than fabricating mappings from matchup context.

## 4. Failure categories

Before correction, all 249 shared `unsafe_target_team_identity_mapping`. The exact cause was denominator ambiguity: snapshot payloads did not directly state FBS/FCS classification. No fuzzy identity failure was repaired. At final assessment the categories were 122 `OUT_OF_DOMAIN_FBS_VS_FCS`, 1 `OUT_OF_DOMAIN_OTHER`, and 0 `IDENTITY_UNRESOLVED`.

## 5. Identity architecture

The bridge uses ESPN provider team IDs, append-only CFBD team evidence, and exact ESPN-to-CFBD mapping rows. A complete CFBD FBS-universe proof is carried into the gate with season, counts, evidence timestamp, and evidence reference. Display strings do not become runtime identities.

## 6. Temporal identity semantics

The CFBD 2026 team ledger and exact mappings were captured before each accepted target cutoff. The development proof was complete by 2026-09-03T20:42:22.413Z; production was complete by 2026-09-03T21:07:23.005Z. A mapping captured at or after a target cutoff is rejected.

## 7. Mapping methods

Only deterministic exact methods are accepted: exact provider ID, exact existing ledger, exact canonical school, uniquely corroborated exact normalized school, verified aliases, or explicit manual verification. Fuzzy, conference-only, mascot-only, matchup-derived, ambiguous, and first-candidate matching remain prohibited.

## 8. Current FBS identity coverage

The provider ledger contains 138 CFBD schools classified FBS. All 138 have exact ESPN mappings; 0 are unmapped, 0 ambiguous, 0 invalid, and 0 mapped non-FBS schools contaminate the set. Current FBS deterministic identity coverage is 100.0%.

## 9. FCS/non-FBS treatment

FBS identity compatibility is separate from model eligibility. Games with a team outside the complete mapped FBS set are excluded from Baseline D because its declared training/application domain is FBS-vs-FBS. They are not forced into the model to inflate coverage.

## 10. Target-universe reconciliation

The final fixed assessment contains 779 targets: 656 `MODEL_ELIGIBLE_FBS_VS_FBS`, 122 `OUT_OF_DOMAIN_FBS_VS_FCS`, 0 `OUT_OF_DOMAIN_FCS_VS_FBS`, 1 `OUT_OF_DOMAIN_OTHER`, and 0 `IDENTITY_UNRESOLVED`. All-target prediction coverage is 84.2%; model-eligible coverage is 100.0%.

## 11. Historical checksum verification

The immutable historical rows remain 792 for 2023, 798 for 2024, and 808 for 2025: 2,398 total with 0 duplicates. The replay/split checksum remains `7cee52d5188179d81a177aa55b9ac54e06211f11ed8a5b0d29b032ff94095abc`. Production contains the same counts and checksum-bound evidence.

## 12. 2026 chronological replay

The existing chronological state machine was reused. Only completed atomic games strictly before each feature cutoff update team state. A target cannot update its own state. Season, rolling, prior-season, Elo, and opponent-adjusted state retain their original chronology.

## 13. Feature-schema equivalence

All generated inputs use `ncaaf-chronological-team-game-v2` semantics for score-derived season offense/defense, last 3, last 5, prior season, pregame Elo, opponent adjustment, home/neutral context, sample counts, missing indicators, and quality indicators. Every compatibility row passed exact semantic and chronology checks.

## 14. Internal Baseline D predictions

The bridge generated 656 internal predictions with frozen `tbm-ncaaf-v4-expected-score` Baseline D. No 2026 target was used for fitting, selection, calibration, or tuning. The expanded-ridge challenger was not used.

## 15. Prediction contract

Each in-memory prediction carries target/provider identity, CFBD teams, cutoff, model/version hashes, feature and dataset versions, expected home and away points, margin, total, win probabilities, uncertainty, quality/availability, mapping methods, and identity evidence references. Results remain non-public with no wagers or units.

## 16. Fail-closed identity tests

Tests cover missing, ambiguous, fuzzy-only, conference-only, mascot-only, multiple-candidate, and post-cutoff identity rejection; exact identity acceptance; FBS/FBS eligibility; out-of-domain exclusion; market-shaped payload rejection; and non-public prediction behavior.

## 17. Alias/rename cases

Stable provider IDs and versioned ledger evidence control identity. School display-name, abbreviation, mascot, and conference changes do not independently establish identity. No unsupported alias was invented for #222C.

## 18. Model-eligible coverage

The gate was declared before the final run: every model-eligible target must produce the exact schema; ambiguous/fuzzy/post-cutoff acceptance, PIT violations, and market leakage must all equal zero. Final eligible coverage is 656/656, or 100.0%.

## 19. PIT audit

Same-game leakage: 0. Future-game leakage: 0. Future-season leakage: 0. Post-kickoff evidence: 0. Post-cutoff identity violations: 0. Historical and 2026 replay remain fail-closed.

## 20. Market-firewall audit

Market leakage violations are 0. Odds, spreads, sportsbook totals, movement, price, book, implied probability, CLV, recommendations, wagers, and units were excluded from identity and feature construction.

## 21. Model immutability

Baseline D configuration hash remains `212a6c78431a181821106721877155745724d3619ec63cf5424f098b07f9ae86`. Parameter hash remains `792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81`. No weights, coefficients, shrinkage, calibration, cohorts, or OOS selection changed.

## 22. Registry state

NCAAF V4 remains CHALLENGER, UNVALIDATED, champion FALSE, and publication FALSE. The production champion is unchanged. No pick or prediction publication was enabled.

## 23. NFL/other sport isolation

NFL code, model, weights, calibration, feature schema, and registry were not changed. MLB and all other sports were unchanged. The implementation is NCAAF-specific.

## 24. Test/build results

The final relevant suite passed: 4 test files and 18 tests. API typecheck passed. The production build completed successfully. The public production root returned HTTP 200; `/api/health` is not implemented and correctly returned 404.

## 25. Production verification

The newly published autoscale deployment reports a successful active build and serves live requests. Read-only production reconciliation returned 779 targets, 656 model-eligible FBS-vs-FBS, and 123 out-of-domain, matching development exactly. Production identity proof is 138/138 FBS mappings, 0 unmapped FBS, and 0 mapped non-FBS. Historical production counts are 792/798/808 with no duplicates. Recent logs disclosed transient background ESPN and database-authentication timeouts during startup work; the API continued returning 200 responses and the verified ledgers were intact.

## 26. Readiness matrix

| Gate | Ready |
|---|---|
| IDENTITY_BRIDGE_READY | TRUE |
| 2026_CORE_FEATURE_COMPATIBILITY_READY | TRUE |
| HISTORICAL_REPLAY_INTACT | TRUE |
| PIT_INTEGRITY_READY | TRUE |
| MARKET_FIREWALL_READY | TRUE |
| V4_BUILD_READY | TRUE |
| V4_VALIDATION_READY | FALSE |
| V4_PROSPECTIVE_EVALUATION_READY | TRUE |
| FULL_LIVE_PUBLICATION_DATA_READY | FALSE |

## 27. Remaining limitations

V4 remains unvalidated and cannot be promoted or published. Confirmed starting quarterback, injury availability, and depth-chart state remain separate live-publication requirements. Transient provider/database timeouts should remain operationally monitored but did not invalidate #222C evidence or compatibility.

## 28. Final decision

**B. #222C COMPLETE — CORE MODEL-ELIGIBLE BRIDGE PASS WITH DOCUMENTED OUT-OF-DOMAIN EXCLUSIONS; READY FOR #223**

#223 was not started. No retraining, promotion, public picks, wagers, units, or unrelated-sport changes were made.