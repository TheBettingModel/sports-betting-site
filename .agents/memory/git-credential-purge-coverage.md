---
name: Git credential purge coverage
description: Replit-specific reachable refs and alias scans required for complete credential-history remediation.
---

Credential history cleanup must include `refs/replit/agent-ledger`, not only branches, tags, and remote-tracking refs. Scan for path aliases and credential configuration-key aliases after each rewrite; removing known filenames alone can leave renamed copies or hardcoded key configuration reachable.

**Why:** Initial path rewrites left blobs reachable through the agent-ledger ref, then revealed older filename aliases and two historical local-key configuration conventions.

**How to apply:** Inventory every ref with `git for-each-ref`, rewrite all affected refs, scan `git rev-list --objects --all`, use pickaxe/grep checks for key configuration aliases, and verify the actual remote separately from the local remote-tracking ref.