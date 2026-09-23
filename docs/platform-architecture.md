# TBM V4 platform architecture

## Operating boundary

TBM uses shared infrastructure and independent sports intelligence. Shared code
may manage identities, evidence envelopes, immutable forecasts, market
comparison, publication, grading, and monitoring. A sport's features,
parameters, and executor must never be reused as another sport's forecast.

The canonical runtime contract is `SportEngineV4` in
`artifacts/api-server/src/services/v4Platform.ts`. It requires exact model,
artifact, and input-contract identity; point-in-time evidence; deterministic
execution; and a canonical forecast envelope.

The V4 router has no legacy fallback. If a sport has no registered, healthy,
eligible V4 engine, its result is `NO_FORECAST`. Existing V1/V2/V3 code remains
available only to the legacy deployment and historical/research tooling until a
controlled platform cutover.

## Current honest engine state

- NCAAF: authentic frozen V4 executor exists; publication remains blocked.
- MLB: parity-safe V4 foundation and shadow infrastructure exist; fitted
  challenger remains blocked by prospective provenance replay.
- NFL, NBA, WNBA, NHL, Soccer, UFC, NCAAMB: no authentic V4 executor exists.
  They must return no V4 forecast rather than reuse the generic legacy formula.

## Request lifecycle

1. Discover an event.
2. Capture immutable source evidence.
3. Materialize a versioned sport-specific input.
4. Validate PIT chronology and leakage boundaries.
5. Resolve an exact registered artifact.
6. Execute twice and compare deterministic output hashes.
7. Persist an immutable forecast.
8. Fetch market data downstream.
9. Compare model fair price with no-vig market price.
10. Apply the global publication safety layer.
11. Grade only after authoritative final evidence.

## Environments

- Development: local/Replit workspace; schedulers may run for development data.
- Staging: cloud API and database candidate, `PUBLICATION_ENABLED=false`.
- Production: clean-repository artifacts only, explicit exact approvals, and
  `PUBLICATION_ENABLED=true` only after all release gates pass.

No production service requires Replit-specific environment variables.