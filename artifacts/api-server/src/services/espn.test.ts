import { describe, expect, it } from "vitest";
import { normalizeEspnEventStatus } from "./espn";

describe("normalizeEspnEventStatus", () => {
  it("does not classify an incomplete postponed event as final", () => {
    expect(normalizeEspnEventStatus({
      type: {
        state: "post",
        completed: false,
        detail: "Postponed",
      },
      period: 1,
    })).toBe("postponed");
  });

  it("requires ESPN completion before classifying a post-state event as final", () => {
    expect(normalizeEspnEventStatus({
      type: {
        state: "post",
        completed: true,
        detail: "Final",
      },
      period: 9,
    })).toBe("final");
  });
});