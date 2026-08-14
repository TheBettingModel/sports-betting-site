---
name: OTA Update fix for RN 0.81
description: eas update fails with hermesc private-class-fields error on RN 0.81; two fixes required.
---

# OTA Update (eas update) broken on RN 0.81 — fix required

## The rule
Any `eas update` run from this workspace needs two config changes in place or it will fail with hermesc "private properties are not supported".

## Why
React Native 0.81 added `src/private/webapis/geometry/DOMRectReadOnly.js` which uses private class fields (`#x`, `#y`, `#width`, `#height`). The Linux `hermesc` binary bundled with the RN npm package does not support native private class fields. Expo's default `hermes-stable` transform profile tells Babel to skip downleveling them (assumes Hermes handles it natively), but the local binary can't compile them.

## How to apply
Both of these must be in place before running `eas update`:

1. **`artifacts/mobile/package.json`** — pin `babel-preset-expo` as a direct dependency at the SDK-matched version:
   ```json
   "babel-preset-expo": "54.0.12"
   ```
   Do NOT install the latest (`^57.x`) — that version breaks the Hermes compiler in a different way (different private-field handling).

2. **`artifacts/mobile/metro.config.js`** — override the transform profile:
   ```js
   config.transformer = {
     ...config.transformer,
     unstable_transformProfile: 'default',
   };
   ```
   The `default` profile forces Babel to fully downlevel private class fields before hermesc sees them.

Without fix #1, Metro's transform worker can't find `babel-preset-expo` and throws "Cannot find module".
Without fix #2, private class fields reach hermesc unmodified and the compiler errors out.

Both fixes are already applied as of 2026-08-14.
