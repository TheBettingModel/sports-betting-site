import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparableMarketHistory } from '../lib/analytics-history-policy.ts';
const point = (sportsbook, selection, capturedAt, price = -110) => ({ sportsbook, selection, capturedAt, price });
const first = '2026-10-03T19:00:00Z', second = '2026-10-03T20:00:00Z', third = '2026-10-03T21:00:00Z';
test('complete history wins over a newer singleton from another book', () => {
  const points = [point('Pinnacle', 'home', first), point('Pinnacle', 'home', second, -130), point('Circa', 'home', third)];
  assert.deepEqual(comparableMarketHistory(points, 'home'), points.slice(0, 2));
});
test('different selections and books never combine into a movement pair', () => {
  const result = comparableMarketHistory([point('Pinnacle', 'home', first), point('Circa', 'home', second), point('Circa', 'away', third)], 'home');
  assert.equal(result.length, 1);
  assert.equal(result[0].sportsbook, 'Circa');
});
test('repeated provider timestamps are not independent observations', () => {
  assert.equal(comparableMarketHistory([point('Pinnacle', 'home', first), point('Pinnacle', 'home', '2026-10-03T19:00:00.000Z')], 'home').length, 1);
});
test('invalid dates and empty selections cannot create movement', () => {
  assert.equal(comparableMarketHistory([point('Pinnacle', 'home', 'bad-date')], 'home').length, 0);
  assert.equal(comparableMarketHistory([point('Pinnacle', 'home', first)], null).length, 0);
});
test('real unchanged observations remain a valid pair for flat movement', () => {
  assert.equal(comparableMarketHistory([point('Pinnacle', 'home', first), point('Pinnacle', 'home', second)], 'home').length, 2);
});
test('soccer draw observations remain separate from home and away prices', () => {
  const points = [point('Pinnacle', 'draw', first, 220), point('Pinnacle', 'draw', second, 200),
    point('Pinnacle', 'home', third, -120)];
  assert.deepEqual(comparableMarketHistory(points, 'draw'), points.slice(0, 2));
});