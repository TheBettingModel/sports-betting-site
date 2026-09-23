import { afterEach, describe, expect, it, vi } from "vitest";
import { getTbmReleaseIdentity } from "./releaseIdentity";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getTbmReleaseIdentity", () => {
  it("reports an unenforced local identity without exposing database details", () => {
    vi.stubEnv("TBM_ENFORCE_RELEASE_ID", "false");
    vi.stubEnv("TBM_RELEASE_SHA", "");
    vi.stubEnv("TBM_DATABASE_TARGET_ID", "");

    expect(getTbmReleaseIdentity("api")).toEqual({
      releaseSha: "UNSET",
      runtimeRole: "api",
      databaseTargetFingerprint: "UNSET",
      enforced: false,
    });
  });

  it("returns the same one-way database fingerprint for coordinated services", () => {
    vi.stubEnv("TBM_ENFORCE_RELEASE_ID", "true");
    vi.stubEnv("TBM_RELEASE_SHA", "a".repeat(40));
    vi.stubEnv("TBM_DATABASE_TARGET_ID", "production-neon-primary");

    vi.stubEnv("TBM_RUNTIME_ROLE", "api");
    const api = getTbmReleaseIdentity("api");
    vi.stubEnv("TBM_RUNTIME_ROLE", "scheduler");
    const scheduler = getTbmReleaseIdentity("scheduler");

    expect(api.releaseSha).toBe(scheduler.releaseSha);
    expect(api.databaseTargetFingerprint).toBe(
      scheduler.databaseTargetFingerprint,
    );
    expect(api.databaseTargetFingerprint).not.toContain(
      "production-neon-primary",
    );
  });

  it("fails closed when the configured runtime role is crossed", () => {
    vi.stubEnv("TBM_ENFORCE_RELEASE_ID", "true");
    vi.stubEnv("TBM_RELEASE_SHA", "b".repeat(40));
    vi.stubEnv("TBM_DATABASE_TARGET_ID", "production-neon-primary");
    vi.stubEnv("TBM_RUNTIME_ROLE", "scheduler");

    expect(() => getTbmReleaseIdentity("api")).toThrow(
      'TBM_RUNTIME_ROLE must be "api"',
    );
  });

  it("fails closed when release or database identity is missing", () => {
    vi.stubEnv("TBM_ENFORCE_RELEASE_ID", "true");
    vi.stubEnv("TBM_RUNTIME_ROLE", "scheduler");
    vi.stubEnv("TBM_RELEASE_SHA", "not-a-commit");
    vi.stubEnv("TBM_DATABASE_TARGET_ID", "");

    expect(() => getTbmReleaseIdentity("scheduler")).toThrow(
      "TBM_RELEASE_SHA",
    );
  });
});