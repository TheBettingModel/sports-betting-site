---
name: Guarded serving cutover gates
description: Safety rules for activating a next-generation model without mislabeling or overstating runtime readiness.
---

Serving mode, exact artifact-and-market approval, authentic executor availability, and a persistence-ready official bridge are independent gates. A candidate is active only when every required gate passes; approval alone must never make runtime status report the candidate as serving.

Authentic execution requires a canonical frozen artifact descriptor, independent recomputation of the authoritative input checksum/provenance, and deterministic comparison of two runs. Evaluation adapters must preserve raw model semantics and explicitly mark market, risk, and universal fields unavailable instead of inventing compatibility values.

**Why:** A future-approved candidate can still lack an executable, identity-safe production adapter, or required downstream evidence. Treating approval as runtime readiness would mislead operators; placeholder edge/confidence/units/ratings would change model meaning; and sending candidate output through an incumbent writer would record the wrong engine.

**How to apply:** Fail closed when an executor, exact artifact identity, validated input lineage, reproducibility proof, or official bridge is absent. Keep the incumbent active, expose each blocked stage and reason, and never pass candidate output through an incumbent prediction writer. Dry runs remain structurally nonpublishing. Official persistence must resolve approval inside the write transaction while holding the same transaction-scoped lock used by approval/revocation appends; it must revalidate the full fresh, open, two-sided exact-market observation and atomically create identity plus initial lifecycle. Development mutation rejection is not production immutability proof—the managed production schema and guards must be verified separately after Publish.