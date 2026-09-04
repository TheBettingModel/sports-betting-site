---
name: NCAAF scheduler independence
description: Why prospective NCAAF evidence collection must run independently from shared heavy scheduler work.
---

Production NCAAF evidence capture, snapshot creation, and pregame cohort assignment must run in their own single-flight cycle rather than inside the shared all-sport heavy-job lock.

**Why:** Aligned cron schedules let an unrelated five-minute research job claim the shared lock at the same minute as 30-minute odds ingestion. The odds job then skipped, which also silently starved NCAAF capture and stale-run reconciliation.

**How to apply:** Keep NCAAF collection on an offset cadence with its own database-backed global overlap guard and a bounded startup catch-up. Limit overdue provider families per cycle and batch bulk normalization so one Autoscale instance or oversized response cannot monopolize collection.

Operational approval reports may assert only scheduler/run/error signals that are persisted in auditable evidence. If a count is visible only in transient logs or a different execution context, report it as unavailable rather than zero.

**Why:** Managed workflow, deployment, and script execution contexts do not necessarily share process visibility; process-list heuristics can count wrappers, miss managed processes, or conflate environments.

**How to apply:** Derive status, partial reasons, active/stale runs, and provider errors from the append-only run ledger. Keep workflow restart health as separately sourced evidence, and label unpersisted duplicate/process/auth failure counts unavailable.