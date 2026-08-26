---
name: Expo Metro monorepo watch boundaries
description: Stable Metro watch configuration for this pnpm Expo artifact.
---

Metro must watch the mobile project, its imported workspace sources, and the
workspace root `node_modules`, rather than the entire workspace.

**Why:** The workspace includes transient tooling directories that may disappear
during Metro's initial scan, which can terminate the watcher. pnpm also resolves
Expo packages through real paths under the root `node_modules`, so omitting that
stable directory can leave the web preview unable to serve its entry bundle.

**How to apply:** When changing the mobile Metro configuration, keep watch
folders limited to the mobile project, any directly imported workspace package
sources, and root `node_modules`. Do not restore a repository-wide watch folder.