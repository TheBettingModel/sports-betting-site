---
name: OTA release branch sync
description: How production over-the-air mobile updates receive source code from the dedicated GitHub release branch.
---

Production OTA updates are built from a dedicated GitHub release branch, not directly from the Replit workspace repository.

**Why:** An OTA workflow can successfully publish an older version when the workspace changes have not been mirrored to its release source. Expo rejects a local-only workspace revision as a workflow Git reference.

**How to apply:** Use the `replit-ota` branch, which contains the full monorepo and package manifests; the repository `main` branch may be a sparse source and can fail before install with no package manifest. Sync the smallest required set of files, then run the existing production OTA workflow from the resulting GitHub commit and monitor it through Expo. This path updates JavaScript and assets without an Apple submission.