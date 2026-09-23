# Apple Signing Credential Remediation — 2026-09-04

## 1. Executive summary

#223D completed the **local repository-side** remediation for a pre-existing Apple signing credential incident while preserving the completed #223C NCAAF V4 pipeline.

The current worktree and every locally reachable Git ref are free of the confirmed credential artifacts, historical aliases, private-key markers, and local App Store Connect key configuration. Prevention rules and an automated regression check are present in the working tree.

Replit's checkpoint system automatically advanced `gitsafe-backup/main` to the sanitized rewritten history. It also created a protected `main-old-20260904-*` safety branch that retains the contaminated history. A normal Git deletion was attempted and rejected by the remote pre-receive policy because only pushes to `main` are allowed.

Apple-side revocation/rotation and post-rotation EAS signing access also remain unconfirmed.

**Decision: C — local and remote `main` remediation succeeded, but the protected contaminated remote safety branch and Apple rotation requirements block release.**

## 2. Incident discovery

The incident was discovered during #223C release review. Apple signing files had been committed before #223C, and temporary unauthenticated download routes had existed for certificate/profile material.

#223C removed the runtime download routes. #223D inventoried and removed the underlying repository exposure.

## 3. Credential inventory — sanitized

Ten unique repository paths were confirmed across current or historical Git state:

1. Attached App Store Connect private key (`.p8`)
2. Attached Apple distribution certificate/private-key archive (`.p12`)
3. Attached public distribution certificate (`.cer`)
4. Historical API-server distribution archive (`.p12`)
5. Historical API-server provisioning profile
6. Historical mobile Expo credentials manifest
7. Historical mobile distribution archive (`.p12`)
8. Historical mobile provisioning profile
9. Historical mobile App Store Connect private-key alias (`.p8`)
10. Historical root distribution archive alias (`.p12`)

These paths represented at least two private credential classes:

- App Store Connect API private key, sanitized identifier `T9…49S`
- Apple distribution certificate/private key

Provisioning profiles, a public certificate, and an Expo credentials manifest were also exposed. No credential contents were read into this report.

## 4. Exposure scope

Before remediation:

- Current worktree present: yes
- Currently tracked: yes, three attached artifacts
- Historically tracked: yes, ten unique paths
- Present in multiple commits: yes for distribution/profile/manifest copies
- Present on remote history: yes
- Used by iOS signing/submission: configuration indicated App Store Connect submission and local signing artifacts
- Active/revoked state: unknown; no revocation was inferred from age

## 5. Current-tree exposure

**PASS locally.**

The current filesystem contains no:

- `.p8`
- `.p12`
- `.cer`
- `.mobileprovision`
- `credentials.json`

An ignored mobile-local `.p8` copy discovered during remediation was deleted without reading its contents.

## 6. Historical exposure

**PASS for locally reachable history.**

The rewrite removed:

- all ten confirmed credential paths;
- historical filename aliases;
- historical App Store Connect key ID, issuer, and path configuration;
- both known ASC-prefixed and Apple-prefixed local-key configuration conventions;
- old EAS credential-file un-ignore references.

Independent scans found no reachable private-key marker.

## 7. Remote exposure

**PARTIAL / release-blocking remote ref remains.**

- Sanitized actual remote ref: `gitsafe-backup/main`
- Actual sanitized remote HEAD: `286740a`
- Protected contaminated ref: `main-old-20260904-e3388ae…`
- Sanitized local HEAD at security checkpoint: `286740a`
- Tags affected: none

The checkpoint system pushed sanitized `main` automatically; no manual force-push was issued. Deletion of the contaminated safety branch was rejected by the `gitsafe` pre-receive hook with “Only pushes to main branch are allowed.”

The remote provider may retain unreachable objects even after the protected branch is removed; verification can prove removal from reachable refs, not immediate physical garbage collection.

## 8. #223C preservation

**PASS.**

Before rewriting history, a sanitized backup was created outside repository history:

- Location: `/tmp/223c-sanitized-source-backup-20260904.tar.gz`
- Size: 76,256,904 bytes
- Tracked source files: 1,160
- Credential artifacts included: none
- Restore test: passed

Core #223C files were checksum-compared against the restored backup after the final rewrite and matched exactly.

## 9. History rewrite method

`git-filter-repo` 2.47.0 was used deterministically.

The rewrite proceeded in three verified stages:

1. Remove the eight initially confirmed credential paths.
2. Remove the two additional historical path aliases and sanitize the Replit agent-ledger ref.
3. Remove historical ASC-prefixed and Apple-prefixed local-key configuration aliases.

No application model logic was rewritten.

## 10. Rewritten refs

