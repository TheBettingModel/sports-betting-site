import soccerArtifactJson from "../../../../model-artifacts/v4/soccer-v4-core-score.json";
import { createRollingScoreV4Engine, type RollingScoreV4Artifact } from "./rollingScoreV4";
import { canonicalV4EngineRegistry } from "./v4Platform";

let bootstrapped = false;

export function bootstrapTask241V4Engines(): void {
  if (bootstrapped) return;
  const soccerArtifact = soccerArtifactJson as unknown as RollingScoreV4Artifact;
  canonicalV4EngineRegistry.register(createRollingScoreV4Engine(soccerArtifact));
  bootstrapped = true;
}