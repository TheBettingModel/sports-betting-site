import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeImport } from "./test/nfl-offline/guard.mjs";

const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root, envDir: false, cacheDir: resolve(root, "tmp/ncaaf-integrity-vite"),
  plugins: [{
    name: "ncaaf-integrity-offline-import-boundary", enforce: "pre",
    load(id) { assertSafeImport(id); },
    resolveId(source, importer) {
      const candidate = source.startsWith(".") && importer ? resolve(dirname(importer.split("?")[0]), source) : source;
      if (source === "@workspace/db" || /\/lib\/db\/src(?:\/|$)/.test(candidate)) {
        throw new Error("NCAAF_OFFLINE_DATABASE_IMPORT_FORBIDDEN");
      }
      assertSafeImport(candidate);
    },
  }],
  server: { host: "127.0.0.1", hmr: false, watch: null },
  test: {
    environment: "node", globals: false, pool: "threads", maxWorkers: 1, fileParallelism: false,
    execArgv: ["--import", resolve(root, "test/nfl-offline/guard.mjs")],
    setupFiles: [resolve(root, "test/nfl-offline/setup.mjs")],
    include: ["test/ncaaf-integrity/integrity.test.ts", "test/ncaaf-integrity/repair.test.ts",
      "test/ncaaf-integrity/writer-boundary.test.ts", "src/services/ncaafSavedSlate.test.ts"],
    env: { NODE_ENV: "test", SCHEDULER_ENABLED: "false", NCAAF_INTEGRITY_OFFLINE: "true" },
  },
});
