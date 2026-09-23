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

Retrospective ESPN scoreboards may corroborate canonical game identity, but they
must never be treated as pregame feature lineage. A verified equal CFBD/ESPN
team ID may carry across seasons only when exact normalized school identity also
agrees, classification is present and equal, and no conflicting canonical
mapping exists.

**Why:** Historical CFBD rows often omit mascots while ESPN uses full
school-plus-mascot display names. Reusing a separately corroborated stable ID is
safer than weakening the general matcher.

**How to apply:** Keep the general matcher exact and fail closed for school,
classification, provider-ID, or multi-canonical conflicts.

When the canonical source corpus changes after rows have been written, issue a
new immutable artifact key even if the row feature schema is unchanged.

**Why:** Artifact identity prevents replacing early rows whose rolling features
were frozen before the complete historical corpus was available.

**How to apply:** Treat schema versions and corpus/artifact versions separately;
never overwrite prior checksum-bound historical rows.

Historical scoreboard completion must use an explicit per-date success ledger,
including successful empty dates; existing game rows do not prove a complete
slate. Never mark the current Eastern date or a future date complete.

**Why:** A partial date capture previously hid missing games, while early
completion of a live/future date can miss games added later.

**How to apply:** Retry only uncompleted past dates in bounded batches and emit
the immutable corpus only when every candidate date is complete.