---
name: Guarded serving cutover gates
description: Safety rules for activating a next-generation model without mislabeling or overstating runtime readiness.
---

Serving mode, exact artifact-and-market approval, and authentic executor availability are independent gates. A candidate is active only when all required gates pass; approval alone must never make runtime status report the candidate as serving.

**Why:** A future-approved candidate can still lack an executable, identity-safe production adapter. Treating approval as runtime readiness would mislead operators, while sending candidate output through an incumbent persistence path would record the wrong engine.

**How to apply:** Fail closed when an executor or exact artifact identity is absent. Keep the incumbent as the reported active engine, expose the blocked state and reason, and never pass candidate output through an incumbent prediction writer. Dry runs remain nonpublishing.