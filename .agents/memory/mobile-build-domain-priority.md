---
name: Mobile build script domain priority
description: build.js must check EXPO_PUBLIC_DOMAIN before REPLIT_DEV_DOMAIN, or production OTA bundles bake in the dev domain
---

## Rule
`artifacts/mobile/scripts/build.js` `getDeploymentDomain()` must check `EXPO_PUBLIC_DOMAIN` **first**, before `REPLIT_INTERNAL_APP_DOMAIN` and `REPLIT_DEV_DOMAIN`.

`REPLIT_DEV_DOMAIN` is always set in the Replit environment, so if it is checked first it wins over any explicitly configured production domain.

**Why:** The production OTA bundle was baking in the ephemeral `.worf.replit.dev` dev domain instead of `https://thebettingmodel.replit.app`. Every API call (picks, subscription sync, push tokens) was hitting the dev server, which has no uptime guarantees.

**How to apply:** The correct order in `getDeploymentDomain()` is:
1. `EXPO_PUBLIC_DOMAIN` — explicit per-profile value from `eas.json`
2. `REPLIT_INTERNAL_APP_DOMAIN` — Replit internal routing fallback
3. `REPLIT_DEV_DOMAIN` — last resort for local dev only

Also: `EXPO_PUBLIC_DOMAIN=thebettingmodel.replit.app` must be set as a Replit shared env var so the build picks it up at OTA-build time (eas.json env block is only read during EAS native builds, not custom `node scripts/build.js` OTA builds).

Existing App Store binaries that were built with the dev domain cannot be repaired with an OTA published for a newer `appVersion` runtime. They need a native App Store release that targets the production domain before later OTAs can update them.

**Why:** Their Record screen can look internally consistent while reading the development database, which diverges from the production database that the live app is supposed to report.

**How to apply:** Before release, query `/api/results/summary` on both domains and verify the production bundle uses `thebettingmodel.replit.app`; after release, verify the installed build’s reported figures match the production endpoint.

Metro port was also changed from 8081 → 8083 in `build.js` to avoid collision with the mockup-sandbox workflow that occupies 8081.
