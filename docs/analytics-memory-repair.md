# Server-only Analytics memory repair

## Release boundary

Prepared from the verified live API commit
`4fa8fcc91bedf0df8ca77d2e1e93e4ae7a7801e1`.
This branch changes only the subscriber Analytics read and adds verification.
It does not change mobile code, model calculations, NCAAF evidence eligibility,
scheduler ownership, fixture synchronization, MLB slate membership, or database
schema. The separate pending Sam Houston identity correction is not included.

No live deployment, GitHub push, or production data mutation is part of preparing
this repair. Build 36 remains unchanged.

## Repair

- Reduce named-book moneyline history in PostgreSQL before transferring it to
  Node: opening observation plus latest two per game/canonical book/selection.
- Select the newest provider identity before filtering conflicting timestamps.
  Tied identities fail closed. Conflicting timestamps cannot manufacture a pair.
- Preserve canonical-book display-name collision protection, sharp attribution,
  strict pregame cutoffs, and the existing response shape.
- Match the millisecond precision of the existing JavaScript date decoder.
- Share overlapping same-date scans only; never cache completed responses or
  entitlement checks. Allow at most two distinct-date scans at once. Excess
  scans receive an explicit 503 with Retry-After, not an empty successful feed.
- Leave every scheduled game in the response even when history is unavailable.

## Verification

TypeScript and the production API/worker bundles pass. The targeted suite passes
49 tests. Read-only live queries reduced today's NCAAF history population from
671,636 stored observations to 5,456 display observations across the same 40 games.
These counts are observations, not counts of games with actual directional moves.

`scripts/verify-analytics-memory.ts --fixture-sql` emits a SELECT-only PostgreSQL
fixture. Its CTEs shadow the source tables: no tables are created or changed.
Execute its parameterized query using an approved read-only connection, and save
the resulting rows as a JSON array. Then run:

```sh
pnpm exec tsx --max-old-space-size=256 --max-semi-space-size=1 \
  scripts/verify-analytics-memory.ts /path/to/fixture-result.json
```

This compares SQL compaction with the deployed JS oracle at the API response
boundary, including replacements, tied identities, duplicate/conflicting
timestamps, opening quotes, draw selections, named-book collisions, invalid
quotes, and unavailable games. It then checks 45,000 compacted points with
30 overlapping requests and one database execution. Observed heap usage was
70 MiB with a 259 MiB total V8 heap limit.

The semispace flag matters: the old-space flag alone does not bound the entire
V8 heap identically across Node versions and host memory limits.

## Owner-controlled activation

After separate approval, push this isolated branch, then activate only the
Render API service `srv-daf2vemq1p3s73bee8lg` with the reviewed repair commit.
Do not use generic Replit Publish and do not change the external scheduler cron.
Do not publish or resubmit an iOS binary for this server-only change.

After activation, verify the deployed SHA, health/readiness, authenticated
NCAAF projections, and authenticated market Analytics on today's slate. Inspect
Render logs for fresh heap crashes and confirm incomplete history stays explicitly
unavailable. Local success does not establish live recovery.
