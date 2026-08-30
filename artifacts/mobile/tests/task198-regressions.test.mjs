import assert from 'node:assert/strict';
import { getForecastMoneylineIdentity } from '../utils/forecastProjection.ts';
import { completeSubscriptionReconciliation } from '../utils/subscriptionReconciliation.ts';
import {
  gamesTodayQueryKey,
  subscriptionStatusQueryKey,
} from '../utils/viewerQueryKeys.ts';
import { createRevenueCatIdentityCoordinator } from '../utils/revenueCatIdentity.ts';

const awayProjection = getForecastMoneylineIdentity({
  projection: { homeWinPct: 20 },
  homeTeam: { abbr: 'HOME' },
  awayTeam: { abbr: 'AWAY' },
  vegasLine: { homeOdds: 300, awayOdds: -400 },
});

assert.deepEqual(awayProjection, {
  selection: 'away',
  teamAbbr: 'AWAY',
  probability: 80,
  marketOdds: -400,
  fairPrice: -400,
});

const calls = [];
const status = await completeSubscriptionReconciliation({
  entitlement: { expirationDate: '2027-08-29T00:00:00.000Z' },
  sync: async (expiresAt) => {
    calls.push(['sync', expiresAt]);
    return { synced: true, isSubscribed: true };
  },
  getStatus: async () => {
    calls.push(['status']);
    return { isSubscribed: true, entitlement: 'pro' };
  },
  refreshGames: async () => {
    calls.push(['refresh-games']);
  },
});

assert.equal(status.isSubscribed, true);
assert.deepEqual(calls.map(([name]) => name), ['sync', 'status', 'refresh-games']);

let refreshedAfterFailedStatus = false;
await assert.rejects(
  completeSubscriptionReconciliation({
    entitlement: { expirationDate: null },
    sync: async () => ({ synced: true, isSubscribed: true }),
    getStatus: async () => ({ isSubscribed: false }),
    refreshGames: async () => {
      refreshedAfterFailedStatus = true;
    },
  }),
  /Pro access is not ready yet/,
);
assert.equal(refreshedAfterFailedStatus, false);

assert.notDeepEqual(
  subscriptionStatusQueryKey('pro-user'),
  subscriptionStatusQueryKey('free-user'),
);
assert.notDeepEqual(
  gamesTodayQueryKey('pro-user'),
  gamesTodayQueryKey('free-user'),
);
assert.notDeepEqual(
  gamesTodayQueryKey('pro-user'),
  gamesTodayQueryKey(null),
);

let currentUserId = 'pro-user';
let releaseProLogin;
let markProLoginStarted;
const proLoginBlocked = new Promise((resolve) => {
  releaseProLogin = resolve;
});
const proLoginStarted = new Promise((resolve) => {
  markProLoginStarted = resolve;
});
const identityCalls = [];
const coordinator = createRevenueCatIdentityCoordinator({
  getCurrentUserId: () => currentUserId,
  logIn: async (userId) => {
    identityCalls.push(`login:${userId}`);
    if (userId === 'pro-user') {
      markProLoginStarted();
      await proLoginBlocked;
    }
  },
  logOut: async () => {
    identityCalls.push('logout');
  },
});

const staleProIdentification = coordinator.identify('pro-user');
await proLoginStarted;
currentUserId = 'free-user';
const freeIdentification = coordinator.identify('free-user');
releaseProLogin();

await assert.rejects(staleProIdentification, /account changed/);
await freeIdentification;
coordinator.assertCurrent('free-user');
assert.deepEqual(identityCalls, [
  'login:pro-user',
  'logout',
  'login:free-user',
]);

console.log('Task 198 regression tests passed');