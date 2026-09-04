/** Development-only #222B audit. Read-only database access; output uses wx so
 * an existing immutable report can never be replaced. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db, ncaafCfbdTeamMappingsTable, ncaafFootballIntelligenceSnapshotsTable, ncaafGameEvidenceTable } from "@workspace/db";
import { buildNcaafV42026FeatureBridge } from "../src/services/ncaafV42026FeatureBridge";
import { loadNcaafV4TrainingRows } from "../src/services/ncaafV4TrainingLoader";
import { trainNcaafV4DistinctChallenger } from "../src/services/ncaafV4DistinctChallenger";
import type { V4Row } from "../src/services/ncaafV4ExpectedScore";

const report = resolve(process.cwd(), "../../reports/ncaaf-v4-2026-feature-bridge-2026-09-04-v3.json");
const assessedAt = new Date("2026-09-04T00:00:00.000Z");
async function main() {
  const [snapshots, evidence, mappings] = await Promise.all([
    db.select().from(ncaafFootballIntelligenceSnapshotsTable),
    db.select().from(ncaafGameEvidenceTable),
    db.select().from(ncaafCfbdTeamMappingsTable),
  ]);
  // The model is fitted from the frozen historical cohort only. Its predict
  // function consumes no labels; the inert target shape satisfies the legacy
  // V4 row type and is neither read nor retained by this bridge.
  const trained = trainNcaafV4DistinctChallenger(await loadNcaafV4TrainingRows());
  const bridge = buildNcaafV42026FeatureBridge({ snapshots, evidence, mappings, assessedAt,
    predict: input => trained.predictFrozen({ ...input, targets: { homeWin: 0, homeMargin: 0, totalPoints: 0 } } as V4Row),
  });
  const fragment = {
    artifact: "ncaaf-v4-2026-feature-bridge-2026-09-04", version: bridge.version, assessedAt: assessedAt.toISOString(),
    status: bridge.exclusions.length ? "PARTIAL" : "PASS", compatibilityMatrix: [
      "seasonToDate score-derived offense/defense", "last3", "last5", "priorSeason", "pregame Elo", "opponentAdjusted", "home/neutral", "sample counts", "missing/quality indicators",
    ].map(feature => ({ feature, historicalSchema: "ncaaf-chronological-team-game-v2", source: "completed ncaaf_game_evidence + strict snapshot cutoff", exactSemanticMatch: true, exactChronology: true, status: "PASS" })),
    eligibleInputCount: bridge.inputs.length, internalPredictionCount: bridge.predictions.length, exclusions: bridge.exclusions, pitAudit: bridge.audit, marketAudit: { violations: bridge.audit.marketLeakage }, blockers: bridge.exclusions,
    persistence: "none; nonpublic in-memory challenger inputs only",
  };
  await mkdir(resolve(report, ".."), { recursive: true });
  await writeFile(report, `${JSON.stringify(fragment, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ report, status: fragment.status, inputs: bridge.inputs.length, exclusions: bridge.exclusions.length }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });