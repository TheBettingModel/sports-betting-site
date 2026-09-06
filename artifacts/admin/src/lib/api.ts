/**
 * Admin API client.
 *
 * All requests include the X-Master-Key header.
 * The key is stored in sessionStorage after login.
 */

const BASE = "/api";

const SESSION_KEY = "tbm_admin_token";
const SESSION_EXPIRES_KEY = "tbm_admin_token_expires";

export function getSessionToken(): string {
  const token = sessionStorage.getItem(SESSION_KEY) ?? "";
  const expires = sessionStorage.getItem(SESSION_EXPIRES_KEY);
  if (!token || !expires) return "";
  // Treat as expired if within 60s of expiry
  if (Date.now() >= new Date(expires).getTime() - 60_000) {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_EXPIRES_KEY);
    return "";
  }
  return token;
}

export function setSession(token: string, expiresAt: string): void {
  sessionStorage.setItem(SESSION_KEY, token);
  sessionStorage.setItem(SESSION_EXPIRES_KEY, expiresAt);
}

export async function clearSession(): Promise<void> {
  const token = getSessionToken();
  if (token) {
    // Best-effort revoke on the server
    await fetch(`${BASE}/admin/session`, {
      method: "DELETE",
      headers: { "X-Admin-Token": token },
    }).catch(() => {/* ignore */});
  }
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_EXPIRES_KEY);
}

export function isAuthenticated(): boolean {
  return getSessionToken().length > 0;
}

