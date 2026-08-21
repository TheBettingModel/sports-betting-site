---
name: EAS Update env vars
description: eas update does NOT read env from eas.json build profiles — must pass EXPO_PUBLIC_* explicitly on the CLI or the bundle bakes in empty strings, breaking auth and API calls in production.
---

## Rule
`eas update` ignores the `env` block inside `eas.json` build profiles. Every OTA update must have the full set of `EXPO_PUBLIC_*` variables passed explicitly as shell env vars when the command runs.

For user-visible JavaScript changes in the installed app, publish the matching
production OTA update in addition to the API deployment. A server deployment
cannot add new client refresh behavior to an app that is already installed.

**Why:** The `env` keys in `eas.json` (`build.production.env`, etc.) are only applied by `eas build`. Running `eas update` without those vars baked a bundle with empty strings for `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_DOMAIN`, `EXPO_PUBLIC_REVENUECAT_*`, etc. The production app appeared as a signed-out guest with no data on all tabs.

Installed builds check for this compatible update when they open, making an OTA
the prompt delivery path without requiring a new App Store binary.

**How to apply:**
Before publishing an OTA update, source the full production `EXPO_PUBLIC_*` set
from the trusted workspace configuration and Replit secrets flow. Do not copy
those values into agent memory, chat, or scripts. Then publish to the
production EAS channel with a descriptive message.

The `eas.json` `update` section key is also not valid and will cause `eas update` to error — do not add it.
