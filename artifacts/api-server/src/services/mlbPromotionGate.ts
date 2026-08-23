/**
 * Explicit, frozen-cohort promotion gate for the conservative MLB full-game
 * moneyline model. This never promotes a model; it only produces auditable
 * evidence that a separately approved lifecycle transition may rely on.
 */

export const MLB_PROMOTION_GATE_VERSION = "mlb-moneyline-gate-v1";
export const MLB_GATE_MIN_SAMPLE = 100;

export interface MlbGateMetrics {
  id: number;
  sampleSize: number;
  totalPicks: number;
  roi: number | null;
  netUnits: number;
  maxDrawdown: number | null;
  clvAverage: number | null;
  posClvRate: number | null;
  brierScore: number | null;
  calibrationError: number | null;
  periodStart: string;
  periodEnd: string;
}

export interface MlbGateBacktest {
  id: number;
  datasetId: number;
  testWindowStart: string | null;
  testWindowEnd: string | null;
  sampleSize: number | null;
  test: { netUnits?: number; maxDrawdown?: number | null } | null;
}

export interface MlbPromotionGate {
  version: string;
  verdict: "passed" | "failed";
  evaluatedAt: string;
  frozenCohort: {
    periodStart: string;
    periodEnd: string;
    championDatasetId: number;
    challengerDatasetId: number;
    championBacktestId: number;
    challengerBacktestId: number;
    championMetricId: number;
    challengerMetricId: number;
  };
  metrics: { champion: MlbGateMetrics; challenger: MlbGateMetrics };
  thresholds: Record<string, number>;
  checks: Record<string, boolean>;
  approval?: { approvedBy: string; approvedAt: string };
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function evaluateMlbPromotionGate(input: {
  champion: MlbGateMetrics;
  challenger: MlbGateMetrics;
  championBacktest: MlbGateBacktest | null;
  challengerBacktest: MlbGateBacktest | null;
  evaluatedAt?: string;
}): MlbPromotionGate {
  const { champion, challenger, championBacktest, challengerBacktest } = input;
  const testWindowsAligned = Boolean(
    championBacktest && challengerBacktest
    && championBacktest.datasetId === challengerBacktest.datasetId
    && championBacktest.testWindowStart === challengerBacktest.testWindowStart
    && championBacktest.testWindowEnd === challengerBacktest.testWindowEnd,
  );
  const periodsAligned = champion.periodStart === challenger.periodStart
    && champion.periodEnd === challenger.periodEnd;
  const checks = {
    minimumSample: champion.sampleSize >= MLB_GATE_MIN_SAMPLE
      && challenger.sampleSize >= MLB_GATE_MIN_SAMPLE
      && (championBacktest?.sampleSize ?? 0) >= MLB_GATE_MIN_SAMPLE
      && (challengerBacktest?.sampleSize ?? 0) >= MLB_GATE_MIN_SAMPLE,
    frozenChronologicalCohort: periodsAligned && testWindowsAligned,
    calibration: finite(champion.calibrationError) && finite(challenger.calibrationError)
      && finite(champion.brierScore) && finite(challenger.brierScore)
      && challenger.calibrationError <= champion.calibrationError + 0.01
      && challenger.brierScore <= champion.brierScore + 0.005,
    closingPrice: finite(champion.clvAverage) && finite(challenger.clvAverage)
      && finite(champion.posClvRate) && finite(challenger.posClvRate)
      && challenger.clvAverage >= champion.clvAverage - 0.0025
      && challenger.posClvRate >= champion.posClvRate - 0.02,
    economics: finite(champion.roi) && finite(challenger.roi)
      && challenger.roi > champion.roi + 0.01
      && challenger.netUnits >= 0,
    drawdown: finite(champion.maxDrawdown) && finite(challenger.maxDrawdown)
      && challenger.maxDrawdown <= champion.maxDrawdown + 2,
    coverage: champion.totalPicks > 0
      && challenger.totalPicks >= champion.totalPicks * 0.95,
    stability: (challengerBacktest?.test?.netUnits ?? Number.NEGATIVE_INFINITY) >= 0
      && finite(challengerBacktest?.test?.maxDrawdown)
      && finite(championBacktest?.test?.maxDrawdown)
      && challengerBacktest!.test!.maxDrawdown! <= championBacktest!.test!.maxDrawdown! + 2,
  };
  const verdict = Object.values(checks).every(Boolean) ? "passed" : "failed";
  return {
    version: MLB_PROMOTION_GATE_VERSION,
    verdict,
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    frozenCohort: {
      periodStart: challenger.periodStart,
      periodEnd: challenger.periodEnd,
      championDatasetId: championBacktest?.datasetId ?? -1,
      challengerDatasetId: challengerBacktest?.datasetId ?? -1,
      championBacktestId: championBacktest?.id ?? -1,
      challengerBacktestId: challengerBacktest?.id ?? -1,
      championMetricId: champion.id,
      challengerMetricId: challenger.id,
    },
    metrics: { champion, challenger },
    thresholds: {
      minimumSample: MLB_GATE_MIN_SAMPLE,
      maxCalibrationErrorRegression: 0.01,
      maxBrierRegression: 0.005,
      maxClvRegression: 0.0025,
      maxPositiveClvRateRegression: 0.02,
      minimumRoiImprovement: 0.01,
      maxDrawdownRegression: 2,
      minimumCoverageRatio: 0.95,
    },
    checks,
  };
}

export function isPassingMlbPromotionGate(value: unknown): value is MlbPromotionGate {
  if (!value || typeof value !== "object") return false;
  const gate = value as Partial<MlbPromotionGate>;
  const checks = gate.checks;
  return gate.version === MLB_PROMOTION_GATE_VERSION
    && gate.verdict === "passed"
    && Boolean(gate.frozenCohort)
    && Boolean(gate.metrics?.champion && gate.metrics?.challenger)
    && Boolean(checks)
    && Object.values(checks ?? {}).length > 0
    && Object.values(checks ?? {}).every((check) => check === true)
    && (gate.frozenCohort?.championBacktestId ?? -1) > 0
    && (gate.frozenCohort?.challengerBacktestId ?? -1) > 0
    && (gate.frozenCohort?.championDatasetId ?? -1) > 0
    && (gate.frozenCohort?.challengerDatasetId ?? -1) > 0
    && gate.frozenCohort?.championDatasetId === gate.frozenCohort?.challengerDatasetId
    && (gate.frozenCohort?.championMetricId ?? -1) > 0
    && (gate.frozenCohort?.challengerMetricId ?? -1) > 0;
}