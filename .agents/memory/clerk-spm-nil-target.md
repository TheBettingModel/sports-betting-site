---
name: Clerk SPM nil-target fix
description: @clerk/expo 3.x adds ClerkGoogleSignIn with SPM deps; RN 0.81 spm.rb crashes when the Pods project has no target matching the pod name.
---

## The Rule
`react-native@0.81.5` must be patched via `patches/react-native@0.81.5.patch` with two nil guards in `scripts/cocoapods/spm.rb`.

**Why:** `@clerk/expo` 3.x declares `ClerkGoogleSignIn` as an SPM dependency. RN 0.81's `spm.rb` calls `project.targets.find { |t| t.name == pod_name }` twice in `apply_on_post_install` — both can return nil because the Pods project has no target named `ClerkGoogleSignIn`. This crashes `pod install` with `undefined method ... for nil:NilClass`.

**Two crash sites in spm.rb:**
1. `add_spm_to_target(project, <nil>, ...)` → line ~80: `target.package_product_dependencies` on nil → fix: `return if target.nil?` at top of `add_spm_to_target`
2. After the call: `target = project.targets.find...` → line ~34: `target.build_configurations` on nil → fix: wrap the whole workaround block in `unless target.nil?`

**How to apply:**
- Patch is at `patches/react-native@0.81.5.patch`, registered in root `package.json` under `pnpm.patchedDependencies`.
- To update the patch: edit `node_modules/.pnpm_patches/react-native@0.81.5/scripts/cocoapods/spm.rb`, then run `pnpm patch-commit 'node_modules/.pnpm_patches/react-native@0.81.5'`.
- The installed copy is a different path (contains `patch_hash=...`) — edits there are NOT reflected in the patch file.
