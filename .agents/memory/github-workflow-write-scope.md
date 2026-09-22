---
name: GitHub workflow write scope
description: GitHub connector behavior when a release tree includes Actions workflow files.
---

The GitHub connector's `repo` OAuth scope can create blobs, trees, commits, and
branches for ordinary repository files, but it cannot modify
`.github/workflows/*` without workflow-write authorization. GitHub may return
`404 Not Found` from the Git Trees endpoint rather than a clear permission
error.

**Why:** A clean release-tree upload succeeded for every normal source object
but repeatedly failed when the same tree batch contained the CI workflow. A
single-entry tree probe and a source snapshot excluding that workflow succeeded,
confirming the permission boundary.

**How to apply:** Never treat this 404 as a missing repository or invalid Git
object until the batch is checked for workflow paths. Do not call a branch
authoritative when CI was excluded. Obtain workflow-write authorization, then
create and verify the complete branch before deployment.