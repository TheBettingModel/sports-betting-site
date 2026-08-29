---
name: Spread market isolation
description: Rules for independent spread modeling, promotion, and card selection.
---

Spread forecasts must remain isolated from moneyline prediction, grading, learning, publication, units, and notifications until their own sport-specific out-of-sample gate passes. Moneyline is evaluated first; spread is considered only when moneyline does not qualify.

**Why:** A converted moneyline probability is not an independently validated margin distribution, and mixing shadow spread records into production history would contaminate trusted performance records.

**How to apply:** Use exact complete two-sided sportsbook spread markets, explicit push handling, sport/model identities, and immutable spread evidence. Keep new spread versions in shadow until calibration, Brier score, log loss, ROI, CLV, drawdown, coverage, sample, uncertainty, and data-quality gates pass.