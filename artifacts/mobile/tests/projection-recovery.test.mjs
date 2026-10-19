import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { retryProjectionQuery, nextSlateDate, projectionQueryKey, PROJECTION_REFRESH_MS } from '../lib/projection-query-policy.ts';
const require = createRequire(import.meta.url);
const { getProductionApiDomain } = require('../scripts/mobile-api-domain.cjs');

test('preview domain follows the explicit API URL, not the Replit hosting domain', () => {
  assert.equal(getProductionApiDomain({
    EXPO_PUBLIC_API_URL: 'https://live.example.com',
    EXPO_PUBLIC_DOMAIN: 'wrong-workspace.example.com',
  }), 'live.example.com');
});
test('invalid configuration fails explicitly', () => {
  for (const url of ['', 'live.example.com', 'http://live.example.com', 'https://live.example.com/path', 'local host']) {
    assert.throws(() => getProductionApiDomain({ EXPO_PUBLIC_API_URL: url }));
  }
});
test('both preview services resolve the same authoritative profile', () => {
  const mobile = require('../package.json');
  const api = require('../../api-server/package.json');
  assert.match(mobile.scripts.dev, /node scripts\/mobile-api-domain.cjs/);
  assert.match(api.scripts.dev, /node \.\.\/mobile\/scripts\/mobile-api-domain.cjs/);
  assert.doesNotMatch(mobile.scripts.dev, /EXPO_PUBLIC_DOMAIN=\$REPLIT_DEV_DOMAIN/);
});
test('transient failures retry with a bound', () => {
  assert.equal(retryProjectionQuery(0, { status: 502 }), true);
  assert.equal(retryProjectionQuery(1, new Error('offline')), true);
  assert.equal(retryProjectionQuery(2, { status: 503 }), false);
  assert.equal(PROJECTION_REFRESH_MS, 120_000);
});
test('auth failures do not retry or bypass access', () => {
  for (const status of [400, 401, 403, 404]) {
    assert.equal(retryProjectionQuery(0, { status }), false);
    assert.equal(retryProjectionQuery(0, { response: { status } }), false);
  }
});
test('cache identities isolate viewers, date, sport, entitlement and source', () => {
  const base = projectionQueryKey('NFL', '2026-10-04', 'viewer-a', true, 'live.example');
  for (const key of [
    projectionQueryKey('NBA', '2026-10-04', 'viewer-a', true, 'live.example'),
    projectionQueryKey('NFL', '2026-10-05', 'viewer-a', true, 'live.example'),
    projectionQueryKey('NFL', '2026-10-04', 'viewer-b', true, 'live.example'),
    projectionQueryKey('NFL', '2026-10-04', 'viewer-a', false, 'live.example'),
    projectionQueryKey('NFL', '2026-10-04', 'viewer-a', true, 'wrong.example'),
  ]) assert.notDeepEqual(key, base);
});
test('day warming uses calendar dates across ET DST and year boundaries', () => {
  assert.equal(nextSlateDate('2026-10-03'), '2026-10-04');
  assert.equal(nextSlateDate('2026-10-31'), '2026-11-01');
  assert.equal(nextSlateDate('2026-12-31'), '2027-01-01');
});
test('screen polls, resumes, retries and warms future reads without pipeline mutations', () => {
  const source = readFileSync(new URL('../app/(tabs)/picks.tsx', import.meta.url), 'utf8');
  assert.match(source, /refetchInterval: PROJECTION_REFRESH_MS/);
  assert.match(source, /refetchOnReconnect: true/);
  assert.match(source, /AppState.addEventListener/);
  assert.match(source, /Promise.all\(\[worker\(\), worker\(\)\]\)/);
  assert.doesNotMatch(source, /refreshGames|runPipeline|\/admin\/refresh/);
});