import { logger } from "../lib/logger";
import {
  canonicalV4EngineRegistry,
  TBM_V4_PUBLIC_SPORTS,
  type TbmV4Sport,
  type V4EngineRegistry,
} from "./v4Platform";
import {
  DbV4ForecastLedger,
  discoverV4Slate,
  ensureSoccerRollingHistory,
  runFullSlateV4,
  type FullSlateCoverage,
  type V4ForecastLedger,
} from "./v4FullSlate";

type ShadowCaptureAttempt =
  | {
      sport: TbmV4Sport;
      sportDate: string;
      status: "completed";
      coverage: FullSlateCoverage;
    }
  | {
      sport: TbmV4Sport;
      sportDate: string;
      status: "failed";
      error: string;
    };

export type V4ShadowProjectionCaptureResult = Readonly<{
  capturedAt: string;
  datesAttempted: readonly string[];
  sportsAttempted: readonly TbmV4Sport[];
  scheduledEvents: number;
  forecastedEvents: number;
  failedEvents: number;
  failedAttempts: number;
  attempts: readonly ShadowCaptureAttempt[];
}>;

function easternDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Proactively persists validating projections for public slates. NCAAF uses a
 * rolling seven-day window; other sports retain today's and tomorrow's window.
 * This is deliberately SHADOW-only: it cannot publish a pick,
 * and runFullSlateV4 rejects every event whose pregame cutoff has passed.
 *
 * Attempts are isolated per sport/date so one provider or model failure cannot
 * prevent the other public sport boards from receiving valid projections.
 */
export async function runScheduledV4ShadowProjectionCapture(input: {
  now?: Date;
  sports?: readonly TbmV4Sport[];
  dates?: readonly string[];
  registry?: V4EngineRegistry;
  ledger?: V4ForecastLedger;
  discover?: typeof discoverV4Slate;
  run?: typeof runFullSlateV4;
} = {}): Promise<V4ShadowProjectionCaptureResult> {
  const now = input.now ?? new Date();
  const today = easternDate(now);
  const standardDates = input.dates ?? [today, addCalendarDays(today, 1)];
  const ncaafDates = input.dates ?? Array.from(
    { length: 7 },
    (_, index) => addCalendarDays(today, index),
  );
  const sports = input.sports ?? TBM_V4_PUBLIC_SPORTS;
  const registry = input.registry ?? canonicalV4EngineRegistry;
  const ledger = input.ledger ?? new DbV4ForecastLedger();
  const discover = input.discover ?? discoverV4Slate;
  const run = input.run ?? runFullSlateV4;
  const attempts: ShadowCaptureAttempt[] = [];

  for (const sport of sports) {
    const sportDates = sport === "NCAAF" ? ncaafDates : standardDates;
    for (const sportDate of sportDates) {
      try {
        const events = await discover(sport, sportDate);
        if (sport === "SOCCER") await ensureSoccerRollingHistory(sportDate, events);
        const coverage = await run({
          sport,
          sportDate,
          now,
          mode: "SHADOW",
          events,
          registry,
          ledger,
        });
        attempts.push({ sport, sportDate, status: "completed", coverage });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attempts.push({ sport, sportDate, status: "failed", error: message });
        logger.warn(
          { error, sport, sportDate },
          "V4 shadow projection capture failed for sport/date — continuing",
        );
      }
    }
  }

  const completed = attempts.filter(
    (attempt): attempt is Extract<ShadowCaptureAttempt, { status: "completed" }> =>
      attempt.status === "completed",
  );
  return {
    capturedAt: now.toISOString(),
    datesAttempted: [...new Set(sports.flatMap(
      (sport) => sport === "NCAAF" ? ncaafDates : standardDates,
    ))],
    sportsAttempted: [...sports],
    scheduledEvents: completed.reduce((sum, attempt) => sum + attempt.coverage.scheduledEvents, 0),
    forecastedEvents: completed.reduce((sum, attempt) => sum + attempt.coverage.forecastedEvents, 0),
    failedEvents: completed.reduce((sum, attempt) => sum + attempt.coverage.failedEvents, 0),
    failedAttempts: attempts.length - completed.length,
    attempts,
  };
}