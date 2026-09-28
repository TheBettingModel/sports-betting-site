import assert from 'node:assert/strict';
import fs from 'node:fs';

const analyticsSource = fs.readFileSync(
  new URL('../app/(tabs)/live.tsx', import.meta.url),
  'utf8',
);

// The counters must match the currently selected sport, not the unfiltered
// board used to build the filters.
assert.match(analyticsSource, /visibleItems\.filter\(\(item\) => item\.sharpDirection !== 'UNAVAILABLE'\)/);
assert.match(analyticsSource, /const splitSignals = visibleItems\.filter\(/);
assert.match(analyticsSource, /\{visibleItems\.length\}[\s\S]*?TRACKED/);

// A missing snapshot, one pending observation, and a completed neutral
// comparison are distinct states; do not infer movement from a single quote.
assert.match(analyticsSource, /sharpHistory\.length >= 2[\s\S]*?movementDirection/);
assert.match(analyticsSource, /sharpHistory\.length === 1 \? 'SHARP MOVE PENDING' : 'NO VERIFIED SHARP SNAPSHOT'/);
assert.match(analyticsSource, /publicHistory\.length === 1 \? 'PUBLIC MOVE PENDING' : 'NO PUBLIC MARKET HISTORY'/);
assert.match(analyticsSource, /item\.sharpDirection === 'NEUTRAL'\) return 'NO MATERIAL SHARP MOVE'/);
assert.match(analyticsSource, /item\.publicDirection === 'NEUTRAL'\) return 'NO MATERIAL PUBLIC MOVE'/);
assert.match(analyticsSource, /function movementDirection\(first: number, last: number\)/);

// Both the refresh control and its message are tied to the actual query
// results, so a failed refresh does not look like fresh market data.
assert.match(analyticsSource, /const \[marketResult, \.\.\.projectionResults\] = await Promise\.all/);
assert.match(analyticsSource, /const marketFailed = marketResult\.isError/);
assert.match(analyticsSource, /Some game projections could not be refreshed/);
assert.match(analyticsSource, /Market history could not be refreshed/);
assert.match(analyticsSource, /Analytics data refreshed\./);
assert.match(analyticsSource, /Refreshing market history and game projections/);
assert.match(analyticsSource, /Market history could not be loaded\. Pull down to try again\./);
assert.match(analyticsSource, /accessibilityLiveRegion="polite"/);
assert.match(analyticsSource, /disabled=\{isRefetching\}/);