---
name: OTA release branch sync
description: How production over-the-air mobile updates receive source code from the dedicated GitHub release branch.
---

Production OTA updates are built from a dedicated GitHub release branch, not directly from the Replit workspace repository.

**Why:** An OTA workflow can successfully publish an older version when the workspace changes have not been mirrored to its release source. Expo rejects a local-only workspace revision as a workflow Git reference.

**How to apply:** Before publishing a mobile OTA change, compare the changed mobile source with the release branch and sync the smallest required set of files. Then run the existing production OTA workflow from the resulting GitHub commit and monitor it through Expo. This path updates JavaScript and assets without an Apple submission.