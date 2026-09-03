---
name: NCAAF invalid-wager quarantine
description: Durable integrity rules for historical non-actionable NCAAF publications and future wager creation.
---

Preserve invalid historical predictions, publications, and grades as immutable audit evidence, but classify them in a separate append-only eligibility ledger. Every Results, ROI, grading, calibration, learning, validation, promotion, and public-performance consumer must enforce that ledger.

**Why:** A legacy NCAAF path converted Neutral, zero-unit decisions into effective one-unit wagers. Deleting or rewriting those rows would destroy the audit trail, while filtering only in one report would allow contamination through another consumer.

**How to apply:** Treat publication as a permanent invariant: only actionable Buy or Strong Buy decisions with finite positive units may create wager/result rows, and all performance consumers must use the shared eligibility predicate. NCAAF remains not ready for V4 while independent evidence and explicit prospective cohorts are incomplete.