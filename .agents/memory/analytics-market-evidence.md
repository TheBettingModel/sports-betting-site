---
name: Analytics market evidence
description: Evidence requirements for TBM Analytics sharp-money and CLV labels.
---

Sharp-money direction may be shown only when at least two comparable moneyline observations exist for the projected side from the same sportsbook explicitly classified as sharp. Ordinary market movement and model-edge heuristics are not sharp-money evidence.

**Why:** The legacy sharp signal can fall back to model edge when Pinnacle evidence is absent, so presenting it as verified sharp action would misstate the source.

**How to apply:** Group observations by sportsbook and selection before comparing them. Show unavailable when the comparison is incomplete.

CLV direction requires a same-book market price captured at or before the forecast timestamp and a later comparable price. Label it projected before market closure and final only after the event/market has closed.

**Why:** Opening-to-current movement without a forecast-time entry price is market movement, not CLV.

**How to apply:** Never substitute unrelated books, inferred opening prices, or mutable post-start data. Missing comparison evidence must fail closed.