# TASK #240 — TBM V4 COMPLETE PLATFORM REBUILD, CLOUD MIGRATION & PRODUCTION CUTOVER

## 1. Executive Summary

- Overall classification: **C — TBM V4 PLATFORM SUBSTANTIALLY BUILT; SPECIFIC HARD RELEASE BLOCKERS REMAIN**
- New clean repository: local clean root repository prepared under `/tmp/tbm-clean-source`; remote not created.
- Replit runtime dependency removed: from source/runtime design, yes; from live production, no.
- New API: cloud-ready candidate configuration complete; not deployed.
- New scheduler: independently runnable cron entrypoint complete; not deployed.
- Database migration: additive migration authored; not applied to production.
- Frontend migrated: Vercel configuration authored; not deployed.
- Mobile compatibility: existing API preserved; environment values removed from source.
- #238A preserved: yes, with full regression passing.
- V4-only routing: canonical strict router built and tested; not yet the live subscriber router.
- Production cutover: not executed.
- Rollback available: documented application rollback; cloud/DB recovery not externally verified.

## 2. Task #239 Reconciliation

Task 239 ended B. Its v5 live foundation, frozen 14-feature v2 contract, chronological
materialization, immutable 2,012-game benchmark quarantine, and fail-closed
`NO_PROSPECTIVE_V5_PARITY_VECTOR` gate were preserved. No MLB challenger was fabricated.

## 3. Original Architecture

The live Replit API still routes MLB V1, NCAAF legacy, and generic legacy sport
formulas. Scheduling is in-process and broad CORS was enabled.

## 4. New Architecture

The candidate has a sport-neutral V4 contract, exact artifact registry, PIT and
leakage firewalls, deterministic execution check, canonical forecast envelope,
strict `NO_FORECAST`, cloud API, external cron, and additive audit schema.

## 5. Files / Packages Changed

Core additions include `v4Platform.ts`, its tests, cloud pipeline entrypoint,
Render/Vercel/CI configuration, environment manifests, migration/runbooks,
security/export scripts, traversal guard/tests, health readiness, CORS/security
headers, Soccer/CLV tests, and this report.

## 6. Clean Repository Creation

A sanitized source tree was exported, scanned, initialized with a new `main`
branch, and committed as a new root. Final local root identity is recorded in
the delivery summary after the report is included and the snapshot regenerated.

## 7. Git Security Boundary

The workspace `.git` directory and all nested `.git` objects are excluded. No
legacy object, protected Replit ref, remote backup ref, or contaminated history
was copied. The old Replit repository remains legacy/untrusted.

## 8. Secret Scan

PASS. The source scanner and signing guard passed. Hard-coded mobile SDK keys,
owner IDs, email, and App Store Connect identifiers were removed from source.

## 9. Environment Variable Manifest

Names only are documented in `.env.example` and
`docs/required-environment-variables.md`. Values belong in managed secret stores.

## 10. CI/CD

GitHub Actions installs with a frozen lockfile, scans source/signing material,
typechecks, runs API tests, and builds API/admin. Deployment remains manual and
blocked on required checks.

## 11. Cloud Infrastructure

### Frontend

Vercel SPA/security configuration exists; no Vercel authorization or deployment.

### API

Render web configuration exists with scheduler and publication disabled by default.

### Database

Neon-compatible PostgreSQL migration exists; no Neon authorization or backup proof.

### Scheduler

Render cron configuration invokes an independently hosted one-shot command.

### Mobile

Expo/EAS remains the native release system. Build values are now EAS-managed.

## 12. V4 Engine Interface

`SportEngineV4` requires exact identity, evidence collection/materialization,
input/output validation, prediction, approval, and maturity.

## 13. V4 Router

`routeV4Forecast` validates PIT chronology and leakage, executes twice, verifies
determinism and exact identity, and returns either `FORECAST` or `NO_FORECAST`.

## 14. Legacy Fallback Removal

PASS in the new canonical router. BLOCKED in live subscriber routing because
production remains intentionally on the old platform until release gates pass.

