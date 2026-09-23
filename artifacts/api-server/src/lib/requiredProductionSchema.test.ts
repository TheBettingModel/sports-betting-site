import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@workspace/db", () => ({ db: { execute } }));

import { assertRequiredProductionSchema } from "./requiredProductionSchema";

beforeEach(() => execute.mockReset());

describe("required production schema", () => {
  it("accepts the complete schema without writing to the database", async () => {
    execute.mockResolvedValue({ rows: [] });
    await expect(assertRequiredProductionSchema()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledOnce();
  });

  it("fails readiness with the exact missing tables and columns", async () => {
    execute.mockResolvedValue({
      rows: [
        { item: "table:v4_artifact_model_version_mappings" },
        { item: "column:v4_forecast_versions.model_family" },
      ],
    });
    await expect(assertRequiredProductionSchema()).rejects.toThrow(
      "Required production schema missing: table:v4_artifact_model_version_mappings, column:v4_forecast_versions.model_family",
    );
  });
});