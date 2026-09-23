---
name: MLB V4 shadow boundary
description: Durable lifecycle and evidence rules for the MLB V4 run-based challenger.
---

MLB V4 is permanently shadow-only and non-deployable. Its registry identity must not move beyond challenger status, and every writer must recheck that status rather than rely on a process cache.

**Why:** A normal challenger lifecycle could accidentally promote an unvalidated model, and a first-write-only snapshot would freeze morning evidence before starters, lineups, weather, or markets settle.

**How to apply:** Write materially distinct point-in-time forecasts as append-only revisions, deduplicate identical inputs, keep official units at zero, and grade outcomes only in the forecast-review research ledger. Champion snapshot capture and learning must never mutate the frozen V3 configuration.

The first strict historical replay supports a V4.1 research challenger, not promotion or continued as-is validation. The clean window was below the minimum diagnostic sample, V4 did not beat the no-vig market, and the run model materially underpredicted total scoring.

**Why:** Proper scoring improved modestly over V3, so the auditable run-first architecture remains worth researching, but negative market skill and broad run underprediction are evidence-supported implementation weaknesses.

**How to apply:** Keep V4 unchanged and shadow-only. Treat run-environment correction, lineup capture, and away/underdog diagnosis as offline V4.1 experiments; require a larger chronological held-out replay before fitting calibration or distribution changes.

The first V4.1 diagnosis found no defensible score-changing correction. The apparent low-total compression is real, but the available immutable ledger cannot isolate a causal defect: offense already uses runs scored, missing lineups are neutral, and starter outcomes plus a chronological league-run ledger are absent.

**Why:** A 79-game development sample can reveal bias but cannot distinguish a true run-model defect from period/sample effects well enough to justify an intercept, scaling change, or pitcher retune.

**How to apply:** Keep the V4.1 identity as an exact-output audit wrapper around V4, permanently non-publishable. Do not fork formulas until new untouched PIT evidence captures league environment, confirmed lineups, and starter outcomes.

The sealed offense-plus-bullpen expected-runs challenger is classification C: trained and integrity-clean, but not competitive. It failed the predeclared development bias rule, and the one permitted locked-OOS evaluation confirmed severe low-run compression. That OOS cohort is now permanently spent.

**Why:** An untouched full-season chronological evaluation confirmed that PIT-safe offense, league context, and bullpen features without target-game starter evidence do not produce a promotable run forecast. Integrity and reasonable probability calibration do not override a failed run-level acceptance gate.

**How to apply:** Preserve the authoritative model, mapping, forecasts, and evaluation append-only. Never repair, recalibrate, reselect, or promote this candidate using its OOS outcomes. Any future challenger requires genuinely new PIT-safe evidence and a newly predeclared untouched evaluation plan.

A candidate-unseen cohort is not an untouched final holdout when the same games were opened for any earlier MLB candidate. A new candidate also cannot freeze until a versioned adapter proves that every historical training feature is reproduced exactly from live snapshots, including windows, denominators, ordering, missingness, and PIT cutoffs.

**Why:** A later validation-selected logistic model had modest point-estimate lift, but the only available OOS games were already spent globally and its flat historical feature contract did not match the nested live input contract. Calling either condition “close enough” would overstate final evidence and permit train/serve skew.

**How to apply:** Do not reopen the spent OOS cohort. Reserve genuinely future games before any next model selection, and require field-by-field historical/live parity tests against the exact input-contract version before freezing an artifact or building an executor.

Historical pregame MLB starter recovery is not viable at meaningful multi-season scale from the current or retrospective official sources. Completed-game starter identities are actual-only; a retrospective probable-pitcher response has no historical as-of proof. The final evidence classification is prospective foundation required.

**Why:** Official schedule `probablePitcher` data is authoritative only when the exact response is received and archived before first pitch. Historical schedule and boxscore responses expose current/actual state without revision timestamps, so treating them as pregame knowledge would manufacture PIT evidence.

**How to apply:** Capture the official schedule response after receipt but strictly before first pitch, retain exact raw payload/hash and UNKNOWN/AMBIGUOUS slots append-only, and deduplicate state atomically. Accumulate a prospective readiness cohort before any starter-aware challenger; final evaluation must use genuinely future games, never the spent historical OOS cohort.

Prospective probable-starter identity capture alone does not make the next modeling pipeline ready. Pipeline readiness requires a durable collection-run/discovery denominator, safe repeated operation, physically separate actual outcomes, frozen pregame offense/bullpen features, and a materialized chronology-safe starter state/role contract.

**Why:** The first live-forward audit had complete PIT-safe identity for one slate but no trustworthy observation-period denominator, outcome pairs, repeat/change diversity, or persisted starter state; classifying that as ready would turn missing evidence into an implicit pass.

**How to apply:** Keep the prospective pipeline classified partial and block any starter-aware challenger until the missing accumulation and pairing contracts are operational and independently reassessed. Report unavailable denominators as null, never as capture-derived 100% coverage.

Persisted live input versions are immutable semantic evidence, including their defects; never repair an existing version in place. Historical/live parity means raw definitions, units, orientation, missingness, PIT rules, and the exact fitted transform all match.

**Why:** A field-level audit found that name-similar live inputs can still disagree through season windows, side handling, duplicated source versions, null policy, or unbound context windows. A transform hash alone cannot reconstruct missing fitted constants.

**How to apply:** Mint a new live input version for semantic repairs, preserve old snapshots as ineligible audit evidence, and deny model-vector eligibility until every required field and fitted normalization constant is exact and machine-bound.