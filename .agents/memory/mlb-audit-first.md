---
name: MLB audit-first sequence
description: Decision order for MLB model changes after a poor performance sample
---

MLB production weights must remain unchanged until the auditability and publication-safety layer is complete. The next gate is a larger challenger replay; only after that replay provides sufficient evidence may a production weight or selection-policy change be considered.

**Why:** The weekly sample showed both model underperformance and measurement/publication risks, including superseded ledger rows, incomplete factor attribution, and unconfirmed lineups. Changing weights before separating those causes would risk fitting the wrong problem.

**How to apply:** First validate effective-ledger accounting, immutable factor attribution, and MLB publication gates. Then compare challenger variants offline against the immutable replay. Keep production unchanged unless the challenger clears predefined calibration, sample-size, and performance gates.