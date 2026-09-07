---
name: Render cutover boundary
description: Production runtime selection and the safety order for moving TBM away from Replit.
---

Render is the chosen replacement cloud runtime for the TBM API/model server and external scheduler. TBM production is app-only: Expo/EAS mobile → Render → Neon. Vercel is not a production component or cutover gate. Keep Replit production active until Render, Neon, scheduler, and the actual distributed mobile app are fully verified.

**Why:** A partial cutover would either break clients, leave Replit as a hidden dependency, or create duplicate scheduler ownership. The user explicitly removed Vercel from the production architecture and prioritized the distributed iOS app.

**How to apply:** Treat a healthy Render deployment, validated Neon restore, and verified mobile release as prerequisites. Do not move mobile traffic, disable Replit jobs, or enable the Render cron until the coordinated cutover can leave exactly one scheduler owner.

Append-only evidence ledgers are audit stores, not runtime working sets. Scheduler materializers must select only the exact evidence family and latest identity rows they consume, with explicit column projections.

**Why:** A production-copy NCAAF cycle was silently killed by Render's memory cgroup after a mapping pass loaded hundreds of thousands of historical CFBD domain JSON rows twice, although it only needed the latest team ledger.

**How to apply:** Before raising scheduler memory, compare staging and production row/byte volumes. Replace broad ledger reads with deterministic latest-per-identity SQL and preserve existing cutoff and tie-break semantics.