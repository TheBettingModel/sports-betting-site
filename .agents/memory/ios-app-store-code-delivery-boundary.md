---
name: iOS App Store code-delivery boundary
description: Permanent App Store compliance decision after a Guideline 2.5.2 rejection.
---

Do not reintroduce expo-updates, CodePush, downloaded JavaScript bundles, production update channels, or any mechanism that can remotely replace executable app code after App Review. Server-driven data and content remain allowed, but feature and behavior changes must ship in a new reviewed iOS build.

**Why:** Apple rejected the app under Guideline 2.5.2 because the submitted binary included explicit remote JavaScript update capability that could change behavior after approval.

**How to apply:** Keep the OTA client package, update URL/runtime configuration, launch-time update checks, download/reload calls, and EAS update channels absent. Bump the iOS build number and use a new App Store build for every code change.