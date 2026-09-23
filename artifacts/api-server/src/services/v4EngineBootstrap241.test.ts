import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapTask241V4Engines } from "./v4EngineBootstrap241";
import { canonicalV4EngineRegistry } from "./v4Platform";

describe("Task 241 V4 engine bootstrap", () => {
  beforeAll(() => bootstrapTask241V4Engines());

  it("registers the exact frozen Soccer V4 artifact", () => {
    const soccer = canonicalV4EngineRegistry.get("SOCCER");
    expect(soccer?.identity).toMatchObject({
      modelId: "tbm-soccer-v4-core-score",
      modelVersion: "4.0.0-core",
      artifactHash: "26e1a46ee7feee17b6d7e258a6f3574a90b2fdcdc4f4c06be8abffe5927264b6",
    });
    expect(soccer?.approvalState).toBe("SHADOW");
  });

  it("registers exact Task 243 quality-gated artifacts", () => {
    expect(canonicalV4EngineRegistry.get("MLB")?.identity.artifactHash)
      .toBe("797c1a1e89fe20be286994c0d63fee32a5a4a5d2f7c7db84dfb1b8b68ad8eb40");
    expect(canonicalV4EngineRegistry.get("NBA")?.identity.artifactHash)
      .toBe("a095199c33148f5cba300221a8db4b22a79e55accc05c606a0a5dca7e73aa3e8");
    expect(canonicalV4EngineRegistry.get("WNBA")?.identity.artifactHash)
      .toBe("9eea0128b8ad09c4ab0b8556707191791e305e086b8502a1a4ffe169b430278c");
    expect(canonicalV4EngineRegistry.get("NHL")?.identity.artifactHash)
      .toBe("9917b0bfb0d8e644afd787c8111cdd500a6d08a0031d4a49a5b1c399557e86b0");
    expect(canonicalV4EngineRegistry.get("NCAAMB")?.identity.artifactHash)
      .toBe("4cb7e2ca32c0931c7f20861baeed8c8ea417158171726b516e41e2b6d9d74c0d");
  });

  it("registers the exact quality-gated NFL Task 243B artifact as shadow", () => {
    expect(canonicalV4EngineRegistry.get("NFL")?.identity).toMatchObject({
      modelId: "tbm-nfl-v4-core",
      modelVersion: "4.0.0-elo-score",
      artifactHash: "0da3f4e62a88da4c8d486b6433ca83c907e2cbd2fc072834817cbdb919233c5e",
    });
    expect(canonicalV4EngineRegistry.get("NFL")?.approvalState).toBe("SHADOW");
  });

  it("registers the frozen NCAAF executor as unvalidated and publication-disabled", () => {
    expect(canonicalV4EngineRegistry.get("NCAAF")?.identity).toMatchObject({
      modelId: "tbm-ncaaf-v4-expected-score",
      modelVersion: "D-simple-expected-score-linear",
      artifactHash: "59c00f4d5bb1219cf3ddab746311bdb96e6a19d4cc868fc33bd8176871be3226",
      contractId: "ncaaf-chronological-team-game-v2",
    });
    expect(canonicalV4EngineRegistry.get("NCAAF")?.approvalState).toBe("UNVALIDATED");
    expect(canonicalV4EngineRegistry.status().find((row) => row.sport === "NCAAF"))
      .toMatchObject({ technicallyReady: true, publicationPermitted: false });
  });
});