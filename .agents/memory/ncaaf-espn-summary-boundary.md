---
name: NCAAF ESPN summary boundary
description: What ESPN summary evidence can safely support and which provider gaps still block NCAAF modeling.
---

Use ESPN summaries only as immutable completed-game evidence: team boxscores, drives, provider player IDs, and observed QB passing performance. Do not treat these postgame rows as pregame starter, roster, injury, or availability evidence.

**Why:** Live verification showed reliable completed-game team/drive/player data but no dependable complete play-level feed or timestamped pregame personnel state. Treating postgame identities as pregame knowledge would violate PIT semantics.

**How to apply:** Keep the canonical sports-intelligence snapshot blocked when pregame QB evidence or early-season prior evidence is absent. A future provider must supply timestamped pregame QB/roster/injury data and reliable historical team/play evidence before V4 work starts.