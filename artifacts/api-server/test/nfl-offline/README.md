# NFL offline-only test harness

Baseline: `1aa51faf0cf9896c826f4fc17c4b136420502ed2`.

From this worktree's `artifacts/api-server` directory:

```sh
node scripts/test-nfl-offline.mjs
```

Use the launcher, not the normal API startup or default full test suite.
It accepts no extra arguments and removes inherited credentials and connection
settings. Its preload blocks network connections, listeners, DNS, and subprocesses
before Vitest starts. Only Vite's pinned local esbuild compiler service may spawn;
arbitrary application subprocesses remain blocked. Setup installs the same guards inside test workers.
The dedicated resolver substitutes throwing DB/ESPN adapters before NFL modules
are evaluated and rejects startup, pipeline, proxy, and driver imports.
Unexpected blocked I/O attempts fail the suite even if application code catches
the original exception. Safety tests deliberately exercise rejection before I/O.

Only the three existing pure suites, the historical-result validation,
source-evidence and fixture-coverage suites, and the safety and cross-component
workflow suites are approved.
The existing model equations, artifacts, source test cases, and API are unchanged.
This is an accidental-side-effect guard, not an OS sandbox against hostile code.
No database-backed integration, provider capture, recovery, migration, or
historical correction is authorized by this setup.

Step 2 validation accepts parsed ESPN-shaped observations and explicit retrieval
timestamps, never a live provider. Test event IDs and example Seattle scores are
synthetic, not verified historical results. ACCEPTED means structurally consistent
regular-season final evidence; it does not attest source authenticity or authorize
persistence. A consistently wrong provider result requires an independent supplied
reference or conflicting observation to detect. Completion is bounded by retrieval,
never inferred from elapsed game duration. Conflicting final observations all
remain quarantined until separately approved evidence resolution.

Step 3 source verification is also offline only. Inputs are supplied
ESPN-compatible NFL event snapshots using the same canonical event/team IDs.
Native-provider decoding and identity bridges are not implemented. Separate
trusted source/capture catalogs bind approved source origins, upstream provider
groups, exact UTF-8 payload SHA-256, retrieval times, and optional final-result
publication times. Raw payloads cannot approve their own source or manifest.
These catalogs require externally established provenance: a matching supplied
hash proves byte integrity, not who supplied the bytes or whether a score is true.
All test catalogs, hosts, manifests, and reference scores are synthetic.

Verification requires the candidate's captured body and retrieval time to match
its Step 2 observation, plus matching evidence from at least two distinct approved
upstream provider groups including the candidate. Catalog aliases and mirrors of
one provider count only once. One origin cannot declare two independent upstreams.
Agreeing duplicate snapshots remain auditable but
add no support. Byte-identical payloads attributed to different upstreams are
quarantined as possible copying. Any invalid or conflicting supplied evidence
blocks verification; neither majority voting nor newest-record-wins is used.
Scores are never corrected automatically. Publication time, when supplied,
means publication of the final result, not creation of an earlier news article.

The explicit caller-supplied audit cutoff prevents clock dependence and future
captures. Verification availability is never backdated to an earlier capture.
VERIFIED means OFFLINE_CORROBORATED under the supplied trusted catalogs, not
live-source authentication. Every output has persistenceAuthorized=false, and
unverified outputs contain no verified result or eligible warehouse row.

Step 4 compares only supplied expected schedule evidence with supplied known
fixtures. Expected schedules require approved, hash-bound captures from two
independent upstream groups agreeing on event/team IDs, kickoff, event-level
season phase/year and week. Pregame schedule snapshots need no final score;
the shared provenance checks still apply, and structural/status validation is
mandatory. Unknown phase/week, interrupted schedules and conflicting evidence
are quarantined. Preseason/postseason are excluded only after corroboration.

Presence is not final-result verification: COMPLETE describes fixture coverage
within these supplied expectations, not an exhaustive official schedule or
model-ready results. Known questionable scores remain present but unverified.
Step 3 corroboration is reused for PRESENT_VERIFIED results. Unassignable known
rows block missing-game candidates because absence cannot safely be concluded.
Extra in-scope known games make coverage uncertain. No score or game completion
is inferred merely because kickoff is in the past.

Explicit bounds are mandatory: up to three seasons, regular weeks 1–18, a
half-open kickoff window of at most 35 days and a recovery limit of 0–32.
Each supplied list is capped at 2,048 rows and each evidence set at eight
captures. Reports include excluded/out-of-scope/quarantined games, season/week
counts, duplicates, conflicts and unexpected known IDs. Recovery candidates
are deterministically ordered review-only fixture identities with
executionAuthorized=false; omitted candidates are counted. There is no executor,
provider URL generation, database access, backfill or score reconciliation.
September 27 regressions use explicitly synthetic Rams–Denver and
Seattle–Washington snapshots, not recovered real-world fixtures or scores.

Phase A consolidation also checks component boundaries. An unaccounted-for
same-season/team-pair event with another ID/week is a possible replacement,
not proof of absence; a separate corroborated schedule expectation can prove
it is a distinct repeat matchup. This conservative ambiguity check may defer
recovery review when a supplied schedule omits the other matchup. A known final
with unresolved scores or invalid supplied result evidence prevents
PRESENT_VERIFIED, even if another observation has corroboration. Verified final
coverage requires both Step 3 result corroboration and matching schedule/week
corroboration. COMPLETE still means fixture presence, not model-ready results.

Existing dependencies are reused through local ignored node_modules links.
No dependency installation or main-workspace lockfile change is required.
Cache output, if any, is confined to the worktree's ignored tmp directory.
Native configuration loading avoids bundling config files into the linked
main-workspace node_modules directory.
