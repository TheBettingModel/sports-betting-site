/** Backend configuration is independent of Replit's app/asset hosting domain. */
export function normalizeApiUrl(value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error('EXPO_PUBLIC_API_URL is required for the mobile API');
  }
  const url = new URL(value.trim());
  if (
    url.protocol !== 'https:' ||
    !url.hostname.includes('.') ||
    url.username || url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search || url.hash
  ) {
    throw new Error('EXPO_PUBLIC_API_URL must be an HTTPS origin without credentials, paths, or query parameters');
  }
  return url.origin;
}

export function resolveApiBaseUrl(
  apiUrl: string | undefined,
  platform: string,
  development: boolean,
  previewDomain?: string,
): string {
  const productionUrl = normalizeApiUrl(apiUrl);
  // Preserve the existing authenticated development-only web read-through.
  if (platform === 'web' && development && previewDomain) {
    return normalizeApiUrl(`https://${previewDomain}`);
  }
  return productionUrl;
}
