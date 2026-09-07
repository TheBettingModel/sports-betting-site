import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapTask241V4Engines } from "./v4EngineBootstrap241";
import { canonicalV4EngineRegistry } from "./v4Platform";

describe("Task 241 V4 engine bootstrap", () => {
  beforeAll(() => bootstrapTask241V4Engines());

  it("registers the exact frozen Soccer V4 artifact only", () => {
    const soccer = canonicalV4EngineRegistry.get("SOCCER");
    expect(soccer?.identity).toMatchObject({
      modelId: "tbm-soccer-v4-core-score",
      modelVersion: "4.0.0-core",
      artifactHash: "26e1a46ee7feee17b6d7e258a6f3574a90b2fdcdc4f4c06be8abffe5927264b6",
    });
    expect(soccer?.approvalState).toBe("SHADOW");
    expect(canonicalV4EngineRegistry.get("NFL")).toBeNull();
    expect(canonicalV4EngineRegistry.get("WNBA")).toBeNull();
  });
});