---
name: NCAAF historical materialization
description: Safety and performance rules for activating completed CFBD games in the sport-specific V4 history path.
---

Completed game outcomes may become rolling team-strength evidence for later
kickoffs without requiring unrelated pregame odds or roster lineage. A target
game's own result must never enter its features, and unavailable completion time
must use a conservative post-kickoff boundary.

**Why:** Requiring every completed outcome to have separate pregame domain
lineage prevented legitimate historical team strength from reaching NCAA V4.

**How to apply:** Keep strict A/B timing gates for pregame-sensitive evidence,
but replay exact canonical completed games chronologically and expose prior-game
counts with the rolling features.

Historical reconciliation must load requested seasons once, batch append-only
mapping writes, and index domain evidence by season/game/team before conversion.

**Why:** Sequential mapping inserts and per-game scans over the complete evidence
ledger can saturate the API process and delay startup.

**How to apply:** Preserve exact identity decisions and fail-closed ambiguity,
while keeping mapping and evidence lookup complexity near linear in input size.