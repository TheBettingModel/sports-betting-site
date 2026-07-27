---
name: EAS Provisioning Profile Regeneration
description: How to force EAS to regenerate a provisioning profile when it lacks a new capability (e.g. Sign in with Apple)
---

## The problem
EAS caches the provisioning profile binary in its own remote credential storage. Even if Apple marks all profiles as "Invalid" (which happens automatically when you add a new capability to an App ID), EAS still uses its cached copy and Xcode fails with "doesn't include the com.apple.developer.applesignin entitlement".

## Fix sequence

1. **Add the capability to the App ID first** — Apple Developer Portal → Identifiers → enable the capability (e.g. Sign in with Apple). This invalidates all existing profiles in Apple's portal but EAS doesn't know yet.

2. **Delete the cached profile from EAS remote storage via GraphQL API:**
```bash
# Find the profile ID
curl -X POST https://api.expo.dev/graphql \
  -H "Authorization: Bearer $EXPO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ app { byFullName(fullName: \"@<owner>/<slug>\") { id iosAppCredentials { id iosAppBuildCredentialsList { id provisioningProfile { id developerPortalIdentifier } } } } } }"}'

# Delete it
curl -X POST https://api.expo.dev/graphql \
  -H "Authorization: Bearer $EXPO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { appleProvisioningProfile { deleteAppleProvisioningProfile(id: \"<profile-id>\") { id } } }"}'
```

3. **If EAS still can't regenerate (non-interactive ASC auth fails)** — the stored ASC API key may be missing its Apple Team link. Fix it:
```bash
# Get Apple Team EAS ID
curl -X POST https://api.expo.dev/graphql \
  -H "Authorization: Bearer $EXPO_TOKEN" \
  -d '{"query":"{ account { byName(accountName: \"<account>\") { appleTeams { id appleTeamIdentifier } } } }"}'

# Get ASC key ID
curl -X POST https://api.expo.dev/graphql \
  -H "Authorization: Bearer $EXPO_TOKEN" \
  -d '{"query":"{ app { byFullName(fullName: \"@<owner>/<slug>\") { iosAppCredentials { appStoreConnectApiKeyForSubmissions { id appleTeam { appleTeamIdentifier } } } } } }"}'

# Link the team
curl -X POST https://api.expo.dev/graphql \
  -H "Authorization: Bearer $EXPO_TOKEN" \
  -d '{"query":"mutation { appStoreConnectApiKey { updateAppStoreConnectApiKey(id: \"<key-id>\", appStoreConnectApiKeyUpdateInput: { appleTeamId: \"<team-eas-id>\" }) { id } } }"}'
```

4. **Fire the build** — EAS will create a brand-new profile that includes all current App ID capabilities.

## Things that do NOT work
- `eas build --clear-credentials` — flag does not exist in current EAS CLI
- `autoCredentials: true` in eas.json — not a valid field, causes validation error
- Setting `EXPO_ASC_API_KEY_PATH/KEY_ID/ISSUER_ID` env vars — ignored when EAS already has a stored ASC key in its credential service
- Revoking profiles in Apple Developer Portal manually — EAS uses its own cached binary, not Apple's portal directly

**Why:** EAS stores credentials (profile binary + ASC key) in its own cloud DB. The `credentialsSource: "remote"` setting means EAS reads from that DB, not Apple's portal. Deleting from the EAS DB forces a fresh fetch/create cycle.
