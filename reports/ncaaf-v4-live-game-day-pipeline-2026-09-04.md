# NCAAF V4 Live Game-Day Pipeline — 2026-09-04

## 1. Executive summary

#223C is technically complete in development as a current-Eastern-day, research-only NCAAF V4 preview pipeline. The final real slate produced 5 forecasts from 8 scheduled games, 3 safe market matches, and 2 projected opportunities. The pipeline passed its model-integrity, PIT, market-firewall, authorization, architecture, test, typecheck, and build gates.

Production release is intentionally paused. Independent review found pre-existing Apple signing credentials tracked in Git. The owner chose not to authorize a destructive history rewrite in this task. No #223C commit, push, schema publication, or production deployment was performed.

**Final decision: C — #223C partial because one specific production blocker remains.**

## 2. Today-only invariant

Normal game-day behavior resolves the active calendar date dynamically in `America/New_York`. API, admin, mobile, refresh, and scheduler paths default to that current date.

The final restarted scheduler fetched ESPN date `20260904` only. Its current evidence capture contained 8 games. It did not request September 5 or later dates.

Explicit-date diagnostics remain available. Future diagnostic requests cannot persist through the normal game-day prediction ledger.

## 3. Frozen model verification

- Model: `tbm-ncaaf-v4-expected-score`
- Version: `D-simple-expected-score-linear`
- Configuration hash: `212a6c78431a181821106721877155745724d3619ec63cf5424f098b07f9ae86`
- Parameter hash: `792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81`
- Model status: `V4_PREVIEW`
- Approval status: `UNVALIDATED`
- Publication status: `PREVIEW_ONLY`

No coefficient, calibration, registry, champion, or official-pick change was made.

## 4. Existing work preserved

The existing #221I evidence, #222 Baseline D model, #222C FBS identity universe, #223 validation package, #223B frozen 656-row ledger, and incumbent production model were preserved. The 656-row validation ledger was not regenerated or modified.

## 5. Today's schedule

Final current-day verification:

- Eastern date: `2026-09-04`
- Scheduled snapshots: 8
- V4 forecasts: 5
- Projected opportunities: 2

## 6. Domain filtering

- Model-eligible FBS-vs-FBS games: 5
- Out-of-domain games: 3
- Identity-unresolved games: 0

The three exclusions were FBS-vs-FCS games. No unresolved target was forced into the model.

## 7. Feature bridge

The frozen 138-team 2026 FBS universe proof is supplied to the existing #222C bridge. The bridge uses immutable pre-kickoff intelligence snapshots and PIT-safe historical evidence. It does not consume sportsbook inputs.

## 8. Forecast generation

Each eligible game receives frozen expected home and away points, margin, total, win probabilities, fair American odds, margin uncertainty, total uncertainty, data quality, and preview statuses.

Final integrity counters:

- PIT violations: 0
- Market leakage violations: 0
- Invalid probability outputs: 0

## 9. Market identity root causes

Final grouped forecast-level causes:

- `SAFE_MATCH`: 3
- `NO_CURRENT_MARKET`: 2

No fuzzy or forced attachment was used to increase match rate.

## 10. Market identity resolution

Market attachments remain deterministic and fail closed. Identity proof uses exact game evidence, ordered teams, sport, kickoff, neutral-site context, and coherent market snapshots. Stale, incomplete, ambiguous, and unsafe candidates remain unattached.

Every board row carries an auditable match reason and root cause for owner review.

## 11. Market-match statistics

- Eligible forecasts: 5
- Market observations considered in final run: 6,406
- Safe matches: 3
- Unmatched games: 2
- Ambiguous games: 0
- Stale games: 0
- Rejected games: 0
- Safe match rate: 60%

The observation query is bounded to exact current-day game-evidence identities and a 90-minute diagnostic window.

## 12. Prediction persistence

Dedicated append-only development tables preserve sports predictions separately from changing market evidence:

- `ncaaf_v4_game_day_predictions`
- `ncaaf_v4_game_day_market_evidence`

Prediction rows include game identity, kickoff, feature cutoff/hash, frozen model hashes, expected scores, probabilities, fair odds, uncertainty, statuses, and grading identity. Sports prediction rows do not contain mutable sportsbook prices.

The development schema was applied successfully. Production schema application was not attempted because release is paused.

