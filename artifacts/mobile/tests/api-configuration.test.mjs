import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { normalizeApiUrl, resolveApiBaseUrl } from '../lib/api-url.ts';

const require = createRequire(import.meta.url);
const { getProductionApiUrl, getProductionApiDomain } = require('../scripts/mobile-api-domain.cjs');
const production = 'https://tbm-api-v4-candidate.onrender.com';
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('native builds use the explicit API URL despite the injected Replit domain', () => {
  const env = {
    EXPO_PUBLIC_API_URL: production,
    EXPO_PUBLIC_DOMAIN: 'incorrect-backend.replit.app',
    REPLIT_DEV_DOMAIN: 'incorrect-workspace.replit.dev',
  };
  assert.equal(getProductionApiUrl(env), production);
  assert.equal(getProductionApiDomain(env), 'tbm-api-v4-candidate.onrender.com');
  for (const platform of ['ios', 'android']) {
    for (const development of [true, false]) {
      assert.equal(resolveApiBaseUrl(env.EXPO_PUBLIC_API_URL, platform, development, env.REPLIT_DEV_DOMAIN), production);
    }
  }
});

test('only development web preview uses the existing authenticated read-through', () => {
  assert.equal(resolveApiBaseUrl(production, 'web', true, 'preview.replit.dev'), 'https://preview.replit.dev');
  assert.equal(resolveApiBaseUrl(production, 'web', false, 'preview.replit.dev'), production);
  assert.equal(resolveApiBaseUrl(production, 'web', true), production);
});

test('runtime and build configuration normalize the same HTTPS origins', () => {
  for (const value of [production, `${production}/`, ` ${production}/ `, 'https://API.example.com:443/']) {
    assert.equal(normalizeApiUrl(value), getProductionApiUrl({ EXPO_PUBLIC_API_URL: value }));
  }
});

test('missing or malformed API URL fails rather than falling back to Replit or localhost', () => {
  for (const value of [undefined, '', 'api.example.com', 'http://api.example.com', 'https://localhost',
    'https://user:password@api.example.com', 'https://api.example.com/api', 'https://api.example.com?x=1',
    'https://api.example.com#fragment']) {
    assert.throws(() => normalizeApiUrl(value));
    assert.throws(() => getProductionApiUrl({ EXPO_PUBLIC_API_URL: value, EXPO_PUBLIC_DOMAIN: 'wrong.replit.app' }));
  }
});

test('all API consumers share the resolved URL and no longer use the hosting domain', () => {
  assert.match(source('../app/_layout.tsx'), /setBaseUrl\(API_BASE_URL\)/);
  for (const path of ['../app/_layout.tsx', '../app/(tabs)/picks.tsx', '../app/(tabs)/live.tsx',
    '../hooks/usePushNotifications.ts', '../hooks/useUserPreferences.ts', '../hooks/useNotificationPreferences.ts']) {
    assert.match(source(path), /API_BASE_URL/);
    assert.doesNotMatch(source(path), /EXPO_PUBLIC_DOMAIN|http:\/\/localhost:3000/);
  }
  assert.match(source('../lib/legal-url.ts'), /PRODUCTION_API_URL/);
  assert.doesNotMatch(source('../lib/legal-url.ts'), /EXPO_PUBLIC_DOMAIN/);
});

test('Clerk uses the explicit Render backend and retains the existing auth token bridge', () => {
  const config = source('../lib/api-config.ts');
  assert.match(config, /process\.env\.EXPO_PUBLIC_API_URL/);
  assert.match(config, /process\.env\.EXPO_PUBLIC_CLERK_PROXY_URL/);
  assert.match(config, /`\$\{PRODUCTION_API_URL\}\/api\/__clerk`/);
  const layout = source('../app/_layout.tsx');
  assert.match(layout, /process\.env\.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  assert.match(layout, /setAuthTokenGetter\(\(\) => getToken\(\)\)/);
  assert.match(layout, /const proxyUrl = CLERK_PROXY_URL/);
  assert.match(source('../scripts/build.js'), /`\$\{apiUrl\}\/api\/__clerk`/);
  assert.match(source('../scripts/build.js'), /EXPO_PUBLIC_API_URL: apiUrl/);
});

test('Replit publishing no longer depends on eas.json and preserves mobile identity and purchases', () => {
  assert.equal(existsSync(new URL('../eas.json', import.meta.url)), false);
  assert.doesNotMatch(source('../scripts/mobile-api-domain.cjs'), /require\(['"]\.\.\/eas\.json/);
  const app = require('../app.json').expo;
  assert.equal(app.version, '1.0.2');
  assert.equal(app.ios.bundleIdentifier, 'app.replit.thebettingmodel');
  assert.equal(app.extra.eas.projectId, '278c23a8-5a4b-4c28-baa2-f8331d5bee7a');
  // App Store Connect confirms 1.0.1 (13), not the old source-only 37.
  assert.equal(app.ios.buildNumber, '14');
  assert.equal(app.updates, undefined);
  assert.equal(app.runtimeVersion, undefined);
  assert.match(source('../lib/revenuecat.tsx'), /process\.env\.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY/);
  assert.match(source('../lib/revenuecat.tsx'), /REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro"/);
});