Locally rewritten refs included:

- `refs/heads/main`
- `refs/heads/replit-agent`
- all present `refs/heads/subrepl-*` refs
- local `refs/remotes/gitsafe-backup/main`
- `refs/replit/agent-ledger`

The server-side `main` ref was updated automatically by Replit's checkpoint system. The checkpoint-created `main-old-20260904-*` branch still references the old graph and was not removable with normal repository Git permissions.

## 11. Local history verification

**PASS.**

Verification covered every locally reachable ref:

- Credential path scan: pass
- App Store Connect configuration scan: pass
- ASC-prefixed key path/ID/issuer pickaxe scans: pass
- Apple-prefixed key path/ID/issuer pickaxe scans: pass
- Private-key marker scans: pass
- `refs/original` / `refs/replace` retention: none

## 12. Current-tree verification

**PASS.**

The current diff is limited to:

- root credential ignore rules;
- mobile credential ignore hardening;
- removal of local App Store Connect key submission configuration;
- package-level security-check command;
- credential regression script.

No NCAAF model or #223C product source file is changed by #223D.

## 13. `.gitignore` protections

**PASS.**

Root protections now ignore:

- `*.p8`
- `*.p12`
- `*.cer`
- `*.mobileprovision`
- `credentials.json`

The mobile ignore file no longer re-allows distribution archives, provisioning profiles, or Expo credentials manifests.

## 14. Secret regression safeguards

**PASS.**

`pnpm run security:signing-credentials` checks:

- dangerous tracked credential filenames;
- dangerous ignored/untracked credential files in the repository worktree;
- committed local App Store Connect key configuration under both known naming conventions.

The check reports paths only and never reads or prints credential contents.

## 15. Apple-side rotation requirements

Rotation is mandatory because Git removal does not invalidate credentials.

Required:

1. Revoke the exposed App Store Connect API key.
2. Create a replacement App Store Connect API key if submission automation still requires one.
3. Revoke/rotate the exposed Apple distribution certificate/private key.
4. Regenerate provisioning profiles that depended on the revoked distribution certificate.
5. Store replacements only through Apple, EAS remote credentials, Replit Secrets, or another approved credential manager.

## 16. Apple-side rotation confirmation

**NOT CONFIRMED.**

No Apple-side mutation was attempted or claimed. Interactive owner access is required.

The owner must confirm that:

- the exposed App Store Connect key is revoked/deleted;
- the affected distribution certificate is revoked;
- replacement certificate/profile material is active;
- replacement submission authentication is configured.

No private key, certificate password, or replacement secret should be pasted into chat.

## 17. Expo/EAS credential architecture

The production mobile build profile uses:

- `credentialsSource: remote`
- EAS-managed/remote production signing
- Expo project ID configured in app metadata

Before remediation, the submission profile also referenced a local App Store Connect key ID, issuer, and `.p8` path. Those local-key fields are removed in the current working tree and sanitized from local history.

## 18. Replacement signing verification

**PENDING OWNER ACTION.**

Recent iOS production builds, including build number 28, completed successfully before rotation. This proves the prior remote EAS signing path worked; it does not prove replacement credentials exist or that compromised credentials are revoked.

After rotation, verification must confirm:

- correct Apple team association;
- valid replacement distribution certificate;
- valid regenerated provisioning profile;
- valid replacement App Store Connect submission authentication;
- successful post-rotation EAS production iOS signing.

## 19. #223C restoration

**PASS.**

Preserved capabilities include:

- dynamically today-only Eastern game-day behavior;
- frozen NCAAF V4 inference;
- FBS domain and identity bridge;
- market identity safety;
- append-only prediction and market evidence;
- owner/admin today board;
- subscriber-safe mobile surface;
- performance caches;
- preview/publication safeguards.

## 20. Model immutability verification

- Model: `tbm-ncaaf-v4-expected-score`
- Version: `D-simple-expected-score-linear`
- Configuration hash: `212a6c78431a181821106721877155745724d3619ec63cf5424f098b07f9ae86`
- Parameter hash: `792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81`
- Model status: `V4_PREVIEW`
- Approval status: `UNVALIDATED`
- Publication status: `PREVIEW_ONLY`

Model hashes and core files are unchanged.

## 21. Today-only verification

**PASS.**

- Current date source: `America/New_York`
- Current Eastern date: `2026-09-04`
- Scheduler ESPN date observed: `20260904`
- September 5 or later NCAAF fetches observed: none
- Tomorrow schedule/forecast/persistence: disabled
- Explicit-date diagnostics: retained without normal future persistence

## 22. Tests

**PASS.**

