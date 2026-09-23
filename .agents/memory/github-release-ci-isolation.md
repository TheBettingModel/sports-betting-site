---
name: GitHub release CI isolation
description: Safe database and verification boundaries for the release pull request's clean GitHub Actions runner.
---

Full API tests in GitHub Actions require a disposable PostgreSQL instance and a test schema, not a URL to a production or development Neon database. Keep the database limited to the CI job and fix subsequent test failures on their merits instead of bypassing the suite.

**Why:** Clean Actions runners have no database URL; many tests import the database client at module load, failing before assertions. Local Replit checks have an existing database and dependency tree, so they do not prove the clean runner will pass. A fake URL only moves the failure to connection time.

**How to apply:** Provision an ephemeral CI-only Postgres service, push the schema into that isolated database, and rerun the full suite. Do not inject shared application database credentials into GitHub Actions just to satisfy tests. When GitHub CLI's PR edit command reports a Projects-classic GraphQL error, check whether the edit actually applied; use GitHub's REST pull-request PATCH for description changes if it did not.

In a clean pnpm runner, a filtered package cannot rely on locally hoisted CLI tools. Declare a CLI as a direct development dependency of the package that invokes it, or invoke a tool already declared by the correct workspace package.

**Why:** A database guard-install command worked in the Replit workspace but the clean Actions runner could not find its TypeScript runner. Local transitive binaries hid the undeclared tool dependency.

**How to apply:** Check package ownership before adding a CI command; verify the command on a clean runner. Preserve the append-only trigger assertion rather than suppressing the guard installation step.