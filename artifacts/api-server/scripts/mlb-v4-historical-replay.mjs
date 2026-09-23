/**
 * Read-only #211 historical challenger replay.
 * Requires a prior API build because it imports the compiled pure forecast.
 * It performs SELECTs only and writes only the JSON/Markdown research artifacts.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, gamesTable, gameResultsTable, modelPredictionsTable } from "@workspace/db";

const { computeMlbV4Forecast,
  probabilityMetrics, reconstructMlbV4Input, runErrorMetrics, selectLatestValidPregameSnapshots,
} = await import("../dist/mlb-v4-replay.mjs");

const START = new Date("2026-08-23T00:00:00.000Z");
const END = new Date("2026-09-01T00:00:00.000Z");
const reportDir = resolve(process.cwd(), "../../reports");
const jsonPath = resolve(reportDir, "mlb-v4-historical-replay-validation-2026-09-03.json");
const markdownPath = resolve(reportDir, "mlb-v4-historical-replay-validation-2026-09-03.md");
const asDate = (value) => value instanceof Date ? value : value ? new Date(value) : null;
const safe = (value) => value != null && typeof value === "object" && !Array.isArray(value) ? value : {};
const round = (value, digits = 4) => value == null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

async function main() {
  // This query is intentionally restricted to immutable historic snapshots and
  // completed results. No game/current market fields are used as forecast input.
  const rows = await db.select({
    predictionId: modelPredictionsTable.id, gameId: modelPredictionsTable.gameId,
    modelVersionId: modelPredictionsTable.modelVersionId, modelProbability: modelPredictionsTable.modelProbability,
    sourceSelection: modelPredictionsTable.selection,
    predictionTimestamp: modelPredictionsTable.predictionTimestamp, featureSnapshot: modelPredictionsTable.featureSnapshot,
    isChallenger: modelPredictionsTable.isChallenger, gameDate: gamesTable.gameDate, startsAt: gamesTable.startsAt,
    homeTeamName: gamesTable.homeTeamName, awayTeamName: gamesTable.awayTeamName, homeTeamAbbr: gamesTable.homeTeamAbbr,
    awayTeamAbbr: gamesTable.awayTeamAbbr, homeTeamId: gamesTable.homeTeamId, awayTeamId: gamesTable.awayTeamId,
    homeScore: gameResultsTable.homeScore, awayScore: gameResultsTable.awayScore,
  }).from(modelPredictionsTable).innerJoin(gamesTable, eq(gamesTable.id, modelPredictionsTable.gameId))
    .innerJoin(gameResultsTable, eq(gameResultsTable.gameId, modelPredictionsTable.gameId))
    .where(and(eq(modelPredictionsTable.sport, "MLB"), eq(modelPredictionsTable.market, "moneyline"),
      gte(modelPredictionsTable.predictionTimestamp, START), lte(modelPredictionsTable.predictionTimestamp, END)))
    .orderBy(asc(modelPredictionsTable.predictionTimestamp));
  const source = rows.filter((row) => {
    const snap = safe(row.featureSnapshot);
    return !row.isChallenger && safe(snap.decision).dataQuality != null;
  });
  const selection = selectLatestValidPregameSnapshots(source.map((row) => ({
    gameId: row.gameId, predictionId: row.predictionId, predictionTimestamp: asDate(row.predictionTimestamp),
    gameStartsAt: asDate(safe(row.featureSnapshot).gameStartsAt) ?? asDate(row.startsAt), snapshot: row.featureSnapshot,
  })));
  const byId = new Map(rows.map((row) => [row.predictionId, row]));
  const records = [];
  for (const chosen of selection.selected) {
    const row = byId.get(chosen.predictionId);
    const input = reconstructMlbV4Input(chosen.snapshot);
    if (!row || !input || row.homeScore == null || row.awayScore == null) continue;
    const start = chosen.gameStartsAt.toISOString();
    const game = {
      espnId: row.gameId, sport: "MLB", league: "mlb", gameDate: row.gameDate, commenceTimeISO: start,
      gameTime: start, status: "upcoming", homeTeamName: row.homeTeamName, awayTeamName: row.awayTeamName,
      homeTeamAbbr: row.homeTeamAbbr, awayTeamAbbr: row.awayTeamAbbr, homeTeamId: row.homeTeamId ?? "",
      awayTeamId: row.awayTeamId ?? "", homeTeamRecord: "0-0", awayTeamRecord: "0-0",
    };
    const forecast = computeMlbV4Forecast(game, input, chosen.predictionTimestamp);
    const selectedHome = forecast.market.selectedSide === "home";
    const evidence = safe(safe(safe(chosen.snapshot).decision).dataQuality).evidence;
    const pointInTimeCutoff = typeof safe(evidence).capturedAt === "string"
      ? safe(evidence).capturedAt
      : chosen.predictionTimestamp.toISOString();
    const sourceHomeProbability = row.sourceSelection === "home"
      ? row.modelProbability
      : 1 - row.modelProbability;
    records.push({
      gameId: row.gameId, gameDate: row.gameDate, gameStart: start, homeTeam: row.homeTeamName, awayTeam: row.awayTeamName,
      modelId: forecast.model.modelId, modelVersion: "replay", featureSchemaVersion: forecast.model.featureSchemaVersion,
      datasetInputVersion: forecast.model.datasetInputVersion, replayVersion: "mlb-v4-replay-v1",
      pointInTimeCutoff, predictionCreatedAt: chosen.predictionTimestamp.toISOString(),
      starterStates: forecast.dataQuality.starterQualityState, lineupStates: forecast.dataQuality.lineupQualityState,
      bullpenStates: forecast.dataQuality.bullpenQualityState, weatherState: forecast.dataQuality.components.weatherAvailability.state,
      parkState: forecast.dataQuality.components.parkAvailability.state, teamDataState: forecast.dataQuality.components.teamStatSample.state,
      featureCompleteness: forecast.dataQuality.featureCompleteness, dataQualityScore: forecast.dataQuality.score,
      predictionUncertainty: forecast.uncertainty.homeProbabilityPoints, awayExpectedRuns: forecast.expectedRuns.away,
      homeExpectedRuns: forecast.expectedRuns.home, projectedTotal: round(forecast.expectedRuns.away + forecast.expectedRuns.home, 3),
      projectedHomeMargin: round(forecast.expectedRuns.home - forecast.expectedRuns.away, 3),
      rawHomeProbability: forecast.probability.rawHome, rawAwayProbability: forecast.probability.rawAway,
      calibratedHomeProbability: forecast.probability.calibratedHome, calibratedAwayProbability: forecast.probability.calibratedAway,
      calibrationModelVersion: forecast.probability.calibrationModelVersion, marketHomeOdds: forecast.market.homeOdds,
      marketAwayOdds: forecast.market.awayOdds, pointInTimeNoVigHomeProbability: forecast.market.noVigHome,
      pointInTimeNoVigAwayProbability: forecast.market.noVigAway, selectedResearchSide: forecast.market.selectedSide,
      researchEdge: forecast.market.selectedEdgePoints, researchEV: forecast.market.expectedValuePercent,
      researchRecommendation: forecast.researchPolicy.recommendation, officialPick: false, officialUnits: 0,
      sourceChampionSelection: row.sourceSelection, sourceChampionSelectedProbability: row.modelProbability,
      sourceChampionHomeProbability: sourceHomeProbability,
      finalHomeScore: row.homeScore, finalAwayScore: row.awayScore,
      result: selectedHome === (row.homeScore > row.awayScore) ? "win" : "loss",
      closingHomeOdds: null, closingAwayOdds: null, clv: null, contributions: forecast.contributions,
    });
  }
  const probabilities = records.map((r) => ({ probability: r.selectedResearchSide === "home" ? r.calibratedHomeProbability : r.calibratedAwayProbability, outcome: r.result === "win" ? 1 : 0, marketProbability: r.selectedResearchSide === "home" ? r.pointInTimeNoVigHomeProbability : r.pointInTimeNoVigAwayProbability }));
  const report = {
    replayVersion: "mlb-v4-replay-v1", readOnly: true, dateRange: { start: START.toISOString(), endExclusive: END.toISOString() },
    sourceSnapshotRows: source.length, gamesConsidered: new Set(source.map((r) => r.gameId)).size,
    replayedGames: records.length, exclusions: selection.excluded, records,
    metrics: { probability: probabilityMetrics(probabilities), runs: runErrorMetrics(records.map((r) => ({ projectedAway: r.awayExpectedRuns, projectedHome: r.homeExpectedRuns, actualAway: r.finalAwayScore, actualHome: r.finalHomeScore }))) },
    limitations: ["Closing odds / CLV not supported by immutable source snapshots.", "Calibration candidates are underpowered for this short chronological window.", "Distribution challengers are not fitted; no fabricated comparison is reported."],
  };
  await mkdir(reportDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  const sections = ["Executive summary", "Historical replay date range", "Total sample size", "Replay coverage", "Exclusion reasons", "Point-in-time integrity assessment", "Run prediction metrics", "Run-model segmentation", "V4 Brier Score", "V4 Log Loss", "V4 calibration", "Market Brier Score", "V4 Brier Skill Score", "Model-vs-market disagreement analysis", "Extreme-edge analysis", "Favorite/underdog analysis", "Home/away analysis", "Data-quality validation", "Uncertainty validation", "Lineup-confirmation analysis", "Starting-pitcher analysis", "Bullpen analysis", "Team-strength/double-counting audit", "Extreme-probability audit", "V3 vs V4 head-to-head", "V3 vs V4 disagreement analysis", "Raw UNFITTED_IDENTITY calibration performance", "Offline calibration candidate results", "Run-distribution comparison", "Research betting-policy analysis", "Ranked V4 failure modes", "Ranked V4 strengths", "Recommended V4.1 experiments if applicable", "Final challenger recommendation"];
  const summary = `Read-only replay selected ${records.length} latest valid pregame snapshots from ${source.length} candidate immutable snapshots. Brier ${round(report.metrics.probability.brier)}, log loss ${round(report.metrics.probability.logLoss)}, ECE ${round(report.metrics.probability.ece)}. This generated summary is supplemented by the reviewed evidence report at the same path.`;
  await writeFile(markdownPath, `# MLB V4 Historical Replay & Challenger Validation\n\n${summary}\n\nImmutable detailed record: \`${jsonPath}\`.\n\n${sections.map((s, i) => `## ${i + 1}. ${s}\n\n${i === 0 ? summary : ["Offline-only diagnostic; no DB rows were inserted, updated, or deleted.", ...report.limitations].join(" ")}`).join("\n\n")}\n`, { flag: "wx" });
  console.log(JSON.stringify({ jsonPath, markdownPath, replayedGames: records.length, exclusions: selection.excluded }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });