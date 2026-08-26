---
name: Immutable forecast review evidence
description: Rules for grading completed model forecasts without using mutable game state or destabilizing the audit ledger.
---

Completed-forecast reviews may grade an outcome only when the immutable
prediction snapshot contains a valid scheduled start time, the saved prediction
timestamp is before that start, the market line and selection are supported,
and complete decision evidence is present. Review metrics must not infer those
facts from mutable game records.

**Why:** Later corrections to a game row can rewrite pregame eligibility in
retrospect, causing forecasts to enter or leave calibration reporting for
reasons unrelated to the saved decision. Invalid evidence must remain an
explicit exclusion, not silently become a loss or push.

**How to apply:** Save pregame start and market evidence with every prediction
snapshot. Keep the review ledger unique per prediction and insert conflict-safe
records. If a validator fix requires a rebuild, version the derived ledger and
requeue only prior versions once; never repeatedly delete and recreate stable
review rows on startup.