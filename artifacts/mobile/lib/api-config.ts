import { Platform } from 'react-native';
import { normalizeApiUrl, resolveApiBaseUrl } from './api-url';

// Direct process.env reads are required for Expo's build-time substitution.
export const PRODUCTION_API_URL = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
export const API_BASE_URL = resolveApiBaseUrl(
  process.env.EXPO_PUBLIC_API_URL,
  Platform.OS,
  __DEV__,
  process.env.EXPO_PUBLIC_PREVIEW_API_DOMAIN,
);

// Preserve web-preview authentication; native builds always proxy through the
// explicitly configured backend, never Replit's automatically injected domain.
export const CLERK_PROXY_URL = process.env.EXPO_PUBLIC_CLERK_PROXY_URL ||
  (Platform.OS === 'web' && __DEV__ ? undefined : `${PRODUCTION_API_URL}/api/__clerk`);
