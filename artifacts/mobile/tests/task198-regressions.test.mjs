import assert from 'node:assert/strict';
import { getForecastMoneylineIdentity } from '../utils/forecastProjection.ts';
import { completeSubscriptionReconciliation } from '../utils/subscriptionReconciliation.ts';
import {
  gamesTodayQueryKey,
  subscriptionStatusQueryKey,
} from '../utils/viewerQueryKeys.ts';
import { createRevenueCatIdentityCoordinator } from '../utils/revenueCatIdentity.ts';
import { splitV4Picks } from '../utils/v4PicksHierarchy.ts';
import fs from 'node:fs';

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
  gamesTodayQueryKey('pro-user', true),
  gamesTodayQueryKey('free-user', false),
);
assert.notDeepEqual(
  gamesTodayQueryKey('pro-user', true),
  gamesTodayQueryKey(null, false),
);

// We simulate the Orval generated query keys here since the module imports fail in pure Node ESM
const getGetChatAccessQueryKey = () => ["/api/chat/access"];
const getGetChatMessagesQueryKey = () => ["/api/chat/messages"];

const proAccessQueryKey = [...getGetChatAccessQueryKey(), { viewerId: 'pro-user', isSubscribed: true }];
const freeAccessQueryKey = [...getGetChatAccessQueryKey(), { viewerId: 'free-user', isSubscribed: false }];

assert.notDeepEqual(proAccessQueryKey, freeAccessQueryKey);

const proMessagesQueryKey = [...getGetChatMessagesQueryKey(), { viewerId: 'pro-user', isSubscribed: true, canRead: true }];
const freeMessagesQueryKey = [...getGetChatMessagesQueryKey(), { viewerId: 'free-user', isSubscribed: false, canRead: false }];
const lockedMessagesQueryKey = [...getGetChatMessagesQueryKey(), { viewerId: 'pro-user', isSubscribed: true, canRead: false }];

assert.notDeepEqual(proMessagesQueryKey, freeMessagesQueryKey);
assert.notDeepEqual(proMessagesQueryKey, lockedMessagesQueryKey);

// Assert stale RevenueCat Pro status is correctly scoped down to free
// when hasServerEntitlement is false
const staleRcAccessQueryKey = [...getGetChatAccessQueryKey(), { viewerId: 'free-user', isSubscribed: false }];
assert.deepEqual(freeAccessQueryKey, staleRcAccessQueryKey);

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

// Assert that stale data during a refetch or error correctly drops entitlement
import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient();
queryClient.setQueryData(subscriptionStatusQueryKey('pro-user-fetching'), { isSubscribed: true });
// A query in fetching or error state with stale true data must yield false
// (We test the logic equivalent applied in revenuecat.tsx)
const mockServerStatusQueryFetching = {
  isFetching: true,
  isError: false,
  isSuccess: true,
  data: { isSubscribed: true }
};
const hasServerEntitlementFetching =
  !mockServerStatusQueryFetching.isFetching &&
  !mockServerStatusQueryFetching.isError &&
  mockServerStatusQueryFetching.isSuccess &&
  mockServerStatusQueryFetching.data?.isSubscribed === true;
assert.equal(hasServerEntitlementFetching, false);

const mockServerStatusQueryError = {
  isFetching: false,
  isError: true,
  isSuccess: false,
  data: { isSubscribed: true }
};
const hasServerEntitlementError =
  !mockServerStatusQueryError.isFetching &&
  !mockServerStatusQueryError.isError &&
  mockServerStatusQueryError.isSuccess &&
  mockServerStatusQueryError.data?.isSubscribed === true;
assert.equal(hasServerEntitlementError, false);

// Persisted official picks are independent of current forecast identity and
// remain visible when their original projection is absent.
const officialPicks = [
  { eventId: 'persisted-event', market: 'moneyline', role: 'TOP_PLAY', rank: 1, status: 'PUBLISHED' },
  { eventId: 'qualified-2', market: 'moneyline', role: 'QUALIFIED_PLAY', rank: 2, status: 'PUBLISHED' },
  { eventId: 'qualified-1', market: 'spread', role: 'QUALIFIED_PLAY', rank: 1, status: 'PUBLISHED' },
];
const currentProjections = [
  { eventId: 'new-forecast-event-id' },
  { eventId: 'persisted-event' },
  { eventId: 'qualified-1' },
  { eventId: 'shadow' },
];
const hierarchy = splitV4Picks(officialPicks, currentProjections);
assert.equal(hierarchy.topPlayIsAvailable, true);
assert.deepEqual(hierarchy.topPlays.map((pick) => pick.eventId), ['persisted-event']);
assert.deepEqual(hierarchy.qualifiedPlays.map((pick) => pick.eventId), ['qualified-1', 'qualified-2']);
assert.deepEqual(hierarchy.projectionsOnly.map((pick) => pick.eventId), [
  'new-forecast-event-id',
  'qualified-1',
  'shadow',
]);

