---
name: V4 platform cutover boundary
description: Durable routing and migration rule for moving TBM from the legacy platform to canonical V4 sport engines.
---

After a sport cuts over to the canonical platform, runtime routing must resolve
an exact eligible V4 artifact or return no forecast. It must never fall through
to V3/V2/V1 or relabel a legacy formula as V4. During migration, the old platform
may continue legacy service only as a separately identified parallel deployment.

**Why:** Empty coverage is safer and more honest than silently publishing an
unapproved model. A cloud/platform cutover and an individual sport-model approval
are separate decisions.

**How to apply:** Require exact model/artifact/contract identity, PIT-safe input,
an authentic executor, and explicit publication approval per sport. Keep legacy
history for audits, but do not use it for current forecasts after that sport's
cutover.

V4 is the permanent architecture: each sport keeps its own model path,
database/history space, and improvement cycle.

**Why:** Replacing it with another unified modeling layer would duplicate the
completed architecture and add unnecessary complexity.

**How to apply:** Repair ingestion, identity mapping, historical materialization,
execution, grading, and retraining inside each existing sport-specific V4 path.