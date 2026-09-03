---
name: NCAAF canonical identity bridge
description: Safety contract for deterministic CFBD-to-ESPN team identity and unresolved mappings.
---

Use an equal CFBD/ESPN team ID as an automatic mapping method only when the ESPN display name exactly equals the mechanically normalized CFBD school plus mascot. Do not treat equal numeric IDs alone as proof.

Name-only mappings may be automatic only when equivalent conference and classification evidence is available for guard checks. If canonical candidates lack comparable guard metadata, leave the mapping unresolved rather than silently bypassing the guards.

**Why:** CFBD exposes school names while the existing ESPN-derived canonical candidates expose mascot-bearing display names. Their observed IDs share a namespace, but the semantic name mismatch previously caused every mapping to fail, while permissive missing guards could make ambiguous name-only promotion unsafe.

**How to apply:** Keep normalization mechanical and deterministic. Never add fuzzy, edit-distance, mascot-only, abbreviation-only, or LLM-based promotion. Store mapping method, confidence, review status, and failure reason in append-only evidence.