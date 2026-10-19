/** Replit Launch reads Production environment settings, not eas.json.
 * Its injected EXPO_PUBLIC_DOMAIN is an asset host, not the backend API. */
function getProductionApiUrl(env = process.env) {
  const value = env.EXPO_PUBLIC_API_URL;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('EXPO_PUBLIC_API_URL is required for the mobile API');
  }
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || !url.hostname.includes('.') ||
      url.username || url.password || (url.pathname !== '/' && url.pathname !== '') ||
      url.search || url.hash) {
    throw new Error('EXPO_PUBLIC_API_URL must be an HTTPS origin without credentials, paths, or query parameters');
  }
  return url.origin;
}
function getProductionApiDomain(env = process.env) {
  return new URL(getProductionApiUrl(env)).host;
}
module.exports = { getProductionApiDomain, getProductionApiUrl };
if (require.main === module) {
  process.stdout.write(process.argv.includes('--url') ? getProductionApiUrl() : getProductionApiDomain());
}