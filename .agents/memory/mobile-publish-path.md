---
name: Mobile publish path
description: How to distinguish a web deployment from a mobile iOS release for this project.
---

For this project, a generic project Publish can deploy the web artifacts without starting an Expo Launch session. That deployment does not make source changes available to the installed iOS app.

**Why:** The mobile app may check for Expo updates when it launches, but it can only download an update that has actually been published to its compatible production channel. A web deployment produces no such mobile release.

**How to apply:** When validating a live iOS update, check the Expo Launch session rather than inferring success from web deployment logs. Do not tell the user that a generic Publish will update their phone. Use the mobile Expo Launch flow for a new TestFlight/App Store build; ensure the iOS build number is new when submitting another build.