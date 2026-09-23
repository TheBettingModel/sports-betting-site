---
name: Modeled-date season boundaries
description: Durable rules for selecting season-scoped sports data without contaminating forecasts across seasons.
---

Use the modeled game date as the source of truth for every season-scoped database query, provider request, and cache entry. Calendar-year sports and split-year sports must resolve through one shared boundary policy; Soccer must also distinguish MLS from European-style calendars.

**Why:** Server time and provider “current season” defaults can silently mix seasons around New Year, during offseasons, and when reviewing an older game. A cache that omits target-date context can preserve the same contamination even after a query is corrected.

**How to apply:** Pass the game date and league from ingestion, refresh, scheduler, and any legacy reconstruction path. Include resolved season plus target date in cache keys, bound database rows to the season start and modeled date, and send explicit seasons/dates to providers that support them. Immutable prediction snapshots remain authoritative for production learning.