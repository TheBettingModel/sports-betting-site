const path = require('path');

function resolveStaticPath(staticRoot, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return { ok: false, status: 400, reason: 'MALFORMED_ENCODING' };
  }
  if (decoded.includes('\0')) {
    return { ok: false, status: 400, reason: 'NULL_BYTE' };
  }
  const filePath = path.resolve(staticRoot, `.${decoded}`);
  const relative = path.relative(staticRoot, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, status: 403, reason: 'PATH_ESCAPE' };
  }
  return { ok: true, filePath };
}

module.exports = { resolveStaticPath };