/** Exchange the master key for a session token. Returns null on bad key or lockout. */
export async function createSession(masterKey: string): Promise<{ token: string; expiresAt: string } | null> {
  const res = await fetch(`${BASE}/admin/session`, {
    method: "POST",
    headers: { "X-Master-Key": masterKey },
  });
  if (res.status === 401 || res.status === 429 || res.status === 503) return null;
  if (!res.ok) throw new Error(`Session error: ${res.status}`);
  return res.json() as Promise<{ token: string; expiresAt: string }>;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getSessionToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Admin-Token": token } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_EXPIRES_KEY);
    window.location.reload();
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

// ── Typed helpers ─────────────────────────────────────────────────────────────

export const adminApi = {
  overview: () => api.get<AdminOverview>("/admin/overview"),
  modelRuntimeStatus: () => api.get<ModelRuntimeStatus>("/admin/model-runtime-status"),
  automation: (job?: string, limit = 50) =>
    api.get<AutomationResult>(`/admin/automation?limit=${limit}${job ? `&job=${job}` : ""}`),
  alerts: (resolved = false, sport?: string) =>
    api.get<AlertsResult>(
      `/admin/alerts?resolved=${resolved}${sport ? `&sport=${sport}` : ""}`,
    ),
  alertsAll: (sport?: string) =>
    api.get<AlertsResult>(
      `/admin/alerts?resolved=all${sport ? `&sport=${sport}` : ""}`,
    ),
  resolveAlert: (type: "drift" | "dq", id: number, resolvedBy = "admin") =>
    api.post(`/admin/alerts/${type}/${id}/resolve`, { resolvedBy }),
  backtests: (modelVersionId?: number) =>
    api.get<BacktestsResult>(
      `/admin/backtests${modelVersionId ? `?modelVersionId=${modelVersionId}` : ""}`,
    ),
  triggerBacktest: (data: {
    modelVersionId: number;
    sport: string;
    market: string;
    dateFrom?: string;
    dateTo?: string;
  }) => api.post<BacktestRun>("/admin/backtests", data),
  triggerJob: (name: string) => api.post(`/admin/jobs/${name}/trigger`),
  deployModel: (id: number, performedBy = "admin", notes?: string) =>
    api.post(`/admin/models/${id}/deploy`, { performedBy, notes }),
  rollbackModel: (id: number, performedBy = "admin", notes?: string) =>
    api.post(`/admin/models/${id}/rollback`, { performedBy, notes }),
  // Snoozes
  snoozes: () => api.get<{ snoozes: SportSnooze[] }>("/admin/sports/snoozes"),
  snoozeSport: (sport: string, durationHours: number, reason?: string) =>
    api.post<SportSnooze>(`/admin/sports/${sport}/snooze`, { durationHours, reason }),
  unsnoozeSport: (sport: string) =>
    api.delete<{ message: string }>(`/admin/sports/${sport}/snooze`),
  resetDriftBaseline: () =>
    api.post<{ resolved: number; newAlerts: number; message: string }>("/admin/alerts/drift/reset-baseline"),
  outcomeReviews: (
    sport?: string,
    result: "all" | "win" | "loss" = "all",
    limit = 30,
  ) =>
    api.get<OutcomeReviewsResult>(
      `/admin/outcome-reviews?limit=${limit}&result=${result}${sport && sport !== "ALL" ? `&sport=${sport}` : ""}`,
    ),
  lossReviews: (sport?: string, limit = 30) =>
    api.get<LossReviewsResult>(
      `/admin/loss-reviews?limit=${limit}${sport && sport !== "ALL" ? `&sport=${sport}` : ""}`,
    ),
  forecastMetrics: (sport?: string, market?: string) =>
    api.get<{
      metrics: {
        all: ForecastMetricSummary;
        published: ForecastMetricSummary;
        forecastOnly: ForecastMetricSummary;
        qualified: ForecastMetricSummary;
        passed: ForecastMetricSummary;
      };
      dataAsOf: string;
    }>(`/admin/forecast-metrics${sport && sport !== "ALL" ? `?sport=${sport}` : ""}${market ? `${sport && sport !== "ALL" ? "&" : "?"}market=${market}` : ""}`),
  forecastReviews: (options?: {
    sport?: string;
    market?: string;
    segment?: "published" | "forecast_only";
    qualification?: "qualified" | "passed";
    result?: string;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (options?.sport && options.sport !== "ALL") params.set("sport", options.sport);
    if (options?.market) params.set("market", options.market);
    if (options?.segment) params.set("segment", options.segment);
    if (options?.qualification) params.set("qualification", options.qualification);
    if (options?.result) params.set("result", options.result);
    params.set("limit", String(options?.limit ?? 50));
    return api.get<{ reviews: ForecastReview[]; count: number; dataAsOf: string }>(
      `/admin/forecast-reviews?${params.toString()}`,
    );
  },
  marketComparisons: (sport = "NCAAF") =>
    api.get<MarketComparisonsResult>(`/admin/market-comparisons?sport=${encodeURIComponent(sport)}`),
  marketApprovals: () =>
    api.get<MarketApprovalsResult>("/admin/market-approvals"),
  recommendationPublicationAudit: () =>
    api.get<RecommendationPublicationAudit>("/admin/recommendation-publication-audit"),
  ncaafReadiness: () => api.get<NcaafReadiness>("/admin/ncaaf-readiness"),
  ncaafReadinessEvent: (eventId: string) =>
    api.get<NcaafEventReadiness>(`/admin/ncaaf-readiness/${encodeURIComponent(eventId)}`),
  ncaafV4Projections: () => api.get<NcaafV4ProjectionBoard>("/admin/ncaaf/v4/today-board"),
};

export const modelApi = {
  stats: () => api.get<ModelStatsResult>("/model/stats"),
  statsHistory: () => api.get<ModelStatsHistoryResult>("/model-stats/history"),
  roi: (period: "season" | "week" = "season") =>
    api.get<RoiResult>(`/results/roi?period=${period}`),
  list: (status?: string) =>
    api.get<{ models: ModelVersion[]; count: number }>(
      `/models${status ? `?status=${status}` : ""}`,
    ),
  compare: (champion: number, challenger: number) =>
    api.get<CompareResult>(`/models/compare?champion=${champion}&challenger=${challenger}`),
  updateStatus: (id: number, data: {
    newStatus: string;
    performedBy: string;
    masterApproved?: boolean;
    notes?: string;
  }) => api.patch<ModelVersion>(`/models/${id}/status`, data),
};

// ── Response types ─────────────────────────────────────────────────────────────

export interface FeedHealthEntry {
  sport: string;
  status: "ok" | "quiet" | "error" | "stale";
  gameCount: number | null;
  lastChecked: string | null;
  /** Worst unresolved DQ alert severity for this sport, or null if none. */
  alertSeverity: string | null;
  /** Number of active unresolved DQ alerts for this sport. */
  alertCount: number;
  /** Raw actionable recommendations blocked by publication safety. */
  suppressedCount: number | null;
  /** Picks published or currently publishable after safety evaluation. */
  publishedCount: number | null;
}

export interface AdminOverview {
  production: { modelCount: number; models: ModelSummary[] };
  challengers: { count: number; models: ModelSummary[] };
  alerts: { driftAlerts: number; dataQualityAlerts: number; total: number };
  grading: { pendingPicks: number };
  performance: { totalGradedPicks: number; avgROI: number | null; avgWinRate: number | null };
  automation: { health: string; lastRun: AutoRunSummary | null };
  feedHealth: FeedHealthEntry[];
}

/**
 * Read-only guarded-serving state. Values are returned by the runtime resolver;
 * the client must not infer serving or publication state from model registry rows.
 */
export interface ModelRuntimeSportStatus {
  sport: "MLB" | "NCAAF";
  configuredMode: string;
  activePrimaryEngine: string;
  candidateEngine: string | null;
  candidateVersion: string | null;
  candidateArtifactHash: string | null;
  candidateArtifactId: string | null;
  inputContract: string | null;
  approvalStatus: string;
  /** Whether the configured candidate has a registered serving executor. */
  executorAvailable: boolean;
  /** Actual executor liveness reported by the runtime. */
  executorHealth: "HEALTHY" | "UNHEALTHY" | "UNAVAILABLE";
  executorHealthReason: string;
  /** Exact runtime reproducibility gate result. */
  reproducibilityReady: boolean;
  /** Whether the official publication bridge is ready for this runtime. */
  officialBridgeReady: boolean;
  officialBridgeStatus: "READY" | "BLOCKED";
  /** Per-market runtime support classifications from the guarded-serving resolver. */
  supportedMarkets: Record<
    string,
    "EXECUTOR_SUPPORTED" | "DERIVABLE_BUT_NOT_APPROVED" | "NOT_SUPPORTED" | "LEGACY_ONLY"
  >;
  /** Resolver result after mode, approval, and executor availability are applied. */
  resolvedServingState: "INCUMBENT_ACTIVE" | "INCUMBENT_FALLBACK" | "CANDIDATE_ACTIVE" | "STARTUP_BLOCKED";
  runtimeHealth: string;
  publicationStatus: "APPROVED_NOT_ENABLED" | "ELIGIBLE_BY_APPROVAL" | "BLOCKED_BY_APPROVAL" | "BLOCKED_BY_RUNTIME" | "BLOCKED_BY_OFFICIAL_BRIDGE";
}

export interface ModelRuntimeOfficialPrediction {
  predictionId: string;
  sport: string;
  engine: string;
  modelVersion: string;
  publicationStatus: string;
  predictionTimestamp: string;
}

export interface TechnicalReadiness {
  TECHNICAL_CUTOVER_READY: boolean;
  MODEL_EVIDENCE_READY: boolean;
  GUARDED_APPROVED: boolean;
  technicalBlockers: string[];
  modelEvidenceBlockers: string[];
  guardedApprovalBlockers: string[];
  guardedPersistence: {
    environment: string;
    schema: { tables: number; triggers: number; indexes: string[]; constraints: string[] };
    counts: { approvalLedger: number; officialIdentity: number; officialLifecycle: number };
    maxSafeExecutionAgeHours: number;
    appendOnlyMutationRejectionVerified: boolean;
    latestSafeMutationVerification: string | null;
    latestDryRunResolutions: Record<string, { resolvedAt: string; dryRun: boolean; resolution: string; fallbackUsed: boolean; publicationDisposition: string } | null>;
    latestSafeExecutions: Record<string, { executedAt: string; reproducible: boolean; executorHealth: string; pitSafe: boolean; leakageSafe: boolean; safe: boolean } | null>;
    officialHistoryIntegrity: {
      orphanedPredictionIdentities: number;
      orphanedLifecycleEvents: number;
      identitiesWithoutLifecycle: number;
    };
  };
}

export interface ModelRuntimeStatus {
  generatedAt: string;
  automaticRetraining: string;
  automaticParameterChanges: string;
  automaticPromotion: string;
  sports: ModelRuntimeSportStatus[];
  latestOfficialPrediction: ModelRuntimeOfficialPrediction | null;
  technicalReadiness: TechnicalReadiness;
}

export interface NcaafReasonCount {
  reason: string;
  count: number;
}

export interface NcaafReadiness {
  engineeringReadyForV4: boolean;
  evidenceReadyForV4: boolean;
  readyForV4: boolean;
  gates: { engineering: Record<string, boolean>; evidence: Record<string, boolean> };
  blockers: string[];
  legacyCohort: { total: number; classified: number; graded: number; pending: number; officialExcluded: number };
  featureSnapshots: { total: number; ready: number; blocked: number; unknown: number; topBlockedReasons: NcaafReasonCount[] };
  footballIntelligenceSnapshots: {
    schemaVersion: string; total: number; ready: number; partial: number; blocked: number;
    topBlockedReasons: NcaafReasonCount[]; pointInTimeViolations: number;
  };
  evidenceRuns: {
    active: number;
    stale: number;
    finalized: number;
    topPartialCauses: NcaafReasonCount[];
    topFailedCauses: NcaafReasonCount[];
    recent: Array<{
      id: number; runKey: string; requestedFrom: string; requestedTo: string;
      capturedAt: string; completedAt: string | null; status: string;
      providers: unknown; coverage: unknown; partialReasons: unknown; errorDetails: unknown;
    }>;
  };
  sportsEvidenceCoverage: {
    gameEvidenceRows: number; entityObservationRows: number; observedGames: number;
    topMissingReasons: NcaafReasonCount[];
  };
  teamGamePerformance: {
    rows: number;
    quality: { populated: number; average: number | null };
    reliability: { populated: number; average: number | null };
    missingDomainCoverage: Array<{ domain: string; count: number }>;
    topMissingReasons: NcaafReasonCount[];
  };
  marketEvidenceCoverage: {
    total: number; matched: number; unmatched: number;
    byIdentity: Array<{ marketIdentityStatus: string; marketIdentityReason: string; count: number }>;
    topMissingReasons: NcaafReasonCount[];
  };
  cohorts: { finalPregame: number; liveShadow: number; supported: boolean };
  providerCapabilities: {
    inventory: Array<{ provider: string; capability: string; state: string; pointInTimeState: string; evidence: string; requiredProvider?: string }>;
    blockers: Array<{ provider: string; capability: string; state: string; pointInTimeState: string; reason: string; requiredProvider?: string }>;
  };
  pointInTime: { violations: number };
  validation: {
    evaluations: { total: number; excluded: number; graded: number };
    walkForward: { total: number; byStatus: Record<string, number> };
    promotions: { total: number; byDecision: Record<string, number>; topReasons: NcaafReasonCount[] };
  };
  dataAsOf: string;
}

export interface NcaafEventReadiness {
  eventId: string;
  canonicalIdentity: Record<string, unknown>;
  sportsEvidence: Array<Record<string, unknown>>;
  featureSnapshots: Array<Record<string, unknown>>;
  cohorts: Array<Record<string, unknown>>;
  teamGamePerformance: { rows: number; rowsByQuality: Array<Record<string, unknown>> };
  marketMatch: { total: number; matched: number; unmatched: number; observations: Array<Record<string, unknown>> };
  missingReasons: Record<string, unknown[]>;
  quality: { featureReady: boolean; pointInTimeViolations: number };
  engineeringReadyForV4: boolean;
  evidenceReadyForV4: boolean;
  readyForV4: boolean;
  blockers: Array<Record<string, unknown>>;
  dataAsOf: string;
}

export interface RecommendationPublicationAuditRow {
  gameId: string;
  sport: string;
  matchup: string;
  startsAt: string | null;
  market: string;
  modelVersion: string | null;
  modelProbability: number;
  marketProbability: number;
  edge: number;
  confidence: string;
  approvalStatus: string;
  rawModelRecommendation: string;
  publicationStatus: "PUBLISHED" | "PUBLISHABLE" | "BLOCKED" | "NOT_APPLICABLE_NO_PLAY";
  publicationBlockReason: string | null;
  publicationBlockDetails: string[];
  displayRecommendation: string;
}

export interface RecommendationPublicationAudit {
  date: string;
  summary: {
    totalGames: number;
    rawDistribution: Record<string, number>;
    publication: Record<string, number>;
    blockedReasons: Record<string, number>;
  };
  rows: RecommendationPublicationAuditRow[];
  dataAsOf: string;
}

export interface ModelSummary {
  id: number;
  modelId: string;
  sport: string;
  market: string;
  deployedAt?: string | null;
}

export interface AutoRunSummary {
  jobName: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
}

export interface ModelVersion {
  id: number;
  modelId: string;
  sport: string;
  market: string;
  status: string;
  notes?: string | null;
  hyperparameters?: Record<string, unknown> | null;
  evaluationMetrics?: Record<string, unknown> | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  deployedAt?: string | null;
  deploymentApprovedBy?: string | null;
  rollbackTargetId?: number | null;
  createdAt: string;
}

export interface MarketCandidate {
  selection: string;
  teamAbbr: string;
  line?: number | null;
  odds: number;
  openingLine?: number | null;
  openingPrice?: number | null;
  currentLine?: number | null;
  currentPrice: number;
  closingLine?: number | null;
  closingPrice?: number | null;
  modelProbability: number;
  fairPrice: number;
  edge: number;
  expectedValue: number;
  noVigProbability?: number;
  opposingLine?: number;
  opposingPrice?: number;
  pushProbability?: number;
  uncertainty: number;
  confidence: string;
  recommendation: string;
  units: number;
  sportsbook?: string | null;
  capturedAt: string;
  modelVersion: string;
  state: string;
  gateReasons?: string[];
}

export interface MarketComparison {
  game: { id: string; matchup: string; startsAt: string | null };
  moneylineCandidate: MarketCandidate;
  spreadCandidate: MarketCandidate | null;
  officialSelectedMarket: "moneyline" | "spread" | null;
  selectionScores: {
    moneyline: { score: number; components: Record<string, number> };
    spread: { score: number; components: Record<string, number> } | null;
  };
}

export interface MarketComparisonsResult {
  sport: string;
  comparisons: MarketComparison[];
  dataAsOf: string;
}

export type MarketApprovalStatus =
  | "UNVALIDATED"
  | "SHADOW"
  | "PROVISIONAL"
  | "PRODUCTION_APPROVED"
  | "SUSPENDED";

export interface MarketApprovalLayer {
  status: "PASSED" | "FAILED" | "INSUFFICIENT";
  reasons: string[];
  metrics: Record<string, number | string | boolean | null>;
}

export interface MarketApprovalDecision {
  id: number;
  sport: string;
  market: string;
  modelVersion: string;
  evaluationVersion: string;
  datasetVersion: string;
  featureSchemaVersion: string;
  evidenceCutoff: string;
  sampleSize: number;
  dataCoverage: number | null;
  dataIntegrity: MarketApprovalLayer;
  predictiveQuality: MarketApprovalLayer;
  bettingQuality: MarketApprovalLayer;
  status: MarketApprovalStatus;
  reason: string;
  previousStatus: string | null;
  evaluationMetadata: Record<string, unknown>;
  createdAt: string;
}

export interface MarketApprovalsResult {
  approvals: MarketApprovalDecision[];
  dataAsOf: string;
}

export interface AutomationRun {
  id: number;
  jobName: string;
  startedAt: string;
  completedAt?: string | null;
  status: string;
  recordsProcessed: number;
  errorDetails?: string | null;
  retryCount: number;
  /** Per-sport game counts for odds-ingestion runs: number = games fetched, "error" = fetch failed */
  dataSourceFreshness?: Record<string, number | "error"> | null;
}

export interface AutomationResult {
  runs: AutomationRun[];
  summary: Record<string, { last: string | null; successRate: number; count: number }>;
  count: number;
}

export interface DriftAlert {
  id: number;
  modelVersionId: number;
  alertType: string;
  metricName: string;
  baselineValue: number;
  currentValue: number;
  threshold: number;
  severity: string;
  isResolved: boolean;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  createdAt: string;
}

export interface DQAlert {
  id: number;
  alertType: string;
  sport?: string | null;
  severity: string;
  description: string;
  isResolved: boolean;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  createdAt: string;
}

export interface AlertsResult {
  drift: { alerts: DriftAlert[]; count: number };
  dataQuality: { alerts: DQAlert[]; count: number };
  totalActive: number;
}

export interface BacktestRun {
  id: number;
  modelVersionId: number;
  datasetId: number;
  status: string;
  trainWindowStart?: string | null;
  testWindowStart?: string | null;
  testWindowEnd?: string | null;
  metrics?: Record<string, unknown> | null;
  sampleSize?: number | null;
  avgOdds?: number | null;
  startedAt: string;
  completedAt?: string | null;
  errorDetails?: string | null;
}

export interface BacktestsResult {
  runs: BacktestRun[];
  count: number;
}

export interface SportStat {
  sport: string;
  accuracyRate: number;
  totalPredictions: number;
  correctPredictions: number;
  strongBuyAccuracy: number;
  buyAccuracy: number;
  avgClv: number | null;
  brierScore?: number | null;
  eliteAccuracy?: number | null;
  strongAccuracy?: number | null;
  playableAccuracy?: number | null;
  confidenceMultiplier: number;
  lastLearnedAt: string | null;
}

export interface ModelStatsResult {
  stats: SportStat[];
  overallAccuracy: number;
  totalPredictions: number;
  dataAsOf: string;
}

export interface WeeklyHistoryEntry {
  week: string;
  sport: string;
  wins: number;
  losses: number;
  pushes: number;
  unitsWon: number;
  totalPicks: number;
}

export interface ModelStatsHistoryResult {
  history: WeeklyHistoryEntry[];
}

export interface RoiEntry {
  key: string;
  wins: number;
  losses: number;
  pushes: number;
  totalPicks: number;
  winRate: number;
  unitsWonLost: number;
  unitsRisked: number;
  roi: number;
}

export interface RoiBySportEntry extends RoiEntry {
  sport: string;
}

export interface RoiByRatingEntry extends RoiEntry {
  recommendation: string;
}

export interface RoiResult {
  period: string;
  byRating: RoiByRatingEntry[];
  bySport: RoiBySportEntry[];
  bySportAndRating: Array<RoiEntry & { sport: string; recommendation: string }>;
  dataAsOf: string;
}

export interface SportSnooze {
  id: number;
  sport: string;
  snoozedUntil: string;
  snoozedBy: string;
  reason: string | null;
  createdAt: string;
}

export interface CompareResult {
  champion: { version: ModelVersion; metrics: Record<string, unknown> | null };
  challenger: { version: ModelVersion; metrics: Record<string, unknown> | null };
  verdict: string;
  promotionThresholds: {
    minSampleSize: number;
    minWinRate: number;
    challengerMeetsSampleSize: boolean;
    challengerMeetsWinRate: boolean | null;
  };
  sampleSize: number;
}

export interface OutcomeReviewEntry {
  pickId: number;
  sport: string;
  market: string;
  selection: string;
  recommendation: string;
  confidence: string;
  result: "win" | "loss";
  publishedAt: string;
  modelProbability: number;
  finalRating: number | null;
  finalScore: string | null;
  clv: number | null;
  gradedAt: string | null;
  review: {
    status?: string;
    primaryClassification?: string;
    flags?: string[];
    summary?: string;
    improvementActions?: Array<{
      area: string;
      priority: "high" | "medium" | "low";
      action: string;
    }>;
    evidence?: {
      factorEvidence?: Array<{ factor: string; contribution: number }>;
      calibrationError?: number;
    };
  } | null;
}

export type LossReviewEntry = OutcomeReviewEntry;

export interface OutcomeReviewsResult {
  reviews: OutcomeReviewEntry[];
  patterns: Array<{ classification: string; sampleSize: number }>;
  dataAsOf: string;
  resultFilter: "all" | "win" | "loss";
}

export type LossReviewsResult = OutcomeReviewsResult;

export interface ForecastMetricSummary {
  reviewCount: number;
  gradedCount: number;
  excludedCount: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  sampleSize: number;
  winRate: number | null;
  netUnits: number;
  roi: number | null;
  brierScore: number | null;
  calibrationError: number | null;
}

export interface ForecastReview {
  id: number;
  predictionId: number;
  gameId: string;
  modelVersionId: number;
  sport: string;
  market: string;
  selection: string;
  recommendation: string;
  confidence: string;
  odds: number | null;
  units: number;
  modelProbability: number;
  impliedProbability: number | null;
  fairProbability: number | null;
  edge: number;
  segment: "published" | "forecast_only";
  qualificationStatus: "qualified" | "passed";
  publishedPickId: number | null;
  isChallenger: boolean;
  snapshotSchemaVersion: number | null;
  predictionTimestamp: string;
  gameStartsAt: string | null;
  reviewStatus: "graded" | "excluded";
  exclusionReason: string | null;
  result: "win" | "loss" | "push" | "void" | "postponed" | null;
  unitsWonLost: number | null;
  finalScore: string | null;
  reviewedAt: string;
  createdAt: string;
}

export interface NcaafV4ModelOutput {
  id: string;
  version: string;
  configurationHash: string;
  parameterHash: string;
  featureSchema: string;
  featureCutoff: string;
  dataQuality: string;
  expectedHomePoints: number;
  expectedAwayPoints: number;
  expectedMargin: number;
  expectedTotal: number;
  homeWinProbability: number;
  awayWinProbability: number;
  fairHomeMoneyline: number | null;
  fairAwayMoneyline: number | null;
  marginUncertainty: number;
  totalUncertainty: number;
}

export interface NcaafV4MarketOutputMoneyline {
  bookmaker: string;
  capturedAt: string;
  homeOdds: number;
  awayOdds: number;
  noVigHomeProbability: number;
  noVigAwayProbability: number;
}

export interface NcaafV4MarketOutputSpread {
  bookmaker: string;
  capturedAt: string;
  selection: string;
  line: number;
  odds: number | null;
}

export interface NcaafV4MarketOutputTotal {
  bookmaker: string;
  capturedAt: string;
  selection: string;
  line: number;
  odds: number | null;
}

export interface NcaafV4MarketOutput {
  moneyline: NcaafV4MarketOutputMoneyline | null;
  spread: NcaafV4MarketOutputSpread | null;
  total: NcaafV4MarketOutputTotal | null;
}

export interface NcaafV4ComparisonSpread {
  projectedHomeMargin: number;
  line: number;
  difference: number;
}

export interface NcaafV4ComparisonTotal {
  projectedTotal: number;
  line: number;
  difference: number;
}

export interface NcaafV4Comparison {
  moneylineHomeEdge: number | null;
  spread: NcaafV4ComparisonSpread | null;
  total: NcaafV4ComparisonTotal | null;
}

export interface NcaafV4Projection {
  rank: number;
  gameId: string;
  predictionId: string;
  predictionHash: string;
  kickoffAt: string;
  awayTeam?: string | null;
  homeTeam?: string | null;
  neutralSite?: boolean | null;
  modelStatus: string;
  approvalStatus: string;
  publicationStatus: string;
  marketMatch: {
    classification: string;
    attachable: boolean;
    matchReason: string;
    rootCause: string;
  };
  model: NcaafV4ModelOutput;
  market?: NcaafV4MarketOutput;
  comparison?: NcaafV4Comparison;
  v4ModelOpinion: string;
  recommendationReason?: string;
  incumbentAgreement: string;
  status: string;
}

export interface NcaafV4ProjectionBoard {
  date: string;
  generatedAt: string;
  model: {
    id: string;
    modelStatus: string;
    approvalStatus: string;
    publicationStatus: string;
    configurationHash: string;
    parameterHash: string;
  };
  evidencePersistence: string;
  board: NcaafV4Projection[];
  exclusions: Record<string, unknown>[];
  audit: Record<string, unknown>;
}
