---
name: ESPN logo URL exceptions
description: How to source ESPN team logos reliably, including newer WNBA franchises.
---

Use the scoreboard response's direct `team.logo` URL before constructing a numeric-ID CDN URL.

**Why:** ESPN's numeric-ID image pattern works for established teams but returns 404 for newer WNBA franchises such as Toronto Tempo and Golden State Valkyries. The scoreboard provides valid abbreviation-based image URLs for those teams.

**How to apply:** Preserve a numeric-ID CDN URL only as a fallback when `team.logo` is absent. In clients, retain a narrow known-team fallback only to protect users while previously ingested invalid URLs age out.