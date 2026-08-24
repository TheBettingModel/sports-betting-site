---
name: Mobile publish path
description: How to distinguish a web deployment from a mobile iOS release for this project.
---

For this project, a generic project Publish can deploy the web artifacts without starting an Expo Launch session. That deployment does not make source changes available to the installed iOS app.

**Why:** The mobile app may check for Expo updates when it launches, but it can only download an update that has actually been published to its compatible production channel. A web deployment produces no such mobile release.

**How to apply:** When validating a live iOS update, check the Expo Launch session rather than inferring success from web deployment logs. Do not tell the user that a generic Publish will update their phone. Use the mobile Expo Launch flow for a new TestFlight/App Store build; ensure the iOS build number is new when submitting another build.

Managed Expo OTA workflows require the Expo project itself to be linked to a GitHub repository. Connecting GitHub to Replit alone does not create that Expo-side link.

**Why:** Expo’s managed workflow runner rejects updates with “No repository found” until the project link exists, even when the user’s GitHub connection can read the repository.

**How to apply:** Before running an OTA workflow, verify the Expo project has its repository linked. If the MCP workflow runner reports no repository, direct the owner to link the repository in Expo’s project settings, then retry the same committed workflow.

For this monorepo, use a custom EAS workflow job for OTA releases: install dependencies from the workspace root, then run `eas update` through the mobile workspace. The built-in `type: update` job runs from the repository root and cannot find the mobile app’s EAS project.

**Why:** A monorepo root has no Expo project configuration; generic working-directory settings do not change the built-in update job’s CLI location. The custom job also needs Node 20, the project’s pnpm version, and a non-interactive release message.

**How to apply:** In a managed workflow, pin the required Node and pnpm versions, run a frozen install at the root, and invoke the update via the mobile package with an explicit production branch, iOS platform, message, and non-interactive flag. Confirm the final Expo log reports both the target runtime and update group.