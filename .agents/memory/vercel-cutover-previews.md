---
name: Vercel cutover previews
description: Source-export and access requirements for validating protected Vercel branch previews.
---

A Vercel monorepo preview must contain the target artifact and every referenced workspace package on the deployed Git branch. A build-ready preview is not runtime-verified when Vercel Authentication protects non-custom domains.

**Why:** The cutover branch initially contained backend source but omitted the admin artifact and its shared API client. After the build became ready, team SSO still intercepted the preview and API proxy before application code ran.

**How to apply:** Verify branch tree completeness before debugging Vercel paths. Build from repository root when shared workspace packages are required. For protected previews, use a project-scoped automation bypass secret through the approved secrets flow; never disable protection or move the production alias merely to test.