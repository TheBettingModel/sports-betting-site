# iOS release ledger

This is a release evidence record, not an automatic deployment switch.
**Source prepared**, **Expo build finished**, **App Store Connect upload
complete**, **TestFlight available**, **submitted for review**, and **public**
are separate states. Record the exact source commit and build ID after each
step; never infer the next state from the previous one.

## Known state — 2026-09-24

| Version (build) | Source evidence | Expo binary | Apple upload | Review / public |
| --- | --- | --- | --- | --- |
| 1.0.1 (33) | Expo build record identifies source `29db4806bcae6bf1b5d1a7723fe63553a04886de`; owner-installed IPA contains legacy Replit host, not direct Render | Finished `c061c4d1-b692-4c5e-9f7d-25dd8d46c623` | Complete in the owner's 2026-09-23 App Store Connect screenshot; owner received TestFlight availability email and installed it | Games reports "Unable to verify Pro access" and spins; signed-in subscription status failure not yet diagnosed. Not a review candidate |
| 1.0.1 (34) | `d269db85d31ac6725bec783b9dbdb3a97991518e` | Finished `33e603c7-7f5e-40f3-86df-9e17ae1d15b5` | Not uploaded; legal links still targeted Replit | Not submitted |
| 1.0.1 (35) | `f83df7db037fba5aae003c45f074a5bd6d959575` | Finished `a5dcfc3f-f9a2-4fb3-a602-54d69cdd6699` | Not uploaded; reviewer email-code step missing | Not submitted |
| 1.0.1 (36) | Reviewer email-code source merged at `470ee0d7863b8b8f5eac5861b769c37e66b7d215`; final build SHA **not established** | **No matching Expo build identified** | **No build 36 upload established** | **Not submitted** |
| 1.0.1 (10), 2026-09-24 Launch | Source SHA **unknown**; attached build-10 IPA lacks the configured Render hostname and reviewer-code flow text | Owner confirms IPA came from Replit's republish screen used for the App Store upload; Expo Launch workflow `01a0d385-30be-77e7-befb-156f51a0c8f8` reported SUCCESS, but its returned record has no build ID or IPA linkage | Owner's App Store Connect screenshot at 9:16 AM ET shows **1.0.1 (10) Processing**, not 36 | **Not a release candidate. Do not submit for Apple review.** |

The current source has build number 36, but the observed Launch upload is
number **10**. The owner-supplied build-10 IPA identifies as
`app.replit.thebettingmodel` / `1.0.1 (10)` (SHA-256
`4c209470c13a0df9f6c09041ed8ae2ca09ad679eeabe78e4b12179c4fb3bf9bf`).
Its archive integrity check passes and its embedded Expo config disables
executable updates. The Hermes bundle contains the legacy
`thebettingmodel.replit.app` hostname and `/api/__clerk`, but **no**
`tbm-api-v4-candidate.onrender.com`. It also lacks distinctive error messages
and the `review-code` stage from the current password + email-code flow,
although generic Clerk library symbols for email codes are present. These
binary observations make it unsuitable for the current release; they do not
establish its source SHA, actual runtime request destinations, or that it came
from the reported Launch run by a machine-verifiable build ID. The owner
downloaded this IPA from Replit's republish screen used for that upload; a
later Replit screenshot labels its App Store entry "Published," while the
latest Expo Launch session reports SUCCESS with no retained logs. Neither
that label nor Apple's processing state establishes Apple review approval,
TestFlight availability, or reviewer sign-in. Builds 34,
35, and 10 must not be substituted for a verified reviewer-auth binary. An
existing public 1.0 installation still uses the Replit `/api` compatibility
bridge; preserve it until migration is verified. See
`docs/render-cutover-evidence-2026-09-23.md` for the scoped binary, API, and
database checks behind these entries.

Build 33's owner-installed TestFlight delivery proves that installation works,
not that its signed-in Games request succeeds. The source of that exact Expo
build is now identified, and its downloaded IPA has a valid archive and a
bundled Replit API host. The live Replit `/api/subscriptions/status` route
currently forwards to Render and returns the expected 401 without a bearer
token; both hosts answer readiness checks. Those public probes cannot
identify why build 33's authenticated status query errors. The Games screen
renders an activity indicator even in its error state, making a persistent
request failure look like an endless load. Do not interpret that message as
proof that the owner's Pro entitlement expired, and do not disable the
server-side gate to work around it.

The owner reproduced the same build 33 error on Wi-Fi and cellular on
2026-09-24. The stored App Review credentials belong to that account, but
no authenticated diagnostic request was made: headless Clerk dev-browser
initialization was rejected before password submission. Deployment logs
did not expose a matching subscription-status failure. The HTTP result of
the installed app's authenticated request remains unknown.

The build-36 source candidate now shows recoverable Games, matchup, and
Record errors instead of indefinite loading or misleading empty states;
Record is reachable from the tab bar, with a Pro-only path for free users.
Reviewer password/email-code and purchase/restore paths were audited without
changing their security or entitlement rules. These are source-level changes,
not evidence that build 36 exists, that its binary matches this source, or
that the installed reviewer session works. The local typechecks, focused
mobile tests, and credential scans pass; GitHub CI, a matching IPA, and
real-device signed-in verification remain outstanding.

## Fill in for the next build

1. **Reviewed source:** full clean GitHub commit, passing CI run, mobile source
   tree from `node scripts/release-preflight.mjs --mobile-input-commit <SHA>`.
   If workspace inputs do not match that commit, stop and reconcile first.
2. **Expo binary:** build ID, profile `production`, iOS version/build number,
   actual source SHA from the build record, signed IPA identity, and embedded
   Render API / Clerk proxy hosts. No executable OTA delivery.
3. **Apple upload:** App Store Connect build number, processing/upload status,
   and date. Upload is not TestFlight distribution or App Review submission.
4. **Reviewer proof:** real Clerk password plus email-code sign-in from the
   dedicated review inbox, an issued session, and a 200 response from a
   protected subscriber API. Keep credentials and codes out of source and
   chat; record only pass/fail evidence and timing.
5. **Availability:** TestFlight status, Apple review submission/status, and
   public App Store version/build and date. Never label a build public merely
   because it finished in Expo or appeared in TestFlight.

If any step is unknown, write **unknown** rather than advancing the release
state. Replit Expo Launch is owner-initiated; do not submit build 35 or
remove the compatibility bridge to force progress.