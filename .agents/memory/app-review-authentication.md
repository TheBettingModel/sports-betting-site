---
name: App Review authentication
description: Security boundary for App Store reviewer credentials and full-feature access.
---

App Review access must use a real Clerk password session and an immutable Clerk subject that the API recognizes as entitled. Credentials belong only in secure configuration and App Store Connect, never in source or public Expo variables.

**Why:** Apple reviewers cannot complete email OTP without inbox access, while hardcoded demo credentials or client-side subscription flags create an extractable production bypass.

**How to apply:** Keep the visible reviewer password path compatible with normal Clerk authentication. Grant full access only after JWT verification through owner status, an active subscription, or a server-only reviewer subject allowlist. Verify the real password, Clerk session issuance, and a protected API response before each submission.