## 15. Model Registry

The in-memory canonical registry permits one V4 engine per sport and rejects
non-V4 identity. The additive DB registry enforces exact identity and one active
production artifact per sport.

## 16. Artifact Registry

Artifact and contract hashes are exact 64-character identities. No latest-file,
latest-row, or implicit version loading is permitted.

## 17. Evidence Architecture

Evidence is immutable, hash-addressed, versioned, event-bound, and constrained by
`evidence_time <= cutoff <= prediction_time < event_start`.

## 18. Prediction Architecture

Canonical predictions contain model, artifact, contract, feature snapshot, cutoff,
approval, maturity, supported probabilities/scores, evidence tier, and flags.

## 19. Outcome / Grading Architecture

Existing append-only grade audit remains. Soccer team selections in a three-way
market lose on a draw; unknown side lineage voids rather than inventing a loss.

## 20. Market Comparison

Existing downstream market comparison is preserved. Market keys are forbidden
inside V4 sport inputs and remain downstream of forecasts.

## 21. #238A Safety Layer

Preserved: exact approval, global ranking, top-six-after-ranking, flat 1.0u,
requested-unit audit, POTD safety, official-record filters, append-only audit,
and process-order invariance.

## 22. Official Record

Only effective public `PUBLISHED` picks with 1.0 approved unit and matching
selection are performance eligible. Shadow/research opinions remain excluded.

## 23. POTD

POTD is selected only from the public eligible globally ranked set and remains
locked after event start.

## 24. Staking

Approved public staking remains flat 1.0u. Requested units remain audit evidence.

## 25. CLV

Missing/corrupt exact closing price now produces `null`/UNKNOWN, not zero. Spread
validation averages only observed CLV values.

## 26. Performance Monitoring

Existing analytics retain record, units, ROI, calibration, Brier, log loss, CLV,
drawdown, streak, segmentation, and model version attribution.

## 27. Degradation Monitoring

Existing guarded reviews and drift alerts remain. The migration adds per-sport
technical/approval visibility but does not auto-retrain or auto-promote.

## 28. MLB V4

- Classification: C
- Model ID/version/artifact: no fitted legitimate production artifact.
- Contract: frozen 14-feature V2 consuming live v5 semantics.
- Training: blocked by no independently replayed prospective v5 parity vector.
- Validation: foundation tests pass; benchmark remains quarantined.
- Shadow sample: 30 storage candidates, zero adapter-verified parity vectors.
- Approval/publication: SHADOW foundation; not approved; no V4 publication.

## 29. NCAAF V4

- Classification: B
- Model: `tbm-ncaaf-v4-expected-score`, frozen development artifact.
- Version: `D-simple-expected-score-linear`.
- Training/validation: existing OOS evidence preserved.
- Live executor: authentic candidate executor exists.
- Approval/publication: development/research only; not production-approved.

## 30. NFL V4

Classification D. No legitimate dedicated V4 contract, validated artifact, or
live executor. Existing NFL formulas were not relabeled.

## 31. NBA V4

Classification D. Existing NBA market/generic paths are not a PIT-parity-proven
V4 sport forecast.

## 32. WNBA V4

Classification D. No independent validated WNBA artifact/executor; NBA parameters
were not reused.

## 33. NHL V4

Classification D. Existing NHL signals do not yet form a complete validated V4.

## 34. Soccer V4

Classification D. Three-way grading is corrected, but no dedicated validated
three-outcome V4 artifact/live executor exists.

## 35. UFC V4

Classification D. No dedicated fighter-identity V4 contract/artifact/executor.

## 36. NCAAMB V4

Classification D. No independently trained college-basketball V4 exists.

## 37. Historical Model Archival

Legacy rows and forecasts remain intact for audit. They were not deleted or
relabelled. Active archival waits for each sport's actual V4 cutover.

## 38. Database Schema

The candidate adds exact model artifacts, immutable evidence snapshots, immutable
forecasts, and observable engine runs with constraints and indexes.

