---
name: Mobile cold-launch startup gate
description: Native splash handling must fail open when optional startup work stalls.
---

The mobile root layout must never hold the native splash indefinitely on font loading or local-storage completion. After a bounded timeout, hide the splash and render the auth/navigation shell with system-font and safe-default fallbacks; auth initialization needs its own visible loading/retry state.

**Why:** A stalled native font or AsyncStorage promise previously left the app returning `null` forever, making the phone appear black while the existing Clerk timeout UI remained unreachable.

**How to apply:** Keep font/storage work out of the hard availability gate, use bounded startup timeouts, and ensure ClerkLoading renders visible progress plus a retry action. Verify both web and iOS bundle exports after changes.