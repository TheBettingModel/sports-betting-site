# NCAAF V4 learning and promotion freeze

**Policy:** `ncaaf-v4-learning-freeze-v1`  
**Status:** production is frozen; this policy does not publish or promote.

## Collection

Keep collecting prospective NCAAF V4 forecasts from the existing exact approved
artifact. Record the immutable pregame evidence envelope, feature cutoff,
artifact/configuration/parameter hashes, deterministic output hash, and
authoritative final evidence. A forecast is eligible for this review only when
both teams are FBS, it is graded, and the pregame evidence is complete.

The observation clock starts at the declared collection start. Do not reset it
to make a review earlier. Corrections are appended to the immutable ledger;
they do not rewrite a forecast or its canonical label.

## Review and challenger training

The service reports `REVIEW_ELIGIBLE` only after **28 calendar days** from
observation start, at least **100 graded FBS-vs-FBS forecasts**, complete
immutable pregame evidence, no unresolved integrity failures, and explicit
human approval naming the exact challenger identity. A report is advisory:
it never changes production weights or the champion.

If eligible, train a challenger offline from the frozen, point-in-time dataset.
Retain dataset, code, feature-contract, parameter, and artifact hashes. Use
the existing immutable forecast validation and challenger promotion boundaries;
no market, outcome, or post-cutoff information may enter features.

## OOS gates, approval, and rollback

Run the existing out-of-sample/walk-forward gates against the same frozen
cohort for champion and challenger. Require complete provenance, deterministic
replay, exact artifact identity, required metric thresholds, and an explicit
human approval for that exact challenger version. Store the decision and
provenance in the existing approval ledger. Promotion, if ever authorized,
is a separately executed change and must be reversible to the unchanged
champion; rollback restores the prior exact artifact and records the reason.

## Prohibited actions

No automatic promotion, automatic retraining, automatic weight/configuration
changes, silent champion replacement, publication enablement, or forecast
backfill that rewrites immutable evidence is permitted during this freeze.
Schedulers may collect and grade evidence, and may report eligibility only.