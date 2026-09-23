---
name: CFBD advanced endpoint contracts
description: Non-obvious live CFBD request and identity semantics needed for safe NCAAF evidence capture.
---

CFBD play-by-play requires season and week and returns the entire week; adding a game ID does not narrow the response. Capture once per bounded active week, then partition by the provider game ID in each play.

Most advanced domains—including team statistics, ratings, talent, returning production, rosters, and player statistics—identify teams with a school-name string rather than a team ID. Resolve those names only through the provider's teams feed and preserve unmatched or ambiguous states.

CFBD play rows expose `ppa`. Preserve that provider field and provenance exactly; do not label it EPA without a separately verified semantic contract.

**Why:** Live authenticated contract checks showed that guessed per-game play queries and generic `id` handling would either fail, duplicate large weekly payloads, or attach evidence to the wrong entity.

**How to apply:** Use endpoint-specific query and identity contracts, raw-first append-only storage, exact provider-native team mapping, and conservative PIT classes for every CFBD domain.