## 13. Idempotency

Prediction IDs are deterministic for the exact game, model, configuration, parameters, feature cutoff, and prediction content.

Final repeated same-snapshot execution:

- Predictions after cold call: unchanged on warm repeat
- New prediction rows on warm repeat: 0
- New market-link rows on warm repeat: 0
- Duplicate prediction IDs in the development ledger: 0

Legitimate newer pre-kickoff feature cutoffs create distinct immutable revisions rather than overwriting old forecasts.

## 14. Grading compatibility

The prospective game-day ledger preserves prediction, canonical game, kickoff, model version, feature snapshot, expected-score outputs, and source audit identities needed for future grading. No unfinished game was graded in #223C.

This ledger is separate from the frozen #223/#223B 656-row formal validation ledger.

## 15. Performance profile

Final measured current-day cold request:

- Total: 2,085 ms
- Schedule retrieval: 118 ms
- Historical feature reconstruction: 379 ms
- Feature bridge: 255 ms
- V4 inference and board construction: 8 ms
- Market retrieval: 1,276 ms
- Market matching: less than 1 ms
- Persistence: 47 ms
- Response serialization: less than 1 ms

Final measured warm request:

- Total: 110 ms internally; 112 ms wall-clock
- Feature bridge: effectively 0 ms
- Market retrieval: effectively 0 ms
- Persistence/idempotency check: 13 ms

## 16. Performance improvements

The previous approximately 59-second behavior was removed by:

- caching completed same-day immutable sports outputs;
- keying sports cache entries by the complete selected snapshot fingerprint, feature schema, date, and frozen model hashes;
- keeping sports and market caches separate;
- using a shorter independent market cache;
- bounding market evidence retrieval to current eligible observations;
- preventing repeated chronological reconstruction and V4 inference on warm requests.

Measured improvement: approximately 59 seconds before hardening, 2.09 seconds final cold, and 112 ms final warm.

## 17. Admin board

The owner/admin Models page includes a today-only NCAAF V4 panel with:

- scheduled, eligible, forecast, safe-match, and opportunity totals;
- projected score, winner, probabilities, fair odds, margin, and total;
- safely matched moneyline, spread, and total;
- model-vs-market comparisons;
- model opinion, data quality, market state/root cause, incumbent agreement, and timestamps;
- expandable technical hashes for owner-only review;
- an explicit no-qualifying-play state that does not hide the full forecast board.

The endpoint is protected by the existing master/session middleware. The unauthenticated development request returned 401.

## 18. Subscriber/mobile integration

The Picks screen calls the normal endpoint without a date parameter and only when server entitlement is active. Pull-to-refresh refetches the current slate only.

A subscriber-specific allowlisted DTO exposes compact product fields only. It omits prediction IDs/hashes, model hashes, feature cutoffs, provider diagnostics, PIT internals, exclusions, audit data, cache metadata, and owner market-identity details.

The iOS and Android production bundles completed successfully. The headless Expo web screenshot remained black, so an authenticated visual subscriber verification is not claimed.

## 19. Zero-pick handling

Both admin and mobile include a professional zero-opportunity state. Thresholds were not lowered and no pick was manufactured.

The final refreshed market state produced 2 projected opportunities; the zero-state remains implemented for future slates with zero qualifying plays.

## 20. Preview/publication security

V4 remains `V4_PREVIEW`, `UNVALIDATED`, and `PREVIEW_ONLY`.

The implementation does not:

- create official wager units;
- insert V4 rows into official pick tables;
- mark V4 production approved;
- mutate the registry or champion;
- replace `tbm-ncaaf-moneyline-v1`;
- bypass publication permission.

## 21. Authorization

Development verification and route tests confirmed:

- Unauthenticated subscriber request: 401
- Signed-in inactive subscriber: 403
- Active subscriber/owner: allowed by existing entitlement policy
- Unauthenticated admin request: 401
- Subscriber 500 responses: generic; no projection internals leaked

## 22. Refresh architecture

The normal NCAAF production evidence cycle now:

1. resolves the current Eastern date;
2. captures only that date's schedule and odds;
3. creates current-day feature snapshots;
4. creates current-day football-intelligence snapshots;
5. initializes and persists current-day V4 forecasts after snapshot creation;
6. skips initialization if the Eastern date rolls over during the cycle.

