# Task #234 — Guarded Serving Runtime Verification

## 1. Executive summary
**B — GUARDED SERVING RUNWAY PARTIAL.** The incumbent-safe guarded-serving boundary is implemented and defaults remain safe, but no authentic typed MLB or NCAAF candidate executor is registered. No candidate was approved or promoted.

## 2. Scope and evidence basis
This report records the current implementation, audits, targeted verification, and independent architect conclusion. Unavailable evidence is marked unavailable rather than inferred.

## 3. Configured safe defaults
Shared operational modes are explicitly pinned to `MLB_MODEL_MODE=v1` and `NCAAF_MODEL_MODE=legacy`. No secret environment values are recorded.

## 4. MLB incumbent identity
MLB incumbent engine: `tbm-mlb-moneyline-v1`.

## 5. MLB candidate identity
MLB candidate: `tbm-mlb-moneyline-v4`, with `model-input-v4` as its authoritative input contract.

## 6. MLB approval and market status
No MLB candidate is approved or promoted. Approved markets are empty; approval-ledger count is 0.

## 7. MLB guarded resolver
The authoritative resolver evaluates mode, exact identity/approval, market, input and safety signals, runtime health, and publication eligibility, returning a machine-readable reason.

## 8. MLB fallback and truthfulness
Under a guarded MLB request that cannot serve a candidate, V1 is identified as the true engine with explicit fallback metadata; a candidate/PASS result cannot be mislabeled as V1.

## 9. MLB kill switch
`MLB_MODEL_MODE=v1` forces incumbent-primary behavior. `v4_guarded` invokes guarded evaluation and remains approval- and runtime-gated; rollback is to set `v1` and restart through normal deployment configuration.

## 10. MLB dry-run evidence
Audit `b223b677-3fdb-46ed-99c4-a65e4eceb39d`, game `823094`: `WOULD_FALLBACK`, `V4_NOT_APPROVED`, candidate input unavailable.

## 11. MLB dry-run limitation
This was not a successful authoritative `model-input-v4` inference: it traversed existing older pregame/shadow records and remains a blocker.

## 12. NCAAF incumbent identity
NCAAF incumbent engine: `tbm-ncaaf-moneyline-v1`.

## 13. NCAAF candidate identity
NCAAF candidate: `tbm-ncaaf-v4-expected-score`.

## 14. NCAAF approval and market status
No NCAAF candidate is approved or promoted. Approved markets are empty; approval-ledger count is 0.

## 15. NCAAF guarded resolver
The authoritative NCAAF resolver performs the corresponding identity, approval, market, input, completeness, safety, runtime, and publication checks with persisted/exposed reasons.

## 16. NCAAF fallback and truthfulness
Legacy fallback is explicit when a candidate cannot serve. Only `INCUMBENT`/`FALLBACK` may reach `processGameSnapshot`; `CANDIDATE`/`PASS` cannot be mislabeled as V1.

## 17. NCAAF kill switch
`NCAAF_MODEL_MODE=legacy` forces incumbent-primary behavior. `nextgen_guarded` invokes guarded evaluation but cannot bypass approval or an authentic runtime; rollback is to set `legacy` and restart normally.

## 18. NCAAF dry-run evidence
Audit `c832dc95-c152-48cf-abd1-ddc5e0490708`, game `espn:NCAAF-401858210`: `WOULD_FALLBACK`, `NEXTGEN_NOT_APPROVED`, candidate healthy board read.

## 19. NCAAF dry-run limitation
This is a board/adaptation dry-run, not a registered central production executor.

## 20. Central production boundary
The central boundary is wired in games refresh and both scheduler paths. Default modes return the unchanged incumbent projection; an authentic typed executor is required before candidate publication.

## 21. Approval contract
Exact artifact and market approval is append-only, explicit, master-admin protected, and actor-derived. Serving mode and approval are independent.

