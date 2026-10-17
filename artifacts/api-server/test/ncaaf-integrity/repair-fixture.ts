import { captureNcaafSource, ncaafIntegrityHash } from "../../src/services/ncaafHistoricalIntegrity";
import { officialDocumentHash, type RepairEntry, type RepairSnapshot, type RepairApproval, type RepairManifest } from "../../src/services/ncaafHistoricalRepair";

/** Synthetic only: never offered as real historical source evidence. */
export function repairFixture(id = "990900001") {
  const kickoff = "2026-08-29T23:00:00.000Z", captured = "2026-08-30T05:00:00.000Z";
  const event = { id, date: kickoff, season: { year: 2026, type: 2 },
    status: { type: { completed: true, state: "post", name: "STATUS_FINAL" } },
    competitions: [{ date: kickoff, competitors: [
      { homeAway: "home", team: { id: "2439" }, score: "21" },
      { homeAway: "away", team: { id: "235" }, score: "27" },
    ] }] };
  const gameId = `NCAAF-${id}`;
  const document = "SYNTHETIC OFFLINE FIXTURE. Football, 08/29/2026.\nFinal score: Away 27, Home 21.";
  const before = {
    gameId, homeTeamId: "2439", awayTeamId: "235", kickoffAt: kickoff,
    homeScore: 0, awayScore: 0, gameUpdatedAt: captured,
    resultId: 1, resultHomeScore: 21, resultAwayScore: 27, resultUpdatedAt: captured,
    gradedAt: captured, gradingSource: "espn_recovery", rawIsSqlNull: false, rawMd5: "37a6259cc0c1dae299a7866489dff0bd",
  };
  const entry: RepairEntry = {
    before,
    input: { sport: "NCAAF", espnId: gameId, homeTeamId: "2439", awayTeamId: "235",
      commenceTimeISO: kickoff, homeScore: 21, awayScore: 27,
      ncaafFinalCapture: captureNcaafSource("ESPN", event,
        "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=20260829&limit=100", captured)! },
    official: {
      sourceUrl: "https://unlvrebels.com/sports/football/stats/2026/synthetic/boxscore/999999",
      capturedAt: captured, representation: "EXTRACTED_MARKDOWN", document, documentHash: officialDocumentHash(document),
      identity: { gameId, homeTeamId: "2439", awayTeamId: "235", kickoffAt: kickoff },
      gameDate: "2026-08-29", homeScore: 21, awayScore: 27,
      finalQuote: "Final score: Away 27, Home 21.", homeLabel: "Home", awayLabel: "Away",
      homeScoreQuote: "Home 21", awayScoreQuote: "Away 27",
      dateQuote: "08/29/2026", dateBasis: "EXPLICIT_GAME_DATE", authorship: "INSTITUTIONAL_BOXSCORE",
    },
  };
  const snapshot: RepairSnapshot = {
    game: { id: gameId, sport: "NCAAF", status: "final", homeTeamId: "2439", awayTeamId: "235",
      startsAt: kickoff, homeScore: 0, awayScore: 0, updatedAt: captured, protectedModelField: 0.73 },
    result: { id: 1, gameId, homeScore: 21, awayScore: 27, rawResultJson: null,
      updatedAt: captured, gradedAt: captured, gradingSource: "espn_recovery" },
    rawIsSqlNull: false, rawMd5: before.rawMd5,
  };
  const manifest: RepairManifest = { version: "ncaaf-controlled-repair-v1", asOf: "2026-08-31T12:00:00.000Z", entries: [entry] };
  const approval: RepairApproval = { operation: "APPLY", manifestHash: ncaafIntegrityHash(manifest),
    gameIds: [gameId], target: { host: "/private/synthetic", database: "synthetic", role: "synthetic" } };
  return { entry, snapshot, manifest, approval };
}
