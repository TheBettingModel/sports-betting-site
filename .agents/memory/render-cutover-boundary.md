---
name: Render cutover boundary
description: Production runtime selection and the safety order for moving TBM away from Replit.
---

Render is the chosen replacement cloud runtime for the TBM API/model server and external scheduler. Keep the existing Replit production service active until the Render API, database binding, scheduler, persistence, auth, CORS, V4 projections, and mobile compatibility are fully deployed and smoke-tested. Only then update Vercel/mobile targets and retire Replit ownership.

**Why:** A partial cutover would either break clients, leave Replit as a hidden dependency, or create duplicate scheduler ownership. Railway was rejected after its management server was unreachable; Render is the explicitly chosen alternative.

**How to apply:** Treat valid Render authorization and a healthy replacement deployment as prerequisites. Do not point Vercel or mobile at an unverified host, disable Replit jobs, or remove Replit runtime configuration while either prerequisite is missing.