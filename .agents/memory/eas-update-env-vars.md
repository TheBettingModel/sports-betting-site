---
name: EAS Update env vars
description: eas update does NOT read env from eas.json build profiles — must pass EXPO_PUBLIC_* explicitly on the CLI or the bundle bakes in empty strings, breaking auth and API calls in production.
---

## Rule
`eas update` ignores the `env` block inside `eas.json` build profiles. Every OTA update must have the full set of `EXPO_PUBLIC_*` variables passed explicitly as shell env vars when the command runs.

For user-visible JavaScript changes in the installed app, publish the matching
production OTA update in addition to the API deployment. A server deployment
cannot add new client refresh behavior to an app that is already installed.

When the app uses an app-version runtime policy, every installed App Store
version needs an update with its exact runtime version. Inspect the production
channel before publishing; publish compatible bundles for each live runtime,
then restore the source app version for the pending store release.

**Why:** The `env` keys in `eas.json` (`build.production.env`, etc.) are only applied by `eas build`. Running `eas update` without those vars baked a bundle with empty strings for `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_DOMAIN`, `EXPO_PUBLIC_REVENUECAT_*`, etc. The production app appeared as a signed-out guest with no data on all tabs.

Installed builds check for this compatible update when they open, making an OTA
the prompt delivery path without requiring a new App Store binary.

**How to apply:**
Before publishing an OTA update, source the full production `EXPO_PUBLIC_*` set
from the trusted workspace configuration and Replit secrets flow. Do not copy
those values into agent memory, chat, or scripts. Then publish to the
production EAS channel with a descriptive message.

The `eas.json` `update` section key is also not valid and will cause `eas update` to error — do not add it.

For the managed monorepo workflow, load the production environment object from
the mobile `eas.json` at runtime and pass it directly to the spawned
`eas update` process. Do not print or serialize individual values in workflow
logs.

**Why:** The workflow-level `environment: production` does not apply the
`eas.json` build-profile environment to a custom OTA job. A release can report
success while its bundle lacks the production API base URL and renders empty
data.

**How to apply:** Keep the environment transfer inside the workflow’s Node
child-process invocation, publish directly to the production channel, and
verify a fresh production API call returns the expected games before declaring
the mobile empty state resolved.

## Runtime coverage gate

An EAS channel does not bridge runtime versions: a successful OTA publication
only serves devices whose runtime exactly matches that bundle. Release
verification must query the production manifest once for every supported
installed runtime, not only the newest native build.

**Why:** A single production channel contained active 1.0.0 and 1.0.1 iOS
installs. Publishing only the newer runtime left older users on an earlier,
broken bundle even though the workflow reported success.

**How to apply:** Keep the supported-runtime list explicit in the OTA release
workflow, publish the same JavaScript update to each compatible runtime, and
fail the release if the primary runtime is not represented. Add a new runtime
to that set when a compatible native build ships; retire an older runtime only
after its installed population is no longer supported.

This approach has been verified in practice: after publishing an
environment-complete bundle to each matching runtime, an existing App Store
install received the OTA and matched the web preview.