## 39. Versioned Migrations

`20260906_001_tbm_v4_platform.sql` is additive, transactional, reviewable, and
backward-compatible. Its rollback policy preserves immutable audit records.

## 40. Data Migration

No destructive or production data migration ran. Existing history is preserved.

## 41. API Compatibility

Existing game/subscriber shapes were not changed. New readiness is additive.

## 42. Scheduler

The API can disable its in-process scheduler. The cloud one-shot isolates sport
evidence jobs and suppresses odds/publication unless explicitly enabled.

## 43. Daily Pipeline

The canonical target sequence is documented. Existing publication pipeline remains
until V4 engines and persistence are legitimately integrated.

## 44. Frontend Compatibility

Admin typecheck/build pass. No visual redesign or subscriber response break.

## 45. Analytics

Existing analytics are preserved; no historical rows were rewritten.

## 46. Admin

Existing owner controls remain. Readiness exposes sport model state without secrets.

## 47. Authentication / Membership

Clerk and entitlement paths were not weakened. Sensitive entitlement fail-closed
behavior remains covered by the full API regression.

## 48. Mobile

Mobile typecheck passes. Cold-start remediation remains unchanged. EAS config no
longer commits account/user/provider values.

## 49. Security

Trusted-origin CORS, proxy-hop configuration, security headers, source/signing
scans, clean-history export, and traversal containment were added.

## 50. Dependency Audit

BLOCKED: 0 critical, 32 high, 23 moderate, and 3 low findings were reported.
No reckless framework-major update was attempted during this migration.

## 51. Path Traversal Review

Resolved paths are decoded, null-byte checked, rooted with `path.resolve`, and
validated with `path.relative`. Six direct tests pass. Static analysis still
flags the file-access sink, but the validated helper prevents root escape.

## 52. CORS

Production defaults to no cross-origin browser access unless exact origins are
listed. Development permits localhost and Replit development origins only.

## 53. Observability

`/api/healthz` reports liveness. `/api/readyz` checks DB connectivity and reports
guarded serving plus all nine V4 engine states. Cron emits structured run output.

## 54. Backup / Recovery

BLOCKED: additive rollback is documented, but Neon backup/PITR capability and a
restoration drill were not externally verified.

## 55. Parallel Deployment

BLOCKED: manifests exist; no authorized Render/Vercel/Neon environment is attached.

## 56. Shadow Dry Run

PARTIAL: development MLB/NCAAF evidence infrastructure and #238A tests pass.
No complete cloud parallel pipeline was available.

## 57. Platform Release Gate

- Clean source: PASS
- Secret/signing scans: PASS
- Required CI definition: PASS; remote run BLOCKED
- API typecheck/tests/build: PASS
- DB migration verified on staging: BLOCKED
- Health checks: code/test PASS; cloud BLOCKED
- Scheduler: code PASS; cloud run BLOCKED
- Frontend: local PASS; cloud BLOCKED
- Mobile compatibility: PASS
- #238A safety: PASS
- Rollback: documented PASS; recovery drill BLOCKED
- No contaminated history copied: PASS
- Dependency security: FAIL due unresolved highs

## 58. Per-Sport Release Gates

| Sport | Technically ready | Model validated | Publication approved |
|---|---|---|---|
| MLB | Foundation only | No | No |
| NCAAF | Candidate yes | Existing research validation | No |
| NFL | No | No | No |
| NBA | No | No | No |
| WNBA | No | No | No |
| NHL | No | No | No |
| Soccer | No | No | No |
| UFC | No | No | No |
| NCAAMB | No | No | No |

## 59. Production Migration Manifest

- Source: fresh local clean root commit; exact hash in final delivery.
- Frontend/backend artifacts: locally buildable, not cloud artifact IDs.
- DB migration: `20260906_001_tbm_v4_platform`.
- Scheduler: `run-cloud-pipeline-once.ts`.
- Active candidate model: NCAAF exact existing development identity only.
- MLB: no fitted artifact.
- Other sports: no V4 artifacts.
- Environment names: documented names-only manifest.
- Domains: pending provider allocation.
- Rollback target: current Replit legacy deployment.

