---
name: Projection pass access
description: Product access rule for free signed-in users in the projection-first app.
---

Free signed-in users may manually choose one upcoming game and access its full projection for a rolling 24 hours. Every other game, Analytics, and Chat remain Pro-only; selecting a game must require explicit confirmation and be enforced by the server.

**Why:** The product is a projection-first research app, not an official-picks service. The prior server-selected free-pick flow does not give users meaningful choice and can expose more than one game.

**How to apply:** Persist the selection and expiry per authenticated user, enforce it in every projection/detail endpoint, and show a confirmation before the first selection. Do not use device-local state or calendar-day resets as the entitlement boundary.