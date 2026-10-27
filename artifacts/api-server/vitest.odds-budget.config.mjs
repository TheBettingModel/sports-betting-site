import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    setupFiles: ["./test/odds-budget/guard.mjs"],
    include: [
      "src/services/oddsCredit*.test.ts",
      "src/services/oddsBudgetedTransport.test.ts",
      "src/services/oddsApi.test.ts",
      "src/services/marketSnapshotCapture.test.ts",
      "src/services/marketAnalyticsHistory.test.ts",
      "src/services/marketAnalyticsQuery.test.ts",
      "src/services/runCloudPipelineOnce.test.ts",
    ],
  },
});
