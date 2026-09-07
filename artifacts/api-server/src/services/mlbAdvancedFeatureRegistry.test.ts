import { describe, expect, it } from "vitest";
import {
  LIVE_FORWARD_CANDIDATE_NEEDS_OOS, MLB_215_READY_FEATURES, MLB_215_UNAVAILABLE_FEATURES, MLB_ADVANCED_FEATURE_REGISTRY,
} from "./mlbAdvancedFeatureRegistry";

describe("MLB advanced feature registry", () => {
  it("keeps every new entry research-only and declares provenance", () => {
    expect(MLB_ADVANCED_FEATURE_REGISTRY.length).toBeGreaterThan(0);
    for (const feature of MLB_ADVANCED_FEATURE_REGISTRY) {
      expect(feature.modelUsage).toBe("CAPTURED_RESEARCH_ONLY");
      expect(feature.provider).not.toHaveLength(0);
      expect(feature.canonicalFields.length).toBeGreaterThan(0);
      expect(feature.version).toBe("mlb-advanced-research-v1");
    }
  });
  it("does not call unsupported advanced feeds ready for #215", () => {
    expect(MLB_215_READY_FEATURES.map((f) => f.feature)).not.toContain("statcast_expected_metrics");
    expect(MLB_215_READY_FEATURES.map((f) => f.feature)).not.toContain("pitch_repertoire_and_matchup");
    expect(MLB_215_UNAVAILABLE_FEATURES.map((f) => f.feature)).toContain("umpire_effects");
  });
  it("requires complete PIT/history/live availability and proven identity for strict readiness", () => {
    expect(MLB_215_READY_FEATURES.map((f) => f.feature)).toEqual(["league_run_environment"]);
    expect(LIVE_FORWARD_CANDIDATE_NEEDS_OOS.map((f) => f.feature)).toContain("starter_conventional");
    expect(LIVE_FORWARD_CANDIDATE_NEEDS_OOS.map((f) => f.feature)).toContain("weather_context");
  });
});