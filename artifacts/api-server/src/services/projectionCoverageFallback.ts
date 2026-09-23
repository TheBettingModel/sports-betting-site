import { computeProjection } from "./model";
import { stableHash, type CanonicalV4Forecast, type TbmV4Sport } from "./v4Platform";

type CoverageFallbackInput = Readonly<{
  gameId: string;
  sport: TbmV4Sport;
  eventStart: string;
  now: Date;
  homeRecord: string;
  awayRecord: string;
  persistedHomeWinPct?: number | null;
  persistedSpread?: number | null;
  persistedTotal?: number | null;
  marketHomeSpread?: number | null;
  marketTotal?: number | null;
}>;

function legacySport(sport: TbmV4Sport): string {
  if (sport === "SOCCER") return "Soccer";
  if (sport === "NCAAMB") return "NCAAB";
  return sport;
}

function roundedScore(value: number, sport: TbmV4Sport): number {
  const precision = ["MLB", "NHL", "SOCCER"].includes(sport) ? 10 : 1;
  return Math.max(0, Math.round(value * precision) / precision);
}

/**
 * Display-only coverage forecast. It uses the established daily projection
 * model when an advanced V4 engine cannot produce a forecast. Recommendation,
 * market-edge, units, and publication fields are intentionally discarded.
 */
export function buildProjectionCoverageFallback(input: CoverageFallbackInput): CanonicalV4Forecast {
  if (input.now >= new Date(input.eventStart)) throw new Error("POST_START_COVERAGE_FORECAST_REJECTED");

  const sport = legacySport(input.sport);
  const computed = computeProjection(
    input.gameId,
    sport,
    input.homeRecord,
    input.awayRecord,
    null,
  );
  const usePersisted = input.persistedTotal != null
    && Number.isFinite(input.persistedTotal)
    && input.persistedTotal > 0
    && input.persistedSpread != null
    && Number.isFinite(input.persistedSpread)
    && input.persistedHomeWinPct != null
    && input.persistedHomeWinPct > 0
    && input.persistedHomeWinPct < 100;
  const useMarketBaseline = !usePersisted
    && input.sport === "NCAAF"
    && input.marketHomeSpread != null
    && Number.isFinite(input.marketHomeSpread)
    && Math.abs(input.marketHomeSpread) <= 100
    && input.marketTotal != null
    && Number.isFinite(input.marketTotal)
    && input.marketTotal > 0
    && input.marketTotal <= 500;
  const total = usePersisted
    ? input.persistedTotal!
    : useMarketBaseline ? input.marketTotal! : computed.projectedTotal;
  const margin = usePersisted
    ? -input.persistedSpread!
    : useMarketBaseline ? -input.marketHomeSpread! : -computed.projectedSpread;
  const homeWin = usePersisted
    ? input.persistedHomeWinPct! / 100
    : useMarketBaseline
      ? 1 / (1 + Math.exp(-margin / 7))
      : computed.homeWinPct / 100;

  let drawProbability: number | undefined;
  let homeWinProbability = homeWin;
  let awayWinProbability = 1 - homeWin;
  if (input.sport === "SOCCER") {
    drawProbability = 0.26;
    awayWinProbability = Math.max(0.05, 1 - homeWinProbability - drawProbability);
    const probabilityTotal = homeWinProbability + drawProbability + awayWinProbability;
    homeWinProbability /= probabilityTotal;
    drawProbability /= probabilityTotal;
    awayWinProbability /= probabilityTotal;
  }

  const expectedHomeScore = roundedScore((total + margin) / 2, input.sport);
  const expectedAwayScore = roundedScore((total - margin) / 2, input.sport);
  const inputSnapshot = {
    gameId: input.gameId,
    sport: input.sport,
    eventStart: input.eventStart,
    homeRecord: input.homeRecord,
    awayRecord: input.awayRecord,
    homeWinProbability,
    awayWinProbability,
    drawProbability,
    expectedHomeScore,
    expectedAwayScore,
  };
  const inputHash = stableHash(inputSnapshot);
  const predictionTimestamp = input.now.toISOString();

  return {
    // Stable for the exact model input so repeated subscriber refreshes reuse
    // one immutable snapshot instead of allocating a new ledger version.
    predictionId: stableHash({ inputHash, model: "coverage-baseline-v2" }),
    sport: input.sport,
    gameId: input.gameId,
    modelFamily: "coverage-baseline",
    modelId: `tbm-${input.sport.toLowerCase()}-coverage-baseline`,
    modelVersion: "2.0.0",
    artifactId: "tbm-coverage-baseline-v2",
    artifactHash: stableHash({ model: "coverage-baseline", version: "2.0.0" }),
    inputContractVersion: "coverage-baseline-v2",
    configurationHash: stableHash({
      sport: input.sport,
      source: usePersisted ? "daily-refresh" : useMarketBaseline ? "pregame-market-baseline" : "record-baseline",
    }),
    parameterHash: stableHash({ sport: input.sport, model: "legacy-projection" }),
    contractId: "projection-coverage-v1",
    contractHash: stableHash({ required: ["score", "total", "margin", "probabilities"] }),
    featureSnapshotId: `coverage:${input.gameId}:${inputHash.slice(0, 16)}`,
    featureHash: inputHash,
    inputHash,
    dataCutoff: predictionTimestamp,
    predictionTimestamp,
    approvalState: "SHADOW",
    maturity: "DEVELOPING",
    homeWinProbability,
    awayWinProbability,
    drawProbability,
    expectedHomeScore,
    expectedAwayScore,
    expectedMargin: expectedHomeScore - expectedAwayScore,
    expectedTotal: expectedHomeScore + expectedAwayScore,
    evidenceTier: usePersisted
      ? "ESTABLISHED_DAILY_MODEL"
      : useMarketBaseline ? "PREGAME_MARKET_BASELINE" : "RECORD_BASELINE",
    qualityFlags: [
      "DISPLAY_PROJECTION_ONLY",
      "NOT_A_RECOMMENDATION",
      "COVERAGE_FALLBACK",
      ...(useMarketBaseline ? ["MARKET_INFORMED_BASELINE"] : []),
    ],
  };
}