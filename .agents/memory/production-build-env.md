---
name: Production build env detection
description: How to reliably detect Replit's production build environment in build.mjs, and the Clerk JS npm CDN proxy fix.
---

## Source map gating

Use `NODE_ENV === "production"` to disable source maps in production builds:

```js
sourcemap: process.env.NODE_ENV === "production" ? false : "linked",
```

**Why:** Replit's build pipeline does NOT reliably set `CI=true` during the Bundle step. `NODE_ENV=production` IS guaranteed because it's explicitly set in `artifact.toml` under `[services.production.build.env]`. Using `CI=true` causes intermittent Bundle failures (image push timeout from large .map files).

**How to apply:** Any time build.mjs or an equivalent bundler config needs to detect the production environment, key off `NODE_ENV` not `CI`.

## Clerk JS npm CDN proxy

The Clerk proxy at `artifacts/api-server/src/routes/clerk-proxy.ts` must handle BOTH:
- `/v1/*` — Clerk API calls
- `/npm/*` — Clerk JS CDN bundle (e.g. `/@clerk/clerk-js@6/dist/clerk.browser.js`)

**Why:** Without the `/npm/*` route, the app crashes on cold launch with "Failed to load Clerk JS, failed to load script: .../npm/@clerk/clerk-js@6/...".

**How to apply:** When adding new Clerk proxy routes, cover both path prefixes. The `proxyToClerk()` helper in clerk-proxy.ts handles both.
