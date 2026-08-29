---
name: Spread market isolation
description: Rules for independent spread modeling, promotion, and card selection.
---

Spread forecasts must remain isolated from moneyline prediction, grading, learning, publication, units, and notifications until their own sport-specific out-of-sample gate passes. While spread is shadow-only, qualified moneyline remains official. Once both markets are independently production-approved, compare them on a common risk-adjusted scale and publish only the stronger candidate; evaluation order must not decide the winner.

**Why:** A converted moneyline probability is not an independently validated margin distribution, and mixing shadow spread records into production history would contaminate trusted performance records. After independent validation, automatic moneyline priority can hide a better-priced spread.

**How to apply:** Use exact complete two-sided sportsbook spread markets, explicit push handling, sport/model identities, and immutable spread evidence. Keep new spread versions in shadow until calibration, Brier score, log loss, ROI, CLV, drawdown, coverage, sample, uncertainty, and data-quality gates pass. Compare only eligible candidates using symmetric evidence; neutralize a factor when equivalent immutable evidence is unavailable for both markets.