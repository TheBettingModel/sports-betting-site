import soccerArtifactJson from "../../../../model-artifacts/v4/soccer-v4-core-score.json";
import mlbArtifactJson from "../../../../model-artifacts/v4/mlb-v4-core-score.json";
import nbaArtifactJson from "../../../../model-artifacts/v4/nba-v4-core-score.json";
import wnbaArtifactJson from "../../../../model-artifacts/v4/wnba-v4-core-score.json";
import nhlArtifactJson from "../../../../model-artifacts/v4/nhl-v4-core-score.json";
import ncaambArtifactJson from "../../../../model-artifacts/v4/ncaamb-v4-core-score.json";
import nflArtifactJson from "../../../../model-artifacts/v4/nfl-v4-core.json";
import { createNflV4Engine, type NflV4Artifact } from "./nflV4";
import { ncaafV4SharedAdapter } from "./ncaafV4SharedAdapter";
import { createRollingScoreV4Engine, type RollingScoreV4Artifact } from "./rollingScoreV4";
import { canonicalV4EngineRegistry } from "./v4Platform";

let bootstrapped = false;

export function bootstrapTask241V4Engines(): void {
  if (bootstrapped) return;
  const soccerArtifact = soccerArtifactJson as unknown as RollingScoreV4Artifact;
  canonicalV4EngineRegistry.register(createRollingScoreV4Engine(soccerArtifact));
  for (const artifact of [
    mlbArtifactJson, nbaArtifactJson, wnbaArtifactJson, nhlArtifactJson, ncaambArtifactJson,
  ]) {
    canonicalV4EngineRegistry.register(
      createRollingScoreV4Engine(artifact as unknown as RollingScoreV4Artifact),
    );
  }
  canonicalV4EngineRegistry.register(
    createNflV4Engine(nflArtifactJson as unknown as NflV4Artifact),
  );
  canonicalV4EngineRegistry.register(ncaafV4SharedAdapter);
  bootstrapped = true;
}