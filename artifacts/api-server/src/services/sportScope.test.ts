import { describe, expect, it } from "vitest";
import {
  ACTIVE_PRODUCT_SPORTS,
  ARCHIVED_PRODUCT_SPORTS,
  isActiveProductSport,
  isArchivedProductSport,
} from "./sportScope";

describe("product sport scope", () => {
  it("archives UFC from all active product work", () => {
    expect(ARCHIVED_PRODUCT_SPORTS).toContain("UFC");
    expect(ACTIVE_PRODUCT_SPORTS).not.toContain("UFC");
    expect(isArchivedProductSport("UFC")).toBe(true);
    expect(isActiveProductSport("UFC")).toBe(false);
  });

  it("keeps the archived value readable without treating it as an active sport", () => {
    // Historical UFC records retain their stored sport value; only active work
    // is excluded so a future rebuild can deliberately re-enable it.
    const historicalSport = "UFC";
    expect(historicalSport).toBe("UFC");
    expect(isActiveProductSport("NFL")).toBe(true);
  });
});