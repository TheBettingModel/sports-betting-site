# TASK #238A — TBM FAIL-CLOSED BET-SELECTION, PUBLICATION & STAKING SAFETY REMEDIATION

## 1. Executive Summary

- Classification: See Section 31.
- Forecasts changed: NO
- Production mutated: NO
- Deployment performed: NO
- Push performed: NO
- Official-record policy fixed: YES
- Global ranking fixed: YES
- Processing-order invariant: YES
- Fail-closed staking implemented: YES
- POTD eligibility fixed: YES
- V4 promotion occurred: NO

The development implementation now separates immutable model opinion from publication eligibility, globally ranks the complete Eastern game-day slate, applies the six-pick cap after ranking, assigns flat approved stakes, selects POTD only from the final public set, and feeds subscriber/Results surfaces from persisted public decisions. Development schema changes were applied only to the development database.

## 2. Files Inspected

The review covered the authoritative task specification; the Task #237P Markdown/JSON autopsy; prediction, game, model-version, published-pick, pick-result, performance-classification, market-approval, and guarded-serving schemas; scheduler/manual refresh flows; snapshot and revision writers; Results, model-stats, games, free-pick, admin, and analytics consumers; OpenAPI/codegen outputs; model registry and exact-approval helpers; and the focused/full API tests.

## 3. Files Changed

- `artifacts/api-server/src/services/downstreamPublicationPolicy.ts` — pure eligibility, selected-side edge, ranking, cap, staking, and POTD policy.
- `artifacts/api-server/src/services/downstreamPublicationPolicy.test.ts` — deterministic policy, order, cap, boundary, staking, and rank tests.
- `artifacts/api-server/src/services/snapshot.ts` — atomic full-slate publication persistence, exact approval revalidation, supersession, targeted grading cleanup, and append-only audit writes.
- `artifacts/api-server/src/services/scheduler.ts` — one post-ingestion slate publication pass and fail-closed Eastern-day notification query.
- `artifacts/api-server/src/routes/games.ts` — one manual-refresh slate boundary and persisted public-decision gating for moneyline/spread subscriber output.
- `artifacts/api-server/src/services/materialPregameRevisions.ts` — revision snapshots route back through the canonical slate publisher; withdrawals supersede stale public decisions.
- `artifacts/api-server/src/services/mlbPolicyRevisions.ts` — policy revisions no longer self-promote or inherit public/POTD state.
- `artifacts/api-server/src/services/revisionPublicationSafety.ts` — shared fail-closed revision withdrawal/supersession safety.
- `artifacts/api-server/src/services/subscriberPublicationSafety.ts` — exact persisted-decision predicate for subscriber exposure.
- `artifacts/api-server/src/services/subscriberPublicationSafety.test.ts` — private, cap-excluded, wrong-side, and non-1u leakage tests.
- `artifacts/api-server/src/services/freePick.ts` — official production, performance-eligible, public, published, approved-1u free-pick gate.
- `artifacts/api-server/src/services/freePick.test.ts` — free-pick safety fixture updates.
- `artifacts/api-server/src/services/officialRecordPolicy.ts` — canonical official-public settled cohort predicates.
- `artifacts/api-server/src/services/officialRecordPolicy.test.ts` — recommendation, settlement, legacy-null official, and challenger exclusions.
- `artifacts/api-server/src/routes/results.ts` — Results summary/ROI use the canonical official cohort.
- `artifacts/api-server/src/routes/results.test.ts` — private, ineligible, shadow/challenger, retired, superseded, pending, and preseason coverage.
- `artifacts/api-server/src/routes/model-stats.ts` — public model stats/history use the same official cohort.
- `artifacts/api-server/src/services/analytics.ts` — performance-metric input defaults to the same official cohort.
- `artifacts/api-server/src/routes/admin.ts` — read-only candidate-level publication decision observability.
- `lib/db/src/schema/published-picks.ts` — nullable current-decision audit fields and rank index.
- `lib/db/src/schema/publication-decision-history.ts` — immutable hash-chained publication-state history.
- `lib/db/src/schema/index.ts` — exports the new audit schema.
- `lib/api-spec/openapi.yaml` — publication observability and game projection contract.
- `lib/api-client-react/src/generated/api.ts` — regenerated API client operations.
- `lib/api-client-react/src/generated/api.schemas.ts` — regenerated client schemas.
- `lib/api-zod/src/generated/api.ts` — regenerated response validation.
- `lib/api-zod/src/generated/types/gameProjection.ts` — regenerated game publication fields.
- `lib/api-zod/src/generated/types/getAdminPublicationDecisions200.ts` — generated admin audit response.
- `lib/api-zod/src/generated/types/getAdminPublicationDecisions200DecisionsItem.ts` — generated decision item.
- `lib/api-zod/src/generated/types/getAdminPublicationDecisionsParams.ts` — generated date query.
- `lib/api-zod/src/generated/types/index.ts` — generated type exports.
- `reports/task-238a-downstream-policy-replay-2026-09-06.json` — immutable-input replay and dry-run evidence.
- `reports/task-238a-fail-closed-publication-remediation-2026-09-06.md` — this report.

