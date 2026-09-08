import { logger } from "../lib/logger";
import {
  DbV4ForecastLedger,
  discoverV4Slate,
  runFullSlateV4,
  type FullSlateCoverage,
  type V4ForecastLedger,
} from "./v4FullSlate";
import { canonicalV4EngineRegistry, type V4EngineRegistry } from "./v4Platform";

export type NflProspectiveCollectionResult = Readonly<{
  capturedAt: string;
  datesAttempted: number;
  scheduledEvents: number;
  eligibleEvents: number;
  forecastsPersisted: number;
  failedEvents: number;
  coveragePct: number;
  runs: readonly FullSlateCoverage[];
}>;

function easternDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export async function runNflV4ProspectiveCollection(input: {
  now?: Date;
  days?: number;
  registry?: V4EngineRegistry;
  ledger?: V4ForecastLedger;
  discover?: typeof discoverV4Slate;
  run?: typeof runFullSlateV4;
  mode?: "SHADOW" | "PRODUCTION";
} = {}): Promise<NflProspectiveCollectionResult> {
  const now = input.now ?? new Date();
  const days = input.days ?? 8;
  const ledger = input.ledger ?? new DbV4ForecastLedger();
  const discover = input.discover ?? discoverV4Slate;
  const run = input.run ?? runFullSlateV4;
  // Production is an explicit operational cutover, never inferred from an
  // engine's lifecycle label. Absent the flag this remains the old shadow job.
  const mode = input.mode ?? (process.env["V4_OFFICIAL_CUTOVER"] === "true" ? "PRODUCTION" : "SHADOW");
  const runs: FullSlateCoverage[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = easternDate(new Date(now.getTime() + offset * 86_400_000));
    const events = await discover("NFL", date);
    if (!events.length) continue;
    runs.push(await run({
      sport: "NFL", sportDate: date, now, mode, events,
      registry: input.registry ?? canonicalV4EngineRegistry,
      ledger,
    }));
  }
  const scheduledEvents = runs.reduce((sum, runResult) => sum + runResult.scheduledEvents, 0);
  const eligibleEvents = runs.reduce((sum, runResult) => sum + runResult.eligibleEvents, 0);
  const forecastsPersisted = runs.reduce((sum, runResult) => sum + runResult.forecastedEvents, 0);
  const failedEvents = runs.reduce((sum, runResult) => sum + runResult.failedEvents, 0);
  const result = {
    capturedAt: now.toISOString(),
    datesAttempted: days,
    scheduledEvents,
    eligibleEvents,
    forecastsPersisted,
    failedEvents,
    coveragePct: eligibleEvents ? forecastsPersisted / eligibleEvents * 100 : 100,
    runs,
  };
  logger.info({
    ...result,
    runs: result.runs.map((runResult) => ({
      date: runResult.sportDate,
      scheduled: runResult.scheduledEvents,
      forecasted: runResult.forecastedEvents,
      failed: runResult.failedEvents,
    })),
  }, "NFL V4 prospective shadow collection completed");
  return result;
}