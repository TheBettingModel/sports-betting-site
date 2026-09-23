# Recommendation / Publication Status Audit — 2026-09-03

## 1. Executive summary
The 22-game slate displayed 20 Neutral rows. Of those, **17 were true persisted raw Neutral recommendations** and **3 were raw Buy recommendations masked to Neutral because the exact MLB moneyline approval record was missing**. One Soccer Buy remained published and one Soccer Fade remained Fade.

## 2. Root cause
The public feed correctly fails closed by replacing a raw recommendation with Neutral when its exact model/market approval is not `PRODUCTION_APPROVED`. Admin previously counted `games.value_rating` as though every raw Strong Buy/Buy were published, so it could not explain the public result.

## 3. Complete recommendation pipeline
Provider/team inputs → model probability → market comparison → edge → persisted raw `games.value_rating` and immutable prediction → evidence/policy decision → exact market approval → publication eligibility → effective-pick override → public masking → subscriber display.

## 4. Locations where Neutral is calculated
The sports model computes the raw value tier in `services/model.ts`. MLB and NCAAF evidence inputs can require a no-bet before persistence. Policy revisions may append an effective Neutral decision. Missing/invalid evidence remains fail-closed.

## 5. Locations where Neutral is used as masking
`routes/games.ts` applies the effective published rating and then `attachMarketSelection` sets public `valueRating` and moneyline recommendation to Neutral unless the exact approval is production-approved.

## 6. Existing approval architecture
Approval identity is exact to sport, market, model version, evaluation version, dataset version, feature-schema hash, and evidence cutoff. Missing or non-production approval denies publication.

## 7. Existing evidence-gate architecture
NCAAF can remain a no-bet when independent evidence is insufficient. MLB can remain a no-bet when required pregame starter/market evidence fails. These gates were not changed.

## 8. Existing publication architecture
Immutable predictions are written for upcoming pregame events. Only approved actionable decisions are published. Effective policy revisions can supersede a prior public decision without rewriting history.

## 9. Canonical state separation implemented
Admin now exposes `rawModelRecommendation`, `publicationStatus`, `publicationBlockReason`, `publicationBlockDetails`, and `displayRecommendation` separately.

## 10. Database changes if any
None. Existing immutable game, prediction, effective-pick, model registry, and approval-ledger records were sufficient.

## 11. API changes
Added read-only `GET /api/admin/recommendation-publication-audit`. The response includes per-game raw probability, market probability, edge, confidence, approval state, publication classification, block reason, and public display. Existing Admin feed counts now use publication state rather than raw rating.

## 12. Admin changes
Overview now includes separate totals for true raw Neutral, publication-blocked, and published/publishable decisions, plus a per-game table showing raw model, publication state, block reason, and public display.

## 13. Public/subscriber behavior
Unchanged. Blocked recommendations remain masked as Neutral. No blocked raw Buy/Strong Buy is exposed through the subscriber feed.

## 14. Today's exact slate audit

| Sport | Game | Raw | Publication | Block reason | Display |
|---|---|---|---|---|---|
| MLB | SF @ PIT | Neutral | No play | — | Neutral |
| MLB | TOR @ CLE | Neutral | No play | — | Neutral |
| MLB | CHW @ HOU | Neutral | No play | — | Neutral |
| Soccer | LILL @ TOU | Fade | No play | — | Fade |
| Soccer | CEL @ RSO | Buy | Published | — | Buy |
| NCAAF | MASS @ RUTG | Neutral | No play | — | Neutral |
| NCAAF | WES @ KENN | Neutral | No play | — | Neutral |
| NCAAF | MRMK @ DEL | Neutral | No play | — | Neutral |
| NCAAF | AKR @ WAKE | Neutral | No play | — | Neutral |
| NCAAF | BCU @ UCF | Neutral | No play | — | Neutral |
| NCAAF | ALB @ BUFF | Neutral | No play | — | Neutral |
| MLB | BOS @ BAL | Neutral | No play | — | Neutral |
| MLB | MIL @ CHC | Neutral | No play | — | Neutral |
| MLB | MIA @ KC | Buy | Blocked | Exact approval missing | Neutral |
| NCAAF | EIU @ MINN | Neutral | No play | — | Neutral |
| NCAAF | UAPB @ MIZ | Neutral | No play | — | Neutral |
| NCAAF | COLO @ GT | Neutral | No play | — | Neutral |
| MLB | TB @ TEX | Neutral | No play | — | Neutral |
| NCAAF | UAB @ ILL | Neutral | No play | — | Neutral |
| NCAAF | IDHO @ UTAH | Neutral | No play | — | Neutral |
| MLB | ATH @ SEA | Buy | Blocked | Exact approval missing | Neutral |
| MLB | STL @ LAD | Buy | Blocked | Exact approval missing | Neutral |

