---
name: Render cutover boundary
description: Production runtime selection and the safety order for moving TBM away from Replit.
---

Render is the chosen replacement cloud runtime for the TBM API/model server and external scheduler. Keep the existing Replit production service active until the Render API, database binding, scheduler, persistence, auth, CORS, V4 projections, and mobile compatibility are fully deployed and smoke-tested. Only then update Vercel/mobile targets and retire Replit ownership.

**Why:** A partial cutover would either break clients, leave Replit as a hidden dependency, or create duplicate scheduler ownership. Railway was rejected after its management server was unreachable; Render is the explicitly chosen alternative.

**How to apply:** Treat valid Render authorization and a healthy replacement deployment as prerequisites. Do not point Vercel or mobile at an unverified host, disable Replit jobs, or remove Replit runtime configuration while either prerequisite is missing.

Append-only evidence ledgers are audit stores, not runtime working sets. Scheduler materializers must select only the exact evidence family and latest identity rows they consume, with explicit column projections.

**Why:** A production-copy NCAAF cycle was silently killed by Render's memory cgroup after a mapping pass loaded hundreds of thousands of historical CFBD domain JSON rows twice, although it only needed the latest team ledger.

**How to apply:** Before raising scheduler memory, compare staging and production row/byte volumes. Replace broad ledger reads with deterministic latest-per-identity SQL and preserve existing cutoff and tie-break semantics.