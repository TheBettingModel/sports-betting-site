# MLB Point-in-Time Baseball Intelligence Dataset

1. **Executive summary:** additive research infrastructure; no V3, V4, V4.1, publication, ROI, grading, or mobile behavior changed.
2. **Architecture added:** raw evidence → immutable canonical revision → forecast linkage → independent evaluation → research evidence.
3. **Database schema changes:** `mlb_*` PIT tables exported through Drizzle.
4. **Migration details:** publish-managed schema source only; no startup DDL or historical overwrite.
5. **Raw provider snapshot strategy:** SHA-256 canonical-payload dedupe, source timestamps, and explicit provider failure state.
6. **Canonical MLB feature contract:** game identity, cutoff, schema version, quality, provenance and content hash.
7. **Feature quality states:** VALID, PARTIAL, STALE, MISSING, UNAVAILABLE, NOT_SUPPORTED, NOT_APPLICABLE, INVALID, PROJECTED, CONFIRMED.
8. **League run-environment ledger:** each new V4 shadow capture materializes season-to-date and rolling 7/14/30-day environments using only games completed before the target cutoff.
9. **Team offense snapshots:** canonical feature document captures available PIT team inputs.
10. **Starter pregame snapshots:** typed snapshot table supports PIT metrics/projections.
11. **Starter postgame outcomes:** the completed-game research hook resolves one unambiguous MLB Stats `gamePk`, retains the boxscore, and records starter outcomes separately from pregame evidence.
12. **Starter residuals:** null when either observed/projection value is absent.
13. **Lineup snapshot/revision system:** immutable typed revision rows support projected through confirmed states.
14. **Hitter-level schema:** lineup player document supports present/future metrics without fabricated Statcast fields.
15. **Bullpen pregame snapshots:** typed workload and reliever document support.
16. **Bullpen outcomes:** the same authoritative boxscore records reliever aggregates separately, excluding the first listed pitcher (the starter).
17. **Bullpen residuals:** retained only in outcome evidence.
18. **Park snapshots:** context table stores source/fallback separation.
19. **Weather snapshots:** context table retains weather revisions and quality.
20. **Rest/travel/context capture:** context document is research-only.
21. **Market history:** per-book append-only MLB market snapshots.
22. **Closing-market capture:** immutable decision markets are retained; evaluation accepts only later, available, non-stale, two-sided snapshots captured before first pitch. Until an independent later snapshot is present, CLV is explicitly unavailable rather than treating the decision quote as the close.
23. **V4 forecast linkage:** new V4 shadow rows attempt nonfatal immutable evidence linkage.
24. **Postgame run residuals:** independent evaluator writes actual-minus-projected residuals.
25. **Probability evaluation:** Brier/log loss/probability error stored outside production.
26. **Brier Skill implementation:** helper uses PIT market only when supplied; no closing leakage.
27. **Learning evidence records:** evaluator appends `RESEARCH_ONLY` evidence only.
28. **Component-level evaluation architecture:** forecast contribution tree is linked for later analysis.
29. **Final pregame freeze behavior:** the final 45-minute V4 refresh window creates one immutable `FINAL_PREGAME` revision; attempts at or after first pitch are rejected and existing freezes are never overwritten.
30. **OOS cohort architecture:** immutable cohort table supports DEVELOPMENT, VALIDATION, UNTOUCHED_OOS, LIVE_SHADOW.
31. **Feature status registry:** schema and machine-readable report included.
32. **Admin/research observability:** admin-only `/api/admin/mlb-pit-completeness`.
33. **Provider failure behavior:** PIT linkage is bounded/nonfatal; no values are invented.
34. **Idempotency strategy:** payload/input hashes and unique identities use conflict-do-nothing.
35. **Database/performance strategy:** indexed game/cutoff/cohort lookups; bounded final-game evaluation.
36. **Security review:** endpoint is behind existing admin master/session authentication.
37. **Tests added:** PIT timestamps, stable hashes, missing-value preservation, future-game exclusion, closing cutoff/staleness, and starter-versus-reliever parsing.
38. **Typecheck/build/test results:** API typecheck passed; API production build passed; full API suite passed 295 tests across 40 files. Workspace-wide typecheck remains blocked only by pre-existing Admin UI typing errors in `button-group.tsx` and `calendar.tsx`.
39. **Migration/deployment requirements:** the additive schema was applied successfully to the development database with the normal Drizzle push. Production receives it only through Replit Publish; there is no startup or deploy-hook DDL.
40. **Exact V3 before/after configuration comparison:** unchanged; no V3 source touched.
41. **Exact V4 before/after configuration comparison:** formula/config unchanged; additive writer only.
42. **Exact V4.1 before/after comparison:** unchanged; no V4.1 source touched.
43. **Confirmation no public MLB behavior changed:** confirmed: only shadow evidence and protected admin aggregates.
44. **Current data-completeness percentages:** no historical values were fabricated or backfilled. The protected admin endpoint reports live per-field percentages as new shadow forecasts arrive; an empty post-migration ledger correctly reports zero observations rather than 100% missing-as-zero features.
45. **Number of new untouched OOS games currently available:** 0 until explicit immutable assignment.
46. **Recommended next MLB task:** **B — DATA FOUNDATION COMPLETE — ACCUMULATE MORE LIVE OOS EVIDENCE WHILE ADVANCED DATA WORK BEGINS.** The collection, freeze, outcome, evaluation, cohort and observability paths are installed; meaningful conclusions require new live OOS volume and independent closing observations.