No existing Task #237P report or historical database row was edited.

## 4. Existing Pipeline

The prior path created predictions and published inside per-game/per-sport traversal. The public cap was consumed before cross-sport comparison, variable model-requested stakes became risk, revisions could preserve or create public state outside one global boundary, and subscriber/Results consumers could read broader cohorts than the actual public ledger.

## 5. New Canonical Pipeline

`Model opinion → publication eligibility → exact model/market approval → deterministic full-slate ranking → six-pick cap → approved stake → POTD → official record`

Scheduler and manual refresh collect newly written immutable prediction IDs, then invoke one canonical publisher. Every invocation rehydrates the complete immutable Eastern game-day pool under a per-slate advisory lock, including existing effective decisions. Material and MLB policy revisions re-enter that same publisher after their own transaction commits.

## 6. Publication Decision Contract

Every evaluated candidate receives a persisted state:

- `PUBLISHED` — eligible and selected into the final public set.
- `CAP_EXCLUDED` — eligible but outside the final six.
- `SAFETY_BLOCKED` — failed one or more publication gates.

Persisted evidence includes explicit reason codes, selected-side edge, rank score, global rank, requested/approved units, stake policy/reason, decision/data/game timestamps, exact approval decision identity, public/POTD flags, and an append-only hash-chained history. Private decisions remain effective and auditable but cannot enter grading or subscriber wager surfaces.

## 7. Official Record Policy

The canonical official record requires all of:

- effective published-pick row;
- `is_public = true`;
- Buy or Strong Buy;
- settled win/loss/push;
- non-challenger official prediction (legacy null cohort is accepted only for non-challenger historical continuity);
- production model version;
- no append-only performance-ineligible classification;
- existing NFL preseason exclusion where game date is available.

Results summary, Results ROI, public model stats/history, and performance analytics consume the same policy.

## 8. Global Candidate Pool

Pool identity is the immutable game slate date derived from `games.starts_at` in `America/New_York`, with the canonical stored game date as fallback. It is not based on provider iteration or mutable `published_at`. Incoming IDs may span dates; each distinct date is independently locked and recomputed. Started public picks are frozen capacity consumers, while unstarted candidates can displace lower-ranked prior candidates.

## 9. Ranking Policy

The policy uses existing canonical outputs only, in this exact order:

1. `finalRating` descending;
2. `podScore` descending;
3. selected-side edge descending;
4. stable candidate/prediction ID ascending.

`finalRating` remains the primary existing all-sport quality signal; `podScore` is an existing secondary pick-strength signal; selected-side edge breaks remaining quality ties; the stable ID guarantees deterministic output.

No historical ROI optimization, coefficient fitting, recent-window threshold tuning, or CLV optimization was performed.

## 10. Six-Pick Cap

The cap remains exactly six per immutable Eastern game-day slate. It is applied only after full-pool eligibility and ranking. Started public decisions retain their slots; the remaining slots are filled by global rank. Eligible overflow receives `CAP_EXCLUDED` with approved units zero and no pending result. No sport quota was added.

## 11. Processing-Order Invariance

The persistence boundary takes a per-slate transaction advisory lock and recomputes the complete slate rather than reserving capacity from one batch. The pure comparator has a stable final key. Tests cover reversed input, sport-batch reordering, sequential batch displacement, cap/POTD stability, cross-midnight slate identity, and unique ranks with started locks.

## 12. Selected-Side Edge Semantics

`selected_side_edge = selected outcome model probability − selected outcome no-vig fair probability`, stored in percentage points.

