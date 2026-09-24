# iOS release ledger

This is a release evidence record, not an automatic deployment switch.
**Source prepared**, **Expo build finished**, **App Store Connect upload
complete**, **TestFlight available**, **submitted for review**, and **public**
are separate states. Record the exact source commit and build ID after each
step; never infer the next state from the previous one.

## Known state — 2026-09-24

| Version (build) | Source evidence | Expo binary | Apple upload | Review / public |
| --- | --- | --- | --- | --- |
| 1.0.1 (33) | Not established in this ledger | Not established here | Complete in the owner's 2026-09-23 App Store Connect screenshot | Not the current public version; review state not established here |
| 1.0.1 (34) | `d269db85d31ac6725bec783b9dbdb3a97991518e` | Finished `33e603c7-7f5e-40f3-86df-9e17ae1d15b5` | Not uploaded; legal links still targeted Replit | Not submitted |
| 1.0.1 (35) | `f83df7db037fba5aae003c45f074a5bd6d959575` | Finished `a5dcfc3f-f9a2-4fb3-a602-54d69cdd6699` | Not uploaded; reviewer email-code step missing | Not submitted |
| 1.0.1 (36) | Reviewer email-code source merged at `470ee0d7863b8b8f5eac5861b769c37e66b7d215`; final build SHA **not established** | **No build yet** | **Not uploaded** | **Not submitted** |

The current source has build number 36. That number alone does not mean an
Expo binary or Apple upload exists. Builds 34 and 35 must not be substituted
for the new reviewer-auth source. An existing public 1.0 installation still
uses the Replit `/api` compatibility bridge; preserve it until migration is
verified. See `docs/render-cutover-evidence-2026-09-23.md` for the scoped
binary, API, and database checks behind these entries.

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