---
name: Projection-first serving
description: Public coverage policy after TBM moved from betting recommendations to matchup research.
---

Every eligible pregame fixture on the current daily slate must receive the best available model projection. Prefer the advanced sport model, then use the established daily model as a display-only fallback. Missing advanced evidence may reduce model quality, but recommendation-era approval, units, edge, and shadow gates must not make an ordinary matchup unavailable.

**Why:** TBM is now a matchup projection product, not a pick or wagering recommendation product. Subscribers choose games themselves and expect projected scores, totals, margins, winners, and probabilities for the complete daily slate.

**How to apply:** Keep experimental validation and shadow comparisons internal. Never publish fallback output as a pick or recommendation. Preserve pregame cutoff and immutable snapshot rules; do not create a new projection after kickoff. Keep machine lifecycle status separate from future user-facing presentation labels.

User-facing analysis may explain where TBM sees model separation within a matchup, but must not call that separation a market edge unless the screen has verified point-in-time market prices to compare against.

**Why:** The product should help users understand each game and form their own view without presenting an internal probability difference as proven betting value.

**How to apply:** Use plain-language model outlooks based on projected score, win probability, and supported sport-specific factors. Label model-versus-market differences separately once verified market evidence is available.

The owner confirmed the projection-first detail hierarchy—score projection, model separation explanation, and visual comparisons—as the desired direction.