import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeImport } from "./test/nfl-offline/guard.mjs";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
const safety = resolve(root, "test/nfl-offline");
const replayModule = resolve(root, "src/services/nflV4.ts") + "?nfl-offline-verified";
const legacyModule = resolve(root, "src/services/nflV4.ts") + "?nfl-offline-legacy";
// Reconstruct the ACTUAL Render baseline in memory, then pin its exact bytes.
// This prevents a changed equation being mistaken for a history-only safeguard.
function legacySource(source) {
  const replacements = [
    ['import { requireNflV4History } from "./nflV4HistorySafety";\n', ""],
    ['import { selectNflRegularSeasonHistory } from "./nflHistoricalSeasonPolicy";\n', ""],
    ['import { db, gamesTable, gameResultsTable } from "@workspace/db";',
      'import { db, gamesTable } from "@workspace/db";'],
    ['        resultEvidence: gameResultsTable.rawResultJson,\n', ""],
    ['      }).from(gamesTable).leftJoin(gameResultsTable, eq(gameResultsTable.gameId, gamesTable.id)).where(and(',
      '      }).from(gamesTable).where(and('],
    ['      const classified = selectNflRegularSeasonHistory(history, new Date().toISOString());\n'
      + '      return { event: { ...event, startsAt, homeTeamId, awayTeamId }, history: classified.history,\n'
      + '        seasonDecisions: classified.decisions };',
      '      return { event: { ...event, startsAt, homeTeamId, awayTeamId }, history };'],
    ['          startsAt: Date | null; homeScore: number | null; awayScore: number | null;\n'
      + '          verifiedEvidenceAvailableAt?: string }>;',
      '          startsAt: Date | null; homeScore: number | null; awayScore: number | null }>;'],
    ['        isNotNull(gamesTable.startsAt),\n',
      '        isNotNull(gamesTable.startsAt), isNotNull(gamesTable.homeScore), isNotNull(gamesTable.awayScore),\n'],
    [source.slice(source.indexOf("      if (!Number.isFinite(now.getTime())"),
      source.indexOf("      const states = new Map<string, TeamState>")),
      '      if (now >= event.startsAt) throw new Error("EVENT_ALREADY_STARTED");\n'],
    ["for (const game of replayHistory)", "for (const game of history)"],
    ["const completedAt = historyAvailableAt(game);",
      "const completedAt = new Date(game.startsAt.getTime() + 12 * 60 * 60 * 1000);"],
  ];
  for (const [from, to] of replacements) {
    if (source.split(from).length !== 2) throw new Error("LEGACY_HISTORY_PATCH_ANCHOR_CHANGED");
    source = source.replace(from, to);
  }
  if (createHash("sha256").update(source).digest("hex")
    !== "3ee85cfd1fade758c6537889b50bf01fdd71a7aabe6328ea19eddea0027140f9") {
    throw new Error("RENDER_BASELINE_ENGINE_BYTES_CHANGED");
  }
  return source;
}
// INACTIVE PROPOSAL. Only the guarded test runner sees this in-memory module.
// No production source is edited. Abort if the reviewed anchor ever changes.
const oldAvailability = [
  'const legacyBound = game.startsAt!.getTime() + 12 * 60 * 60 * 1000;',
  '        const verifiedBound = game.verifiedEvidenceAvailableAt === undefined ? legacyBound',
  '          : Date.parse(game.verifiedEvidenceAvailableAt);',
  '        if (!Number.isFinite(verifiedBound)) throw new Error("NFL_HISTORY_AVAILABILITY_INVALID");',
  '        return new Date(Math.max(legacyBound, verifiedBound));',
].join("\n");
const proposedAvailability = [
  'const suppliedAvailability = Reflect.get(game, "verifiedEvidenceAvailableAt");',
  '        if (typeof suppliedAvailability !== "string" || !Number.isFinite(Date.parse(suppliedAvailability))) {',
  '          throw new Error("VERIFIED_HISTORY_AVAILABILITY_REQUIRED");',
  '        }',
  '        const completedAt = new Date(suppliedAvailability);',
  '        if (completedAt <= game.startsAt! || completedAt > now) throw new Error("VERIFIED_HISTORY_TIME_UNSAFE");',
  '        return completedAt;',
].join("\n");

export default defineConfig({
  root,
  envDir: false,
  cacheDir: resolve(root, "tmp/nfl-offline-vite"),
  plugins: [{
    name: "nfl-offline-import-boundary",
    enforce: "pre",
    load(id) {
      assertSafeImport(id);
      if (id === legacyModule) return legacySource(readFileSync(resolve(root, "src/services/nflV4.ts"), "utf8"));
      if (id === replayModule) {
        const source = readFileSync(resolve(root, "src/services/nflV4.ts"), "utf8");
        if (source.split(oldAvailability).length !== 2) throw new Error("OFFLINE_REPLAY_PATCH_ANCHOR_CHANGED");
        return source.replace(oldAvailability, proposedAvailability);
      }
    },
    resolveId(source, importer) {
      if (source === "virtual:nfl-verified-replay") return replayModule;
      if (source === "virtual:nfl-legacy-history") return legacyModule;
      if (source === "@workspace/db") return resolve(safety, "mock-db.mjs");
      const candidate = source.startsWith(".") && importer
        ? resolve(dirname(importer.split("?")[0]), source) : source;
      if (candidate.replace(/\.ts$/, "") === resolve(root, "src/services/espn")) {
        return resolve(safety, "mock-espn.mjs");
      }
      assertSafeImport(candidate);
      // Prevent bypassing the database alias via direct relative imports.
      if (source.startsWith("@workspace/db/") || /\/lib\/db\/src\/index(?:\.ts)?$/.test(candidate)) {
        throw new Error("NFL_OFFLINE_FORBIDDEN_IMPORT");
      }
    },
  }],
  server: { host: "127.0.0.1", hmr: false, watch: null },
  test: {
    environment: "node",
    watch: false,
    pool: "threads",
    maxWorkers: 1,
    fileParallelism: false,
    cache: false,
    setupFiles: [resolve(safety, "setup.mjs")],
    include: [
      "src/services/nflV4.test.ts",
      "src/services/nflV4HistoricalInput.test.ts",
      "src/services/nflHistoricalResultValidation.test.ts",
      "src/services/nflHistoricalEvidenceVerification.test.ts",
      "src/services/nflHistoricalFixtureCoverage.test.ts",
      "src/services/v4HistoricalWarehouse.test.ts",
      "src/services/v4Platform.test.ts",
      "test/nfl-offline/safety.test.ts",
      "test/nfl-offline/workflow.test.ts",
      "test/nfl-offline/historical-bundle.test.ts",
      "test/nfl-offline/historical-replay.test.ts",
      "test/nfl-offline/history-safety.test.ts",
      "test/nfl-offline/final-ingestion.test.ts",
    ],
  },
});