- API test files: 71 passed
- API tests: 438 passed
- Signing-credential regression check: passed
- #223C core backup checksum comparison: passed
- Reachable-history credential scans: passed

## 23. Typechecks

- API: PASS
- Admin: PASS
- Mobile: PASS
- Shared/generated libraries: PASS from #223C final validation

## 24. Builds

- API production build: PASS
- Admin production build: PASS
- Mobile iOS static production bundle: PASS
- Mobile Android static production bundle: PASS
- Native iOS signing validation: `BLOCKED_PENDING_APPLE_ROTATION`

The static mobile bundle does not prove replacement Apple signing access.

## 25. Current-day NCAAF verification

Fresh #223D live snapshot:

- Eastern date: `2026-09-04`
- Scheduled: 8
- Model eligible: 5
- Out of domain: 3
- Identity unresolved: 0
- V4 forecasts: 5
- Safe market matches: 2
- Unmatched markets: 3
- No current market: 2
- Stale market: 1
- Ambiguous market: 0
- Projected opportunities: 1
- PIT violations: 0
- Market leakage violations: 0
- Invalid probabilities: 0
- Warm response: approximately 66 ms

The earlier #223C report correctly recorded 2 opportunities at its earlier market snapshot. The later count of 1 reflects changing market evidence; immutable sports forecasts and model hashes did not change.

## 26. Force-push details

**AUTOMATIC MAIN UPDATE; MANUAL CLEANUP BLOCKED.**

Replit's checkpoint system automatically updated remote `main` to sanitized commit `286740a`. No manual force-push was run.

A remote deletion was attempted only for the contaminated `main-old-20260904-*` safety branch. The server rejected it because its pre-receive hook permits pushes only to `main`.

Repository/platform administration must remove that protected old branch. Do not blindly force-push all branches or tags.

## 27. Remote verification

Current status:

- Sanitized local branch exists: yes
- Actual remote `main` sanitized: yes
- Sanitized commit reachable remotely: yes
- Independent clone of remote `main`: clean
- Protected old remote branch still contaminated: yes
- Overall remote reachable-history gate: fail

After the protected old branch is removed:

1. Fetch remote refs into a clean temporary namespace.
2. Verify expected sanitized HEAD.
3. Search reachable remote branch history for every credential path and key-configuration alias.
4. Confirm old credential-bearing commits are no longer reachable from retained remote branches/tags.
5. Do not claim remote object garbage collection.

## 28. Collaborator recovery instructions

Because sanitized history is already on remote `main`:

1. Preserve legitimate unpushed work as patches outside the old clone.
2. Prefer a fresh clone of the sanitized repository.
3. Do not merge, rebase, or push old contaminated history into the clean repository.
4. Reapply only reviewed legitimate patches.
5. Re-run `pnpm run security:signing-credentials`.

## 29. Deployment

**NOT PERFORMED.**

API/admin web deployment technically does not require Apple signing. Native iOS build/submission does.

The incident instructions correctly prohibit bypassing the security gate simply because web deployment is technically possible. No force-push, Replit Publish operation, native build submission, or App Store release occurred.

## 30. Production verification

**NOT PERFORMED.**

Production remains on the prior application state:

- New V4 production API: not deployed
- Admin V4 board: not deployed
- Subscriber V4 surface: not deployed
- Production schema: not published

No production tomorrow request was made.

## 31. Remaining limitations

1. Apple-side revocation/rotation is unconfirmed.
2. Post-rotation EAS signing/submission access is unverified.
3. The protected remote `main-old-20260904-*` branch still exposes the old reachable history.
4. Normal Git deletion of that branch is blocked by the `gitsafe` pre-receive policy.
5. The incident report and durable remediation note remain uncommitted at the reporting checkpoint.
6. Dependency audit metadata reports 32 high-severity counts but supplies no corresponding high-severity records for triage.
7. Two pre-existing mobile static-server filesystem-read SAST findings remain separate general-hardening work; they are not caused by or blockers to local credential eradication.

## 32. Next task

Resume #223D only after the owner completes and confirms Apple-side rotation and the protected contaminated remote branch can be removed.

Then:

1. Revoke the exposed App Store Connect key.
2. Revoke/rotate the exposed distribution certificate and regenerate provisioning material.
3. Verify replacement EAS credentials and a post-rotation iOS production build.
4. Have repository/platform administration delete `main-old-20260904-*`.
5. Re-run local and remote credential/history scans.
6. Commit any remaining #223D report/memory changes.
7. Verify remote reachability is clean.
8. Publish API/admin/schema changes.
9. Verify the production today-only NCAAF V4 preview pipeline.

Do not begin #224. Do not promote V4 or change the production champion.
