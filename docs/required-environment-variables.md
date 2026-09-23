# Required environment variable names

No values belong in this document.

## API

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `CORS_ALLOWED_ORIGINS`
- `TRUST_PROXY_HOPS`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_PROXY_URL`
- `SESSION_SECRET`
- `MASTER_API_KEY`
- `ODDS_API_KEY`
- `CFBD_API_KEY`
- `SLACK_LIVE_API_KEY`
- `REVENUECAT_WEBHOOK_SECRET`
- `SCHEDULER_ENABLED`
- `SCHEDULER_TIMEZONE`
- `PUBLICATION_ENABLED`
- `MLB_MODEL_MODE`
- `NCAAF_MODEL_MODE`
- `APP_REVIEW_USER_IDS` (optional, server-only comma-separated Clerk user IDs)

## Admin

- `VITE_API_BASE_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_CLERK_PROXY_URL`

## Mobile

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_CLERK_PROXY_URL`
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY`
- `EXPO_PUBLIC_ADMIN_USER_IDS`
- `EXPO_PUBLIC_ADMIN_EMAILS`
- `EXPO_PUBLIC_DOMAIN`

Define mobile values in EAS environment management for each build profile.
App Store Connect submission identity also belongs in EAS account/project
configuration and is intentionally absent from source.