Totals reconcile: 22 games = 17 raw Neutral + 1 raw Fade + 4 raw Buy. Publication = 18 no-play + 3 blocked + 1 published. Public display = 20 Neutral + 1 Fade + 1 Buy.

## 15. True Neutral count
**17** of the 20 displayed Neutral games were persisted raw Neutral recommendations: all 11 NCAAF games and 6 MLB games.

## 16. Publication-blocked count
**3** displayed Neutral games were non-Neutral raw model opinions: MIA @ KC, ATH @ SEA, and STL @ LAD were raw Buy.

## 17. Block reasons
All three were `EXACT_APPROVAL_MISSING`; their exact MLB moneyline approval lookup returned `UNVALIDATED`.

## 18. NCAAF audit
Current model identity resolves through the production model registry and supports moneyline. All 11 September 3 rows were persisted as raw Neutral; none was a stronger raw recommendation hidden by publication masking. The independent-evidence no-bet gate remains unchanged.

## 19. MLB audit
MLB had nine games: six raw Neutral and three raw Buy. The three Buy rows were publicly masked because their exact approval identity was missing. V3 calculations and all V4/V4.1 shadow behavior were untouched.

## 20. Soccer audit
Soccer had two games: one production-approved published Buy and one true raw Fade. Neither was incorrectly collapsed to Neutral.

## 21. #214B isolation verification
The #214B collector imports PIT/evidence tables only, never calls model code, and is not imported by the recommendation calculation. #219 changed no MLB model source/configuration. The measured raw rows prove #214B did not convert the three MLB Buy opinions; publication masking did.

## 22. Historical immutability
No historical prediction, pick, approval, grading, result, or learning row was changed. Historical records lacking enough context remain unreconstructed rather than inferred.

## 23. Tests
Full API suite passed: **314 tests in 45 files**. New coverage verifies true Neutral, blocked Buy/Strong Buy, production-approved publication, effective no-play policy decisions, public masking, and reconciled Admin counts.

## 24. API typecheck
Passed.

## 25. API production build
Passed.

## 26. Admin typecheck
Passed.

## 27. Admin production build
Passed. The existing bundle-size advisory remains non-blocking.

## 28. Exact before/after behavior
Before and after: model probability, edge, raw recommendation, confidence, units, approval gates, publication eligibility, effective picks, public display, Free Pick, Top Pick, POD, notifications, grading, Results, and ROI are identical. Only read-only Admin semantics and observability changed.

## 29. Remaining risks
The raw persisted rating already reflects model-level evidence/no-bet gates; reconstructing a hypothetical recommendation before those gates is not safe unless an immutable pre-gate value was captured. The audit therefore reports the persisted model decision and never fabricates an earlier opinion. Workspace-wide typecheck remains blocked only by pre-existing mockup-sandbox duplicate-property and React type-identity errors; API, Admin, mobile, shared libraries, and scripts pass before that isolated artifact failure.

## 30. Recommendation before beginning NCAAF V4
The recommendation/publication boundary is now explicit enough for Admin operations. Any independent NCAAF V4 work should preserve this contract and must not begin until separately authorized; no NCAAF model work was started here.