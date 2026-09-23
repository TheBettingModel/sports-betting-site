---
name: OpenAPI spec sync requirement
description: Every new API route must be added to lib/api-spec/openapi.yaml or the mobile app cannot use it — and the build succeeds silently with broken features.
---

# OpenAPI Spec Sync Requirement

## The rule
Any new route added to `artifacts/api-server/src/routes/` must also be added to `lib/api-spec/openapi.yaml`. After editing the spec, run `pnpm --filter @workspace/api-spec run codegen` to regenerate the typed hooks in `lib/api-client-react/src/generated/`.

**Why:** The mobile app's data-fetching hooks (`useGetGamesToday`, `useGetResultsSummary`, etc.) are entirely code-generated from the spec. A route that exists in the server but not the spec simply has no hook — the mobile app can never call it. Worse, if a component imports a hook that wasn't generated, Metro bundles it as `undefined` and the component crashes at runtime without a build-time error.

## How to apply
- After adding any route to the API server, immediately add a matching path + response schema to `lib/api-spec/openapi.yaml`.
- Run codegen and confirm the new hook appears in `lib/api-client-react/src/generated/api.ts` before committing.
- Response body shape must match exactly — optional fields not in `required[]` are typed as `T | undefined` in the generated interface.

## Cases that burned us
1. `homeTeamLogo` / `awayTegoLogo` — fields existed in DB and API response but were absent from the spec, so the generated `GameProjection` interface didn't include them and the mobile app always rendered badge fallbacks.
2. `/api/results/summary` — route existed and worked, but had no spec entry, so `useGetResultsSummary` was never generated; the Results tab crashed on launch.

## EAS build number
Must be incremented in `artifacts/mobile/app.json` (`expo.ios.buildNumber`) before each new TestFlight submission. Apple rejects duplicate build numbers even across separate EAS build IDs.

## EAS CLI on Replit
Run via `pnpm exec eas` from `artifacts/mobile/` (not the global install). Global `eas-cli` uses a bundled `@expo/config-plugins` that conflicts with the project's Clerk plugin and throws `Cannot find module '@expo/config-plugins'` on `eas update`.
