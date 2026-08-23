---
name: MLB policy revisions
description: Immutable recommendation-policy revisions for unstarted MLB moneyline games.
---

MLB recommendation-policy changes must create a new immutable revision and
replacement prediction/pick, never update an existing prediction or result.
Only games still marked upcoming with a future provider start timestamp are
eligible; recheck this cutoff inside the same locked transaction that writes
the replacement.

**Why:** A threshold-only change otherwise rewrites the context users saw,
creates duplicate grading, or accidentally alters a game after first pitch.

**How to apply:** Keep one effective pick per game/market for the live feed.
Retain superseded records for audit, settle a superseded pregame pending result
as an explicit void with its policy-revision audit entry, and grade only the
effective decision against the final score.