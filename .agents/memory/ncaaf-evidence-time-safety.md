---
name: NCAAF evidence-time safety
description: Point-in-time rules for historical NCAAF evidence and provider limitations.
---

Retrospectively fetched provider payloads must be timestamped when actually captured and must never be backdated to a modeled game date. A historical provider response can document what the provider says now, but it cannot prove that the information was available before the game.

**Why:** Backdating current or postgame data would leak final scores, lineup changes, or later market information into training and make validation look stronger than the model really was.

**How to apply:** Require every evidence read to use a validated cutoff strictly before the modeled kickoff. Preserve missing provider timestamps and unsupported historical markets, rosters, injuries, or metrics explicitly rather than substituting zeroes, neutral values, or display fallbacks.