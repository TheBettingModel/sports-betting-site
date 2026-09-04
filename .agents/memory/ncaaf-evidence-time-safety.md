---
name: NCAAF evidence-time safety
description: Point-in-time rules for historical NCAAF evidence and provider limitations.
---

Retrospectively fetched provider payloads must be timestamped when actually captured and must never be backdated to a modeled game date. A historical provider response can document what the provider says now, but it cannot prove that the information was available before the game.

Prospective evaluation must freeze the complete model-input and prediction ledgers before kickoff, bind each prediction to its scheduled kickoff, and hash the ledgers. Later grading must load and verify that frozen package rather than reconstructing forecasts from current tables.

**Why:** Backdating current or postgame data—or rebuilding a claimed prospective forecast after the fact—would leak later information and make validation look stronger than the model really was.

**How to apply:** Require every evidence read and forecast timestamp to be strictly before the frozen kickoff. Preserve missing data explicitly; reject duplicate/conflicting evidence and any ledger-hash mismatch before grading.