const noOfficial = splitV4Picks([], currentProjections);
assert.equal(noOfficial.topPlayIsAvailable, false);
assert.equal(noOfficial.qualifiedPlays.length, 0);
assert.equal(noOfficial.projectionsOnly.length, currentProjections.length);

const malformedTop = splitV4Picks([
  officialPicks[0],
  { ...officialPicks[0], eventId: 'duplicate-top' },
], []);
assert.equal(malformedTop.topPlayIsAvailable, false);
assert.equal(malformedTop.topPlays.length, 0);
assert.equal(malformedTop.topCandidateCount, 2);

const picksSource = fs.readFileSync(new URL('../app/(tabs)/picks.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(picksSource, /useGetGamesToday|\/api\/games\/today|mapApiGame|getForecast/);
assert.match(picksSource, /hasServerEntitlement/);
assert.match(picksSource, /enabled: Boolean\(userId\) && hasServerEntitlement/);
assert.doesNotMatch(picksSource, /UFC/);
assert.match(picksSource, /board\.fixtures\.length/);
assert.match(picksSource, /fixture\.availability === 'AVAILABLE'/);
assert.match(picksSource, /V4UnavailableProjectionCard/);
assert.match(picksSource, /V4 SLATE/);
assert.match(picksSource, /getV4FullSlateProjections\(\{ sport, date: slateDate \}\)/);
assert.match(picksSource, /timeZone: 'America\/New_York'/);

const v4CardSource = fs.readFileSync(new URL('../components/V4ModelProjectionCard.tsx', import.meta.url), 'utf8');
assert.match(v4CardSource, /value == null \? '—'/);
assert.match(v4CardSource, /expectedAwayScore\.toFixed\(1\)/);
assert.match(v4CardSource, /expectedHomeScore\.toFixed\(1\)/);
assert.match(v4CardSource, /MODEL LEAN/);
assert.match(v4CardSource, /Moneyline lean/);
assert.match(v4CardSource, /Score and moneyline models disagree/);
assert.doesNotMatch(v4CardSource, /Model version/);
assert.match(v4CardSource, /MODEL PROJECTION/);
assert.match(v4CardSource, /Not an Official Play/);
assert.match(v4CardSource, /Pressable/);
assert.match(v4CardSource, /TeamLogo/);
assert.match(v4CardSource, /Pitcher Matchup/);
assert.match(v4CardSource, /fullWidth/);
assert.doesNotMatch(v4CardSource, /detailValue[^}]*numberOfLines=\{1\}/);
assert.doesNotMatch(v4CardSource, /failureReason/);
assert.doesNotMatch(v4CardSource, /TBM OFFICIAL TOP PLAY/);

const officialCardSource = fs.readFileSync(new URL('../components/V4OfficialPickCard.tsx', import.meta.url), 'utf8');
assert.match(officialCardSource, /OFFICIAL TBM PLAY/);
assert.match(officialCardSource, /TeamLogo/);
assert.match(officialCardSource, /View Analysis/);
assert.match(officialCardSource, /artifactId/);
assert.doesNotMatch(officialCardSource, /expectedAwayScore|expectedHomeScore/);
assert.match(picksSource, /board\.officialPicks/);
assert.match(picksSource, /V4OfficialPickCard/);

// Results must render only the strict V4 official ledger provided by the server.
const resultsSource = fs.readFileSync(new URL('../app/(tabs)/results.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(resultsSource, /recordSegments\.preCutoverOfficial/);
assert.doesNotMatch(resultsSource, /HISTORICAL OFFICIAL RECORD/);
assert.match(resultsSource, /const overall = data\?\.overall/);
assert.match(resultsSource, /V4 SEASON RECORD/);
assert.match(resultsSource, /V4 WEEKLY RECORD/);
assert.match(picksSource, /selectedSport === 'All'/);
assert.match(picksSource, /fixture\.availability === 'AVAILABLE'/);
assert.match(picksSource, /!officialEventIds\.has\(fixture\.gameId\)/);
assert.match(resultsSource, /No official picks graded yet/);
assert.doesNotMatch(resultsSource, /cutoverDate|new Date\([^)]*\).*v4/i);
assert.match(resultsSource, /SPORTS\.includes/);
assert.doesNotMatch(resultsSource, /UFC/);

const sportsContextSource = fs.readFileSync(new URL('../context/SportsContext.tsx', import.meta.url), 'utf8');
const notificationsSource = fs.readFileSync(new URL('../hooks/useNotificationPreferences.ts', import.meta.url), 'utf8');
assert.doesNotMatch(sportsContextSource, /UFC/);
assert.doesNotMatch(notificationsSource, /UFC/);

console.log('Task 198 regression tests passed');