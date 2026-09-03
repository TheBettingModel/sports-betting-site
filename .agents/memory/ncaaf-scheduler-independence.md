---
name: NCAAF scheduler independence
description: Why prospective NCAAF evidence collection must run independently from shared heavy scheduler work.
---

Production NCAAF evidence capture, snapshot creation, and pregame cohort assignment must run in their own single-flight cycle rather than inside the shared all-sport heavy-job lock.

**Why:** Aligned cron schedules let an unrelated five-minute research job claim the shared lock at the same minute as 30-minute odds ingestion. The odds job then skipped, which also silently starved NCAAF capture and stale-run reconciliation.

**How to apply:** Keep NCAAF collection on an offset cadence with its own overlap guard and a bounded startup catch-up. Do not make prospective pregame evidence availability depend on another sport's scheduler lock.