## 60. Cutover Execution

NOT EXECUTED. Hard gates did not pass.

## 61. Post-Cutover Verification

NOT_APPLICABLE because cutover did not occur.

## 62. Rollback Verification

Application rollback procedure is reviewable. Cloud route switch, scheduler
disablement, and DB restore were not testable without external infrastructure.

## 63. Replit Retirement Status

Replit is still required for the live API/scheduler/admin preview. Candidate
source no longer requires Replit-specific production runtime variables.

## 64. Tests

- API: 98 files, 652 tests passed.
- V4/MLB focused: 19 tests passed in final focused run.
- Traversal: 6 passed.
- API/admin/mobile typechecks: passed.
- API/admin builds: passed.
- Signing/source scans and `git diff --check`: passed.

## 65. Full Regression

Workspace aggregate typecheck is blocked by pre-existing mockup-sandbox TypeScript
errors. Production artifacts pass independently. Mobile has no `build:web` script.

## 66. Data Integrity Validation

No production mutation ran. Schema constraints enforce exact hashes, chronology,
single production artifact per sport, and unique immutable forecast identity.

## 67. Forecast Leakage Validation

Tests reject market, CLV, line, consensus, final-score, winner, and postgame keys.
PIT chronology and probability validity fail closed.

## 68. Production Publication Validation

Existing #238A tests pass. Candidate cloud publication defaults false. No public
pick was generated by this migration.

## 69. V4-Era Analytics Baseline

Prepared through exact forecast/artifact identity, but no V4 production era has
started and no legacy history was erased.

## 70. Remaining Technical Debt

Resolve dependency highs; deploy staging; verify DB migration/backup; connect DB
persistence to the canonical router; integrate authentic sport executors; add
cloud provider health; resolve mockup-only type errors.

## 71. Owner Actions Required

1. Authorize/provision Render, Vercel, and Neon staging resources; configure the
   documented environment names in provider secret stores.
2. Create/select the private clean GitHub remote and push only
   `/tmp/tbm-clean-source` after final scan; never push the Replit `.git`.
3. Configure the documented EAS build/submission values in EAS-managed environments.

No secret should be pasted into chat.

## 72. Final Platform Classification

**C — TBM V4 PLATFORM SUBSTANTIALLY BUILT; SPECIFIC HARD RELEASE BLOCKERS REMAIN**

## 73. Final Sport Classifications

- MLB: **C — V4 FOUNDATION BUILT / MODEL NOT YET VALIDATED**
- NCAAF: **B — V4 BUILT / SHADOW OR PROVISIONAL**
- NFL: **D — V4 BLOCKED / NO LEGITIMATE MODEL**
- NBA: **D — V4 BLOCKED / NO LEGITIMATE MODEL**
- WNBA: **D — V4 BLOCKED / NO LEGITIMATE MODEL**
- NHL: **D — V4 BLOCKED / NO LEGITIMATE MODEL**
- Soccer: **D — V4 BLOCKED / NO LEGITIMATE MODEL**
- UFC: **D — V4 BLOCKED / NO LEGITIMATE MODEL**
- NCAAMB: **D — V4 BLOCKED / NO LEGITIMATE MODEL**

## 74. What Is Live Right Now

The Replit legacy API, in-process scheduler, admin, and mobile development
environment are live. MLB V1 and legacy/generic engines can still create current
forecasts on that old platform. No V4 sport is production active or publication
approved. NCAAF has a shadow/research executor; MLB has a shadow foundation.
The new cloud platform is source-complete only as a candidate and is not deployed.

## 75. Exactly One Recommended Next Task

Provision one private staging stack from the clean root repository—GitHub source,
Neon database with verified restore, Render API/cron, and Vercel admin—then run
the complete no-publication release-gate suite against that exact stack.