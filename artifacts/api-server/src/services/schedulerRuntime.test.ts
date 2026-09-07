import { describe, expect, it } from "vitest";
import {
  processInBatches,
  schedulerMemorySnapshot,
  SingleFlightGroup,
} from "./schedulerRuntime";

describe("scheduler runtime safeguards", () => {
  it("allows only one heavy job in a single-flight group", () => {
    const group = new SingleFlightGroup();
    expect(group.acquire("startup-catch-up")).toEqual({ acquired: true });
    expect(group.acquire("result-grading")).toEqual({
      acquired: false,
      blockedBy: "startup-catch-up",
    });
    group.release("startup-catch-up");
    expect(group.acquire("result-grading")).toEqual({ acquired: true });
  });

  it("processes bounded batches sequentially", async () => {
    const seen: number[][] = [];
    await processInBatches([1, 2, 3, 4, 5], 2, async (batch) => {
      seen.push([...batch]);
    });
    expect(seen).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("reports the required process memory fields in MiB", () => {
    expect(schedulerMemorySnapshot()).toEqual({
      rssMb: expect.any(Number),
      heapUsedMb: expect.any(Number),
      heapTotalMb: expect.any(Number),
      externalMb: expect.any(Number),
      arrayBuffersMb: expect.any(Number),
    });
  });
});