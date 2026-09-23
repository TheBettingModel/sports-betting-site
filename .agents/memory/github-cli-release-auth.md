---
name: GitHub CLI release authentication
description: Workspace Git authentication and non-destructive release verification when Replit's GitHub App binding is not available to Git.
---

Workspace Git push authentication can be supplied by the GitHub CLI's HTTPS credential helper after an interactive browser login with repository and workflow permissions. A connected GitHub App and a successful public `ls-remote` do not prove that workspace Git can push.

**Why:** The App showed Active while Git reported an invalid credential. After CLI browser authorization, a dry-run push to the existing `main` was rejected as non-fast-forward, but a dry-run to a new release branch succeeded. The rejection reflected divergent branch histories rather than an authorization failure.

**How to apply:** Check the CLI login in the actual workspace Shell, configure its Git helper, and verify write access with a dry-run to a new branch. Never force-push divergent `main`; verify full source and workflow coverage before treating a pushed release branch as authoritative. Do not print CLI tokens or assume a login persists after workspace restart without checking.