Market refresh remains separate from immutable sports output.

## 23. No-future-prefetch verification

Tests cover Eastern-date resolution, DST boundaries, scheduler date propagation, provider date restriction, and rollover behavior.

Live restart evidence:

- ESPN NCAAF request: `20260904`
- Captured games: 8
- Forecast initialization: true
- September 5 or later ESPN requests: none

The key boundary is applied before Odds API results can derive additional ESPN dates.

## 24. Runtime health

Final development workflows started successfully:

- API server: running
- Admin web: running
- Mobile Expo/Metro: running

Final current-day scheduler cycle completed successfully with:

- 8 games captured
- 8 feature snapshots
- 8 intelligence snapshots
- `v4ForecastInitialized: true`
- no game failures

## 25. Tests

- Full API suite after hardening: 438 tests passed, 71 files
- Final focused release suite: 47 tests passed, 5 files

Coverage includes date/DST behavior, no-future capture, scheduler ordering, frozen hashes, bridge/domain rules, market safety, persistence/idempotency, write-time kickoff race, cache invalidation, subscriber DTO redaction, and authorization.

## 26. Typechecks

- API typecheck: PASS
- Admin typecheck: PASS
- Mobile typecheck: PASS
- Generated shared libraries typecheck: PASS

## 27. Builds

- API production build: PASS
- Admin production build: PASS
- Mobile iOS production bundle: PASS
- Mobile Android production bundle: PASS
- OpenAPI generation: PASS

## 28. Security review

#223C feature-security review: PASS.

Verified:

- entitlement and admin authorization remain enforced;
- subscriber payload is allowlisted;
- no V4 publication or champion path exists;
- no market-to-model or post-kickoff leakage was found;
- temporary unauthenticated certificate/profile download routes were removed.

Overall release security: FAIL because pre-existing Apple `.p8` and `.p12` signing credentials remain tracked in Git history. The owner chose to pause release rather than authorize destructive history rewriting in #223C.

Follow-up task #221 records required revocation/rotation and history cleanup.

## 29. Architecture review

PASS.

Independent review confirmed:

- provider-bounded current-day capture;
- snapshot-before-initialization ordering;
- fresh write-time kickoff gate;
- rollover protection;
- append-only prediction and market ledgers;
- complete snapshot-set cache fingerprint;
- independent market refresh;
- subscriber/admin contract separation;
- no registry, champion, official-pick, or cross-sport changes.

## 30. Git commit

Not performed. Active branch: `main`. Pre-work HEAD: `a481c5c`.

The required commit `Complete NCAAF V4 today game-day preview pipeline` was intentionally withheld because the release security gate did not pass.

## 31. Git push

Not performed. The owner selected “Pause release and finish #223C as partial with this blocker documented.”

## 32. Deployment

Not performed.

Replit Publish is required to apply the new production schema and deploy the API/admin artifacts. That process was intentionally not started while tracked credentials remain unresolved.

Native mobile changes also require the project's Expo release path; a Git push or generic web publish would not release a new native binary.

## 33. Production verification

Production was not changed.

Before release was paused, the existing production deployment returned 404 for `GET /api/model/ncaaf/v4/projections`, confirming #223C was not already deployed. Therefore:

- Production API: FAIL / not deployed
- Production admin board: FAIL / not deployed
- Production subscriber surface: NOT DEPLOYED
- Production schema: not applied

No production today or tomorrow pipeline was invoked during final verification.

## 34. Remaining limitations

1. Pre-existing Apple signing credentials remain tracked and must be revoked/rotated and purged from Git history before release.
2. Authenticated owner/subscriber UI screenshots could not be captured without credentials; static builds and authorization contracts passed.
3. The headless Expo web preview rendered black even though native production bundles passed; native release was not attempted.
4. Two eligible games had no current safe market, leaving a legitimate 3/5 safe-match rate.
5. V4 remains unvalidated preview evidence and is not an official production champion.

## 35. Next task

Do not begin #224.

First complete follow-up task #221: revoke/rotate the exposed Apple signing credentials, purge them from repository history with coordinated approval, verify Expo/EAS signing, rerun security checks, then commit, push, publish the schema/API/admin changes, release mobile through the proper Expo path if authorized, and perform production today-only verification.
