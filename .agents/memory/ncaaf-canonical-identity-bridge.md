---
name: NCAAF canonical identity bridge
description: Safety contract for deterministic CFBD-to-ESPN team identity and unresolved mappings.
---

Use an equal CFBD/ESPN team ID as an automatic mapping method only when the ESPN display name exactly equals the mechanically normalized CFBD school plus mascot. Do not treat equal numeric IDs alone as proof.

Name-only mappings may be automatic only when equivalent conference and classification evidence is available for guard checks. If canonical candidates lack comparable guard metadata, leave the mapping unresolved rather than silently bypassing the guards.

**Why:** CFBD exposes school names while the existing ESPN-derived canonical candidates expose mascot-bearing display names. Their observed IDs share a namespace, but the semantic name mismatch previously caused every mapping to fail, while permissive missing guards could make ambiguous name-only promotion unsafe.

**How to apply:** Keep normalization mechanical and deterministic. Never add fuzzy, edit-distance, mascot-only, abbreviation-only, or LLM-based promotion. Store mapping method, confidence, review status, and failure reason in append-only evidence.

Public game IDs and provider evidence IDs are separate contracts: the app may use `NCAAF-<ESPN ID>`, but immutable ESPN snapshots, cohorts, source audits, and candidate inputs must use the native numeric ESPN ID.

**Why:** Prefixing provider snapshots with the app namespace made valid CFBD-backed FBS evidence unreachable from the frozen executor even though the underlying data and mappings were complete.

**How to apply:** Normalize only at the public-game-to-provider-snapshot boundary. Keep the public slate ID prefixed, preserve non-ESPN IDs unchanged, and fail closed for malformed ESPN identifiers.