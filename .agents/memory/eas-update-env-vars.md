---
name: EAS Update env vars
description: eas update does NOT read env from eas.json build profiles — must pass EXPO_PUBLIC_* explicitly on the CLI or the bundle bakes in empty strings, breaking auth and API calls in production.
---

## Rule
`eas update` ignores the `env` block inside `eas.json` build profiles. Every OTA update must have the full set of `EXPO_PUBLIC_*` variables passed explicitly as shell env vars when the command runs.

**Why:** The `env` keys in `eas.json` (`build.production.env`, etc.) are only applied by `eas build`. Running `eas update` without those vars baked a bundle with empty strings for `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_DOMAIN`, `EXPO_PUBLIC_REVENUECAT_*`, etc. The production app appeared as a signed-out guest with no data on all tabs.

**How to apply:**
Always run OTA updates as:
```bash
cd artifacts/mobile && \
  EXPO_TOKEN=$EXPO_TOKEN \
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_Y2xlcmsudGhlYmV0dGluZ21vZGVsLnJlcGxpdC5hcHAk" \
  EXPO_PUBLIC_CLERK_PROXY_URL="https://thebettingmodel.replit.app/api/__clerk" \
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY="appl_gPhYovPqWcXWdzqoXKRBUKLwZSH" \
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY="goog_NbLuELjoUSqhaTbFpGZnfwZagwS" \
  EXPO_PUBLIC_REVENUECAT_TEST_API_KEY="test_NezigGAOnPwyJoHJEkVYMsLbpmu" \
  EXPO_PUBLIC_ADMIN_USER_IDS="user_3GmXMcCGzqs1c5aD1snP08e7Frx,user_3GyCCHwnYB9sIByophLiunxGtMf" \
  EXPO_PUBLIC_ADMIN_EMAILS="jacqueskaune@gmail.com" \
  EXPO_PUBLIC_DOMAIN="thebettingmodel.replit.app" \
  npx eas-cli update --channel production --message "<description>" --non-interactive
```

The `eas.json` `update` section key is also not valid and will cause `eas update` to error — do not add it.