## 22. Approval governance
The evaluator never approves. Approval/promotion requires a deliberate governed action; no automatic promotion occurred.

## 23. Publication adapter
A versioned adapter translates only approved, eligible next-generation output at the production boundary without altering raw evidence semantics.

## 24. Universal pipeline compatibility
The boundary and adapter provide the universal-pipeline seam. Candidate execution remains unavailable, so a fresh authentic candidate traversal is not evidenced.

## 25. Official prediction immutability
The development guarded schema includes immutable official identity/persistence support. Official identity count is 0, and dry runs created no official identities.

## 26. Lifecycle and evidence separation
Official prediction lifecycle/persistence is separated from research and shadow evidence; no model parameters, training, picks, or history were changed.

## 27. Database schema verification
The development guarded schema has 5 append-only tables and 10 triggers. Mutation testing was blocked.

## 28. Production schema limitation
Production schema/append-only trigger installation remains a publish-time verification blocker. This report does not claim those production tables exist.

## 29. API model identity
OpenAPI was updated and generated clients regenerated. `/games/today` has additive optional `modelIdentity` from the official immutable identity, with no fabrication when absent.

## 30. Owner runtime status
Owner runtime status is derived truthfully and exposes `executorAvailable` and `resolvedServingState`.

## 31. Runtime health semantics
Approved-without-executor remains incumbent active and reports `STARTUP_BLOCKED`/`BLOCKED_BY_RUNTIME`, rather than falsely reporting candidate live.

## 32. Observability and audit behavior
Resolution and dry-run audits record disposition, engine, approval, reason, input contract, and runtime context. Dry runs created no public picks or notifications.

## 33. MLB review evaluation
The current MLB evaluator result is `BLOCK`; evidence, sample, calibration, leakage, and runtime blockers remain.

## 34. NCAAF review evaluation
The current NCAAF evaluator result is `BLOCK`; evidence, sample, calibration, leakage, and runtime blockers remain.

## 35. Future NFL policy reuse
Sport-specific review policies are reusable for future NFL; this does not establish an NFL candidate executor or approval.

## 36. PIT and leakage safeguards
PIT and leakage are explicit resolver/evaluator gates. No contrary approval claim is made from existing evidence.

## 37. Startup safety
Default startup passes. `v4_guarded` blocks for a missing exact MLB registry record; `nextgen_guarded` blocks after schema verification because no authentic executor exists.

## 38. Fallback and guarded-mode tests
Focused tests cover guarded approval/fallback selection, eligible isolated fixtures, kill switches, and truthful engine handling; real approval was not altered.

## 39. Test results
API: 85 files / 543 tests passed. Focused: 2 files / 16 tests passed.

## 40. Typecheck and build results
API/admin/mobile/DB targeted typechecks passed; API and admin builds passed. Workspace-wide typecheck remains failed only by pre-existing unrelated mockup-sandbox errors in `PickFirst.tsx`, `calendar.tsx`, and `spinner.tsx`; it was not fixed here.

## 41. Security and repository boundary
Signing credential scan and git diff check passed. The prohibited historical Git ref was untouched.

## 42. Deployment and workflow state
API/admin workflows are running cleanly. Production was not changed or redeployed; existing production incumbents remain unchanged.

## 43. Task235 prerequisites
Task235 requires authentic exact executors; authoritative MLB `model-input-v4` fresh inference; an NCAAF exact production adapter/`model_prediction` bridge; managed publish schema/triggers; successful real-slate dry runs; and independent approval.

## 44. Remaining limitations
A is impossible: no authentic typed MLB/NCAAF candidate executor is registered, all nextgen modes fail startup by design, no fresh authoritative MLB V4 inference ran, and production publish-schema verification is outstanding.

## 45. Overall classification
**B — GUARDED SERVING RUNWAY PARTIAL.** Independent architect conclusion: no release-blocking bug remains for incumbent-safe defaults, while the explicit Task235 prerequisites block next-generation approval/cutover.