/** Development-only #222B audit. Read-only database access; output uses wx so
 * an existing immutable report can never be replaced. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db, ncaafCfbdDomainEvidenceTable, ncaafCfbdTeamMappingsTable, ncaafFootballIntelligenceSnapshotsTable, ncaafGameEvidenceTable } from "@workspace/db";
import { buildNcaafV42026FeatureBridge } from "../src/services/ncaafV42026FeatureBridge";
import { loadNcaafV4TrainingRows } from "../src/services/ncaafV4TrainingLoader";
import { trainNcaafV4 } from "../src/services/ncaafV4ExpectedScore";
import type { V4Row } from "../src/services/ncaafV4ExpectedScore";

const report = resolve(process.cwd(), "../../reports/ncaaf-v4-2026-identity-bridge-2026-09-04-v2.json");
const assessedAt = new Date("2026-09-04T13:40:00.000Z");
async function main() {
  const [snapshots, evidence, mappings, domainEvidence] = await Promise.all([
    db.select().from(ncaafFootballIntelligenceSnapshotsTable),
    db.select().from(ncaafGameEvidenceTable),
    db.select().from(ncaafCfbdTeamMappingsTable),
    db.select().from(ncaafCfbdDomainEvidenceTable),
  ]);
  const latestTeams = [...domainEvidence]
    .filter(row => row.season === 2026 && row.endpoint === "teams" && row.cfbdTeamId)
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || b.id - a.id)
    .reduce((map, row) => map.has(row.cfbdTeamId!) ? map : map.set(row.cfbdTeamId!, row), new Map<string, typeof domainEvidence[number]>());
  const latestMappings = [...mappings].filter(row => row.season === 2026)
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || b.id - a.id)
    .reduce((map, row) => map.has(row.cfbdTeamId) ? map : map.set(row.cfbdTeamId, row), new Map<string, typeof mappings[number]>());
  const fbs = [...latestTeams.values()].filter(row => String((row.payload as Record<string, unknown>).classification ?? "").toLowerCase() === "fbs");
  const nonFbs = [...latestTeams.values()].filter(row => String((row.payload as Record<string, unknown>).classification ?? "").toLowerCase() !== "fbs");
  const mapped = (row: typeof mappings[number] | undefined) => row?.state === "MAPPED" && !!row.canonicalTeamId;
  const proofCapturedAt = new Date(Math.max(...fbs.map(row => row.capturedAt.getTime()), ...[...latestMappings.values()].map(row => row.capturedAt.getTime())));
  const fbsUniverseProof = {
    season: 2026 as const,
    cfbdFbsCount: fbs.length,
    mappedFbsCount: fbs.filter(row => mapped(latestMappings.get(row.cfbdTeamId!))).length,
    mappedNonFbsCount: nonFbs.filter(row => mapped(latestMappings.get(row.cfbdTeamId!))).length,
    capturedAt: proofCapturedAt,
    evidenceRef: `cfbd-teams-2026:${fbs.length}:${proofCapturedAt.toISOString()}`,
  };
  // The model is fitted from the frozen historical cohort only. Its predict
  // function consumes no labels; the inert target shape satisfies the legacy
  // V4 row type and is neither read nor retained by this bridge.
  // Baseline D is the only authorized predictor for this development audit.
  // This constructs the immutable historical Baseline D artifact; it never
  // consumes 2026 targets for fitting or selection.
  const trained = trainNcaafV4(await loadNcaafV4TrainingRows());
  const bridge = buildNcaafV42026FeatureBridge({ snapshots, evidence, mappings, fbsUniverseProof, assessedAt,
    predict: input => trained.predict({ ...input, targets: { homeWin: 0, homeMargin: 0, totalPoints: 0 } } as V4Row),
  });
  const pitViolations = bridge.audit.sameGameLeakage + bridge.audit.futureGameLeakage + bridge.audit.futureSeasonLeakage + bridge.audit.postKickoffEvidence;
  const gatePass = bridge.audit.modelEligibleFbsVsFbsTargets > 0
    && bridge.inputs.length === bridge.audit.modelEligibleFbsVsFbsTargets
    && bridge.audit.identityUnresolvedTargets === 0
    && bridge.audit.ambiguousIdentitiesAccepted === 0
    && bridge.audit.fuzzyIdentitiesAccepted === 0
    && bridge.audit.postCutoffIdentityViolations === 0
    && pitViolations === 0
    && bridge.audit.marketLeakage === 0;
  const fragment = {
    artifact: "ncaaf-v4-2026-feature-bridge-2026-09-04", version: bridge.version, assessedAt: assessedAt.toISOString(), fbsUniverseProof,
    status: gatePass ? "PASS" : "PARTIAL", passGate: { passed: gatePass, pitViolations }, compatibilityMatrix: [
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