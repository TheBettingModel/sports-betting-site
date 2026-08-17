---
name: Clerk JWKS tenant mismatch
description: Why JWT verification must always use the dev Clerk JWKS, even in production, and what went wrong when we tried to use the live tenant.
---

## The rule

`requireSubscriber.ts` JWKS URL must use the **same** Clerk tenant that the mobile app and clerk-proxy use — which is **always** the dev instance (`renewing-filly-49.clerk.accounts.dev`).

Mirror the clerk-proxy logic exactly: decode `CLERK_PUBLISHABLE_KEY`, and only use the decoded domain if it contains `.clerk.accounts.`. Otherwise fall back to the hardcoded dev JWKS URL.

```ts
if (domain && domain.includes(".clerk.accounts.")) {
  return `https://${domain}/.well-known/jwks.json`;
}
return FALLBACK_JWKS_URL; // always renewing-filly-49.clerk.accounts.dev
```

**Why:** In production, `CLERK_PUBLISHABLE_KEY` is a `pk_live_*` Replit-managed key. It decodes to `clerk.<app>.replit.app` — a Replit proxy domain that (a) doesn't contain `.clerk.accounts.`, (b) is unreachable from the deployed container, and (c) is NOT the tenant that signs the JWTs. The mobile app has `pk_test_*` baked in as a fallback, and the clerk-proxy also falls back to the same dev Clerk API when the decoded domain isn't a real Clerk accounts domain. So ALL JWTs are always signed by the dev instance.

**How to apply:** Any time the JWKS URL or Clerk tenant routing is touched, verify this invariant holds. Do NOT route to `api.clerk.com/v1/jwks` with the secret key — that fetches live tenant keys, which won't match dev-signed tokens and causes `JWKSNoMatchingKey` errors.