Example: 61% selected-outcome model probability minus 55% no-vig fair probability equals `+6.0`, not `0.06`. The home-perspective forecast edge stored in immutable model output remains unchanged.

## 13. Confidence Semantics

Confidence remains the existing categorical/distance-from-50 model output. It is not presented or consumed as a calibrated win probability. No confidence thresholds or semantics were changed.

## 14. Staking Safety

- `requested_units` preserves the immutable model-requested amount.
- `approved_units` is exactly `1.0` for newly approved public wagers and `0` otherwise.
- operational `published_picks.units` and `pick_results.units_risked` use the approved amount, not the requested amount.
- `stake_policy_version = fail-closed-flat-v1`.

Revision paths preserve requested units separately and cannot create a variable-stake public wager.

## 15. POTD Safety

POTD is selected only from the final eligible, exact-approved, within-cap public set. It prioritizes the existing `podScore`, then existing ranking signals and stable identity. Exactly one POTD exists when the final public set is non-empty. A started public POTD is frozen; private, blocked, cap-excluded, retired, shadow, research, and challenger candidates cannot become POTD.

## 16. Model Approval Safety

The publisher revalidates both the producing model registry status and the exact append-only market approval inside the publication transaction. Exact identity includes sport, market, model ID, evaluation version, training-dataset identity, feature-schema hash, and evidence cutoff. Missing, stale-mismatched, non-production, challenger, shadow/research, or non-approved identities fail closed.

MLB V4 and NCAAF V4 remain outside this path as production candidates.

## 17. Results / Analytics Cohorts

Subscriber-facing Results and public model-stat endpoints now answer the official-public question by default. Internal forecast/research tooling remains explicitly broader where it studies model opinions rather than wagers. Pending, void, private, cap-excluded, performance-ineligible, superseded, retired, shadow/research, challenger, and test-model rows cannot contaminate subscriber record/ROI.

## 18. Historical Integrity Handling

Historical predictions, publication rows, grades, and stakes were not rewritten. Known historical issues remain preserved for separate remediation:

- 22 Soccer draws stored as pushes;
- 35 invalid CLV values outside ±50;
- 543 effective rows attributed to retired test model `test-mlb-moneyline-v99-1784573270185`.

The official cohort excludes ineligible/retired contamination without deleting source history.

## 19. CLV Handling

CLV was not added to candidate publication, ranking, cap, staking, or POTD. The ranking implementation supplies no CLV signal. Existing CLV fields remain available only for audit/research and known invalid historical CLV rows were not edited.

## 20. Retired Test Model Handling

Official-record predicates join through `model_predictions` to `model_versions` and require `status = production`. The exact publisher applies the same registry requirement. Retired test-model rows remain immutable and queryable internally but are excluded from official performance and cannot become newly public.

## 21. 14-Day Deterministic Replay

**RETROSPECTIVE DIAGNOSTIC ONLY — NOT AN OPTIMIZATION OR PROFITABILITY CLAIM**

Fixed cutoff: `2026-09-06T22:04:36.749091Z`  
Window start: `2026-08-23T22:04:36.749Z`

- prior effective public selections: 68;
- corrected hypothetical public selections: 59;
- overlap: 41;
- prior-only: 27;
- corrected-only: 18;
- corrected cap exclusions: 17;
- exact-approval blocks: 0 (all replay-eligible producing identities had matching production approval);
- prior requested stake total: 143.5u;
- corrected selected candidates’ requested stake total: 131.5u;
- corrected hypothetical approved stake total: 59.0u.

Daily corrected public counts were 1, 2, 2, 2, 6, 5, 6, 6, 6, 5, 6, 6, and 6 across the represented slate dates. The replay demonstrates changed membership, ranking, cap placement, and stake behavior only. It does not claim the retrospective selection is profitable and did not fit any policy to outcomes.

Detailed IDs, selections, ranks, edges, stakes, POTD, and differences are in `reports/task-238a-downstream-policy-replay-2026-09-06.json`.

## 22. Current-Day Dry Run

**DRY RUN — NOT PUBLISHED**

Eastern date: `2026-09-06`  
As of: `2026-09-06T22:04:36.749091Z`

- candidate count: 25;
- eligible count at the cutoff: 0;
- game-start blocked count: 25;
- public top-six IDs/selections: none;
- cap-excluded count: 0;
- candidate requested stakes: 24.5u total;
- eligible requested stakes: 0u;
- approved stakes: 0u;
- POTD: none.

