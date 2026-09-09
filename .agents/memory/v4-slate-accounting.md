---
name: V4 slate accounting
description: Rules for reconciling scheduled fixtures, legitimate projections, and post-kickoff display.
---

Every scheduled V4 fixture must remain visible in the slate even when no legitimate projection can be produced. Scheduled-game counts and visible fixture rows must reconcile; an unavailable fixture is not a projection or an official play.

**Why:** A Soccer slate showed six scheduled games but silently rendered only one forecast. Weakening evidence requirements or generating after kickoff would make the interface complete by making the model dishonest.

Daily slate discovery must refresh date-specific schedule, identity, and official logo metadata from the provider before reconciling database rows. A database-only slate is invalid when scheduler ownership is intentionally disabled on the serving API.

**Why:** The serving database had no current MLB rows even though ESPN listed a full slate, so subscribers saw a false “No games today” state. The mobile cache also needs the Eastern date in its query identity so yesterday’s slate cannot survive midnight.

**How to apply:** Render successful forecasts as projection cards and failed fixtures as explicit unavailable rows with a plain-language reason. Refresh provider metadata without weakening model evidence gates or enabling a second scheduler. Never recompute after kickoff. A started fixture may show a forecast only from an exact immutable snapshot created before its event start.