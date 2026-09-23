const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { resolveStaticPath } = require('./safe-path');

const root = path.resolve('/srv/tbm/static-build');

test('allows files beneath the static root', () => {
  assert.deepEqual(resolveStaticPath(root, '/assets/app.js'), {
    ok: true,
    filePath: path.join(root, 'assets/app.js'),
  });
});

for (const candidate of [
  '/../secret', '/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd',
  '/assets/../../../secret',
]) {
  test(`rejects traversal ${candidate}`, () => {
    assert.equal(resolveStaticPath(root, candidate).ok, false);
  });
}

test('rejects malformed encoding and null bytes', () => {
  assert.equal(resolveStaticPath(root, '/%E0%A4%A').status, 400);
  assert.equal(resolveStaticPath(root, '/asset%00.js').status, 400);
});