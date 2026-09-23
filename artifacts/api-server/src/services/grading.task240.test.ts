import { describe, expect, it } from "vitest";
import { calculateClv, gradeSoccer3Way } from "./grading";

describe("Task 240 grading semantics", () => {
  it("grades a draw as a loss for either team in a three-way market", () => {
    expect(gradeSoccer3Way("home", 1, 1)).toBe("loss");
    expect(gradeSoccer3Way("away", 1, 1)).toBe("loss");
    expect(gradeSoccer3Way("draw", 1, 1)).toBe("win");
  });

  it("voids an unknown soccer selection instead of inventing a loss", () => {
    expect(gradeSoccer3Way("team-name-without-side-lineage", 1, 1)).toBe("void");
  });

  it("represents a missing or corrupt closing price as unknown, not zero CLV", () => {
    expect(calculateClv(-110, 0)).toBeNull();
    expect(calculateClv(-110, Number.NaN)).toBeNull();
  });
});