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
  lossReviews: (sport?: string, limit = 30) =>
    api.get<LossReviewsResult>(
      `/admin/loss-reviews?limit=${limit}${sport && sport !== "ALL" ? `&sport=${sport}` : ""}`,
    ),
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
  /** Games analyzed today that landed below the publication threshold (Neutral/Fade). */
  suppressedCount: number | null;
  /** Games today with qualifying picks (Strong Buy/Buy). */
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

export interface LossReviewEntry {
  pickId: number;
  sport: string;
  market: string;
  selection: string;
  recommendation: string;
  confidence: string;
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
    evidence?: {
      factorEvidence?: Array<{ factor: string; contribution: number }>;
    };
  } | null;
}

export interface LossReviewsResult {
  reviews: LossReviewEntry[];
  patterns: Array<{ classification: string; sampleSize: number }>;
  dataAsOf: string;
}
