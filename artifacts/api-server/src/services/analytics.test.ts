import { describe, expect, it } from "vitest";
import { gradedEvidencePeriod } from "./analytics";

describe("gradedEvidencePeriod", () => {
  it("uses evidence dates from only the supplied model slice", () => {
    const dormantModel = gradedEvidencePeriod([
      { gradedAt: new Date("2025-12-01T18:00:00Z") },
      { gradedAt: new Date("2025-12-15T18:00:00Z") },
    ], new Date("2026-08-30T00:00:00Z"));
    const activeModel = gradedEvidencePeriod([
      { gradedAt: new Date("2026-08-29T18:00:00Z") },
    ], new Date("2026-08-30T00:00:00Z"));

    expect(dormantModel.periodEnd).toBe("2025-12-15");
    expect(activeModel.periodEnd).toBe("2026-08-29");
  });

  it("does not refresh an old model cutoff with the sweep clock", () => {
    const result = gradedEvidencePeriod(
      [{ gradedAt: new Date("2026-01-10T12:00:00Z") }],
      new Date("2026-08-30T00:00:00Z"),
    );
    expect(result.periodEnd).toBe("2026-01-10");
  });
});