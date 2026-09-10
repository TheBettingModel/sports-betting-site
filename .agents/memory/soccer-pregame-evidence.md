---
name: Soccer pregame evidence warm-up
description: Soccer V4 needs two strictly earlier completed matches per team and league-specific provider coverage before projections can be shown.
---

Soccer V4 projections may use only immutable completed matches that precede kickoff; the daily slate fetch alone is insufficient for teams from leagues not included in the provider map.

**Why:** The rolling-score contract rejects teams with fewer than two prior games, and unsupported European leagues otherwise leave valid Champions League fixtures permanently unavailable. Refreshes must not turn missing history into a forecast.

**How to apply:** Keep the bounded cached history warm-up and add only provider league feeds that have been verified to return completed games. Teams without a trustworthy historical feed remain unavailable until an independent provider is added.