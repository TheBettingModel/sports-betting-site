---
name: NCAAF live snapshot memory
description: Bounded reads and cache retention for append-only NCAA pregame intelligence snapshots.
---

Live serving must select the newest valid pregame snapshot per physical provider/event in PostgreSQL, not transfer all versions and discard older ones in JavaScript. ESPN native and public-prefixed event aliases share a fixture; retain the original selected provider identity. Preserve the strict cutoff and kickoff checks, with deterministic cutoff/id ordering.

**Why:** An ordinary Saturday's append-only snapshot history occupied hundreds of megabytes even in compressed PostgreSQL storage. Hydrating its JSON population exhausted the live API heap.

**How to apply:** Use database-side distinct selection in both preview boards and authoritative executor materialization. Keep requested-event and Eastern-day bounds in SQL; do not delete or rewrite the evidence ledger to reduce memory.

Names, markets, and public game references must pass ordered-team and kickoff verification. Alias equivalence alone is not enough to attach public metadata.

**Why:** Older prefixed snapshots and newer native-ID captures can coexist, producing duplicate forecasts with different winners. A stale public kickoff can also disagree with current provider evidence.

**How to apply:** Select the newest alias as a complete row, never combine convenient fields from different captures. Keep numerical forecasts visible when association fails, but withhold unverified enrichment and new canonical-reference persistence.

Market identity reads must project just the payload fields their gate needs, rather than hydrate complete provider responses per price row.

**Why:** Many price rows repeat a large provider response. Recovering more fixture matches can reintroduce memory exhaustion even with bounded intelligence snapshots.

**How to apply:** Reduce payloads in SQL before transfer; keep raw immutable provider evidence unchanged.

Forecast caches keyed by changing feature cutoffs must prune obsolete keys globally and have a small capacity limit.

**Why:** Expiring only the requested key retains every superseded history population when refreshes produce new keys.

**How to apply:** Sweep expired entries and bound retained populations independently of which key the next request uses.