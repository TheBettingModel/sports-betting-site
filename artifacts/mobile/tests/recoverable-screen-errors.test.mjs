import assert from 'node:assert/strict';
import fs from 'node:fs';
import { safeRequestErrorCategory } from '../utils/safeRequestErrorCategory.ts';

assert.equal(safeRequestErrorCategory({ status: 401 }), 'HTTP 401');
assert.equal(safeRequestErrorCategory({ status: 503, message: 'private response body' }), 'HTTP 503');
assert.equal(
  safeRequestErrorCategory({ name: 'TypeError', message: 'Network request failed' }),
  'Network error',
);
assert.equal(safeRequestErrorCategory({ message: 'Bearer private-token' }), 'Details unavailable');
assert.equal(safeRequestErrorCategory({ status: 999 }), 'Details unavailable');

const picksSource = fs.readFileSync(new URL('../app/(tabs)/picks.tsx', import.meta.url), 'utf8');
assert.match(picksSource, /freeGamesQuery\.isError/);
assert.match(picksSource, /onRetry={freeGamesQuery\.refetch}/);
assert.match(picksSource, /retryServerEntitlement/);

const gameSource = fs.readFileSync(new URL('../app/game/[gameId].tsx', import.meta.url), 'utf8');
assert.match(gameSource, /serverEntitlementError/);
assert.match(gameSource, /onRetry={retryServerEntitlement}/);
assert.match(gameSource, /freeGamesQuery\.isError/);
assert.match(gameSource, /onRetry={freeGamesQuery\.refetch}/);

const resultsSource = fs.readFileSync(new URL('../app/(tabs)/results.tsx', import.meta.url), 'utf8');
assert.match(resultsSource, /useSubscription/);
assert.match(resultsSource, /enabled: hasServerEntitlement && !serverEntitlementError/);
assert.match(resultsSource, /onRetry={retryServerEntitlement}/);
assert.match(resultsSource, /router\.push\('\/membership'\)/);
assert.match(resultsSource, /isError/);
assert.match(resultsSource, /data={isError \? \[\] : listItems}/);
assert.match(resultsSource, /onRetry={refetch}/);
assert.match(resultsSource, /No graded picks yet/);
assert.ok(
  resultsSource.indexOf('if (serverEntitlementError)') < resultsSource.indexOf('if (!hasServerEntitlement)'),
  'entitlement errors should show a recoverable state instead of the Pro-only state',
);