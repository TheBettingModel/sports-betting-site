---
name: NCAAF challenger promotion
description: How NCAAF market comparison and promotion must remain isolated, point-in-time, and fail-closed.
---

NCAAF sportsbook observations may be captured beside an immutable challenger prediction for later ROI and closing-line comparison, but must never enter the challenger’s feature or probability calculation.

**Why:** Challenger predictions intentionally carry zero units and no sportsbook price. Without a separate decision-time market fact, ROI and CLV cannot be measured; copying a later price into the prediction would create leakage and undermine model independence.

**How to apply:** Match decision and closing prices to the same event, provider, book, market, selection, and line using strict team and kickoff identity. Grade the exact stored probability. Keep publication, pick results, learning, and model activation untouched. Treat every missing metric, unsupported required market, insufficient season/sample count, or failed stability/coverage gate as a promotion rejection.