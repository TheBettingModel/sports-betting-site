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

The App Store iOS build on the production channel uses runtime `1.0.1`. An OTA published for runtime `1.0.0` succeeds in Expo but is deliberately ignored by that installed binary.

**Why:** Expo Updates only applies bundles whose runtime version matches the native app. App version/build number alone does not make an OTA compatible.

**How to apply:** Before publishing, compare the latest production iOS build’s runtime in Expo with the runtime declared in the mobile app configuration. Keep them equal, and confirm the publish log reports that same runtime.

Expo’s initial workflow-start response can display a stale commit even when an exact Git ref was accepted. Treat the subsequent workflow details and final publish log as authoritative.

**Why:** The start response may reflect the last resolved branch snapshot, while `workflow_info` and the publish output identify the commit that was actually checked out and uploaded.

**How to apply:** When publishing an OTA from a newly updated ref, verify the workflow’s `gitCommitHash` and the final `Commit` line in the publish log before deciding whether the release contains the intended UI change.

If the release branch is stale, first sync the intended mobile source and its required workspace lock/API inputs into that branch, then publish from the resulting exact commit. A successful workflow from the old branch can otherwise leave the installed app unchanged.

**Why:** Expo can successfully publish a valid update while the app still appears unchanged when the workflow checked out an older release-branch snapshot.

**How to apply:** Treat a matching source commit as part of OTA validation, not just workflow success; after publication, force-close and relaunch the app twice so the downloaded bundle is applied.