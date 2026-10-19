import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatAppVersionLabel } from '../utils/appVersionLabel.ts';
import { newestChatUpdates } from '../utils/chatPresentation.ts';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('installed version and generated build are displayed without a source-build assumption', () => {
  assert.equal(formatAppVersionLabel('1.0.1', '12'), '1.0.1 (12)');
  assert.equal(formatAppVersionLabel('2.3.4', '105'), '2.3.4 (105)');
  assert.equal(formatAppVersionLabel(' 1.0.1 ', ' 12 '), '1.0.1 (12)');
  assert.equal(formatAppVersionLabel(null, null), 'Unavailable');
  assert.equal(formatAppVersionLabel('1.0.1', null), '1.0.1');
  assert.equal(formatAppVersionLabel('1.0.1', '54', true), '1.0.1 (preview)');
});

test('Profile reads installed metadata and labels web/Expo Go previews explicitly', () => {
  const profile = source('../app/(tabs)/profile.tsx');
  assert.match(profile, /Application\.nativeApplicationVersion/);
  assert.match(profile, /Application\.nativeBuildVersion/);
  assert.match(profile, /ExecutionEnvironment\.StoreClient/);
  assert.match(profile, /Platform\.OS === 'web'/);
  assert.match(profile, /label: 'App Version', value: appVersionLabel/);
  assert.doesNotMatch(profile, /value: '1\.0\.0'|expoConfig\?\.ios\?\.buildNumber/);
});

test('obsolete Profile alert controls are absent; shared notifications and sign-out cleanup remain', () => {
  const profile = source('../app/(tabs)/profile.tsx');
  assert.doesNotMatch(profile, /Daily Pick Alerts|ALERT ME FOR THESE SPORTS|MINIMUM PICK TIER/);
  assert.doesNotMatch(profile, /handleNotificationsToggle|notifPrefs|userPrefs|sportChip|tierChip/);
  assert.match(profile, /await disableNotifications\(\)/);
  assert.match(source('../app/(tabs)/_layout.tsx'), /await enableNotifications\(\)/);
  assert.match(source('../app/(tabs)/chat.tsx'), /useUpdateChatPreferences/);
  assert.match(source('../hooks/usePushNotifications.ts'), /export function usePushNotifications/);
});

test('Chat presents newest updates first, preserving all history and cached API order', () => {
  const older = Object.freeze({ id: 1, createdAt: '2026-10-01T10:00:00Z' });
  const sameTime = Object.freeze({ id: 2, createdAt: older.createdAt });
  const newest = Object.freeze({ id: 3, createdAt: '2026-10-07T10:00:00Z' });
  const apiMessages = Object.freeze([older, sameTime, newest]);
  assert.deepEqual(newestChatUpdates(apiMessages), [newest, sameTime, older]);
  assert.deepEqual(apiMessages, [older, sameTime, newest]);
  assert.deepEqual(newestChatUpdates([]), []);
  assert.deepEqual(newestChatUpdates([older]), [older]);
});

test('Chat ordering is presentation-only and still respects server access', () => {
  const chat = source('../app/(tabs)/chat.tsx');
  assert.match(chat, /canRead \? newestChatUpdates\(messagesData\?\.messages \?\? \[\]\) : \[\]/);
  assert.match(chat, /inverted=\{false\}/);
  assert.match(chat, /enabled: !!userId && hasServerEntitlement && access\?\.canRead === true/);
  assert.match(chat, /onRefresh=\{\(\) => refetchMessages\(\)\}/);
  assert.match(source('../../api-server/src/routes/chat.ts'), /orderBy\(asc\(chatMessagesTable.createdAt\), asc\(chatMessagesTable.id\)\)/);
});
