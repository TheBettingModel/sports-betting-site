---
name: Feed refresh resilience
description: Rules that keep mobile feed reads from multiplying expensive refresh work or misreporting outages as no-play days.
---

Normal mobile refresh gestures must only refetch the feed. They must not directly launch the full odds, evidence, grading, learning, and forecast-review pipeline. Server-side stale refreshes must be single-flight so concurrent readers share one refresh.

**Why:** A production feed request triggered expensive refresh work while the process was already memory-heavy, the API exited before responding, and the mobile client rendered the transport failure as “No games today.” That hid both a valid published play and the outage.

**How to apply:** Keep expensive refresh orchestration behind a server freshness guard with one in-flight promise. On the client, distinguish query failure from a successful empty games array, preserve stale data when available, and offer a lightweight retry rather than a mutation that recalculates the slate.