No write, publish, notification, or deployment was performed by this dry run.

## 23. Forecast Immutability Proof

No model coefficient, feature, calibration, recommendation threshold, probability semantic, or `model_predictions` schema was changed. Prediction `units` remain the requested model output and prediction `edge` remains its existing forecast perspective. Flat staking and selected-side edge exist only in downstream publication records. Historical production rows were accessed read-only for replay. API regression tests and source diff review confirmed the separation.

## 24. MLB V4 Status

MLB V4 remains non-production. Startup guarded-serving validation reported `mlbMode: v1`; no model promotion, approval mutation, training, recalibration, or V4 deployment occurred.

## 25. NCAAF V4 Status

NCAAF V4 remains non-production. Startup guarded-serving validation reported `ncaafMode: legacy`; no model promotion, approval mutation, training, recalibration, or V4 deployment occurred.

## 26. Schema Changes

Development-only additive schema changes:

1. Nullable current-decision fields on `published_picks`: publication status/reason/exclusion, selected-side edge, rank score/global rank, requested/approved units, stake policy/reason, decision timestamp, data cutoff, and game start, plus a publication-rank index.
2. New append-only `publication_decision_history` table: hash chain, prediction/pick IDs, immutable slate date, status/reason/rank, public/POTD state, requested/approved units, stake policy, exact approval decision ID, and timestamps, with hash/slate/prediction indexes.

`drizzle-kit push` applied these additions to the development database only. Existing data was not destructively rewritten.

## 27. Future Production Migration Required

YES.

At a future owner-approved Publish, Replit’s managed schema diff must add the nullable `published_picks` columns/index and create `publication_decision_history` with its foreign keys and indexes. The owner must review rename prompts as additions. No custom migration script, startup DDL, direct production DDL, or production backfill should be introduced.

**DO NOT EXECUTE as part of Task #238A.**

## 28. Tests

- `pnpm --filter @workspace/api-spec run codegen` — passed; generated client/Zod outputs.
- `pnpm --filter @workspace/api-server run typecheck` — passed after final changes.
- focused Vitest run over downstream policy, official record, Results, free pick, revision, subscriber safety, scheduler, and notification behavior — 8 files / 73 tests passed.
- `pnpm --filter @workspace/api-server run test` — 93 files / 597 tests passed.
- `pnpm --filter @workspace/api-server run build` — passed; API bundle built.
- `pnpm --filter @workspace/db exec tsc --build --force` — passed.
- `git diff --check` — passed.
- API workflow restart — passed; service listened on port 8080, guarded-serving validation completed, approval/effectiveness reconciliation completed, and API reported ready.

Bounded unrelated validation findings:

- OpenAPI coverage check still reports pre-existing undocumented `/support` and `/internal/mlb-v4/readiness` routes.
- Workspace-wide typecheck passed the changed API/admin packages, then stopped on pre-existing `artifacts/mockup-sandbox` TypeScript/React errors. The affected API/database checks above passed independently.

## 29. Security / Release Gate

Protected ref checked read-only:

`refs/heads/main-old-20260904-e3388ae3d3ccfd9cbf7835b7693252ce0dcdacc8`

`git show-ref --verify` reported that this ref is not present in the current workspace. Task #238A did not create, remove, update, inspect, or otherwise mutate it. No Git history rewrite, commit, push, deployment, production migration, EAS build/update, TestFlight/App Store submission, or Apple/EAS credential operation occurred.

Production release remains blocked until the owner confirms Replit remediation and independent verification passes.

## 30. Remaining Blockers

There is no identified downstream code-safety blocker in the development implementation. The production release blockers are intentionally external to this task:

- owner confirmation and independent verification of the security remediation;
- owner-reviewed inclusion of all currently uncommitted/untracked Task #238A files;
- owner-controlled Replit Publish schema diff for the additive production schema.

## 31. Final Classification

**A — DOWNSTREAM SAFETY REMEDIATION COMPLETE; READY FOR CONTROLLED RELEASE AFTER SECURITY GATE**

This does not authorize deployment or production migration.

## 32. Exactly One Recommended Next Task

**Run an independent, read-only security-gate verification that Replit’s contaminated-ref remediation is complete and produce an owner go/no-go decision for controlled release.**