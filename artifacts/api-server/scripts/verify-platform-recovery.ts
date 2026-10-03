/**
 * Read-only release verification. Inputs are SELECT-only fixture/history exports.
 * Provider requests are GETs. No database writes, snapshot capture, publication,
 * or deploy calls. The sync writer is replaced with an in-memory association.
 * Usage: pnpm exec tsx scripts/verify-platform-recovery.ts fixtures.json nfl-history.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { synchronizeSharedAnalyticsFixtures, type StoredFixture } from "../src/services/sharedAnalyticsFixtures";
import { getOddsForGameWithStatus, resolveOddsApiKey } from "../src/services/oddsApi";
import { buildMoneylineSnapshotRows } from "../src/services/marketSnapshotCapture";
import { createNflV4Engine, type NflV4Artifact } from "../src/services/nflV4";
import artifact from "../../../model-artifacts/v4/nfl-v4-core.json";
import type { FetchedGame } from "../src/services/espn";
import { buildNcaafV42026FeatureBridge, NCAAF_V4_2026_FBS_UNIVERSE_PROOF } from "../src/services/ncaafV42026FeatureBridge";
import { predictFrozenNcaafV4 } from "../src/services/ncaafV4GameDay";

function verifyNcaaf(prefix: string) {
  const read = (suffix: string) => JSON.parse(readFileSync(`${prefix}-${suffix}.json`, "utf8"));
  const decode = (row: any) => {
    const decoded = { ...row };
    for (const key of ["kickoffAt", "dataCutoffAt", "evidenceMaxCapturedAt", "evidenceMaxModeledAt",
      "capturedAt", "providerObservedAt", "modeledAsOf"]) {
      if (decoded[key]) decoded[key] = new Date(decoded[key]);
    }
    return decoded;
  };
  const headers = new Map(read("snapshot-headers").map((row: any) => [row.id, row]));
  const snapshots = [0, 10, 20, 30].flatMap(offset => read(`snapshots-${offset}`))
    .map((row: any) => decode({ ...row, ...headers.get(row.id) as object }));
  const mappings = read("mappings").map((row: any) => {
    if (!row.payloadHash) throw new Error("Mapping export must include its immutable payloadHash evidence reference");
    return decode({ ...row, ...row.evidence });
  });
  if (snapshots.some(row => !row.schemaVersion)) throw new Error("Snapshot export must include schemaVersion");
  const now = new Date();
  const bridge = buildNcaafV42026FeatureBridge({ snapshots, mappings,
    evidence: read("history").map(decode), fbsUniverseProof: NCAAF_V4_2026_FBS_UNIVERSE_PROOF,
    assessedAt: now, predict: predictFrozenNcaafV4 });
  const verified = new Set(read("identity").filter((row: any) =>
    row.correctOrientation && row.correctPublicKickoff && row.correctEvidenceOrientation && row.correctEvidenceKickoff)
    .map((row: any) => row.eventId.replace(/^NCAAF-/, "")));
  // The bridge already rejects started fixtures by snapshot kickoff. Its
  // prediction DTO carries snapshotId, not a second kickoff field.
  const predictions = bridge.predictions;
  return { verifiedAt: now.toISOString(), sourceSnapshots: snapshots.length,
    upcomingSnapshots: snapshots.filter(row => row.kickoffAt > now).length,
    projectionCount: predictions.length,
    verifiedNamedProjectionCount: predictions.filter(row => verified.has(row.gameId.replace(/^espn:/, "").replace(/^NCAAF-/, ""))).length,
    quarantined: predictions.filter(row => !verified.has(row.gameId.replace(/^espn:/, "").replace(/^NCAAF-/, ""))).map(row => row.gameId),
    exclusions: bridge.exclusions };
}

async function main() {
  if (process.argv[2] === "--ncaaf-only") {
    process.stdout.write(JSON.stringify(verifyNcaaf(process.argv[3]!), null, 2) + "\n");
    return;
  }
  const now = new Date();
  const fixtures = JSON.parse(readFileSync(process.argv[2]!, "utf8"))
    .map((row: any) => ({ ...row, startsAt: row.startsAt && new Date(row.startsAt) })) as StoredFixture[];
  const history = JSON.parse(readFileSync(process.argv[3]!, "utf8"))
    .map((row: any) => ({ ...row, startsAt: row.startsAt && new Date(row.startsAt) }));
  const projectedFixtures: FetchedGame[] = [];
  const reports = await synchronizeSharedAnalyticsFixtures(now, 7, {
    load: async ids => fixtures.filter(row => ids.includes(row.id)),
    persist: async rows => { projectedFixtures.push(...rows); return rows.length; },
  });
  const engine = createNflV4Engine(artifact as unknown as NflV4Artifact);
  const nfl: any[] = [];
  for (const game of projectedFixtures.filter(row => row.sport === "NFL" && row.gameDate === "2026-10-04")) {
    try {
      const input = await engine.materializeInput({
        event: { id: game.espnId, homeTeamId: game.homeTeamId!, awayTeamId: game.awayTeamId!,
          startsAt: new Date(game.commenceTimeISO) },
        // Exact collector cutoff, backed by the supplied production SELECT export.
        history: history.filter((row: any) => row.startsAt > new Date((artifact as NflV4Artifact).historySeed.asOf)
          && row.startsAt < new Date(game.commenceTimeISO)),
      }, now);
      engine.validateInput(input);
      const forecast = await engine.predict(input);
      engine.validateOutput(forecast, input);
      nfl.push({ gameId: game.espnId, status: "READY", home: forecast.expectedHomeScore, away: forecast.expectedAwayScore });
    } catch (error) { nfl.push({ gameId: game.espnId, status: "BLOCKED", reason: String(error) }); }
  }
  const samples = new Map<string, FetchedGame[]>();
  for (const game of [...projectedFixtures].sort((a, b) => a.commenceTimeISO.localeCompare(b.commenceTimeISO))) {
    const key = resolveOddsApiKey(game.sport, game.league);
    if (key && (samples.get(key)?.length ?? 0) < 3) samples.set(key, [...samples.get(key) ?? [], game]);
  }
  const books: any[] = [];
  // Up to three near-term normal lookups per active group; no snapshots are inserted.
  for (const [key, games] of samples) {
    for (const game of games) {
      const quote = await getOddsForGameWithStatus(game.sport, game.league,
        game.homeTeamName, game.awayTeamName, game.commenceTimeISO);
      const rows = buildMoneylineSnapshotRows(game.sport, quote.odds?.bookmakerOdds ?? [], new Date());
      books.push({ sport: game.sport, league: game.league, providerKey: key, gameId: game.espnId,
      status: quote.providerUnavailable ? "UNAVAILABLE" : quote.marketBlockedByProviderStart
        ? "STARTED" : quote.odds ? "MATCHED" : "NO_CURRENT_MARKET",
      publicRows: rows.filter(row => !row.isSharp).length,
      sharpRows: rows.filter(row => row.isSharp).length,
      namedBooks: [...new Set(rows.map(row => row.sportsbook))],
      timestamps: [...new Set(rows.map(row => row.capturedAt.toISOString()))] });
      if (rows.some(row => row.isSharp) && rows.some(row => !row.isSharp)) break;
    }
  }
  const result = { verifiedAt: new Date().toISOString(), fixtureVerifiedAt: now.toISOString(), mode: "READ_ONLY_REPLAY",
    fixtureAssociation: reports.map(({ written, ...report }) => ({ ...report, wouldAssociate: written })),
    upcomingToday: projectedFixtures.filter(game => game.gameDate === "2026-10-03").reduce((counts, game) => {
      counts[game.sport] = (counts[game.sport] ?? 0) + 1; return counts;
    }, {} as Record<string, number>), nflOctober4: nfl, sportsbookReadiness: books,
    ncaaf: process.argv[4] ? verifyNcaaf(process.argv[4]) : null };
  writeFileSync("/tmp/platform-recovery-readiness.json", JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
void main().catch(error => { process.stderr.write(String(error) + "\n"); process.exitCode = 1; });