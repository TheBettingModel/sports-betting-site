/**
 * Admin API client.
 *
 * All requests include the X-Master-Key header.
 * The key is stored in sessionStorage after login.
 */

const BASE = "/api";

export function getMasterKey(): string {
  return sessionStorage.getItem("tbm_master_key") ?? "";
}

export function setMasterKey(key: string): void {
  sessionStorage.setItem("tbm_master_key", key);
}

export function clearMasterKey(): void {
  sessionStorage.removeItem("tbm_master_key");
}

export function isAuthenticated(): boolean {
  return getMasterKey().length > 0;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": getMasterKey(),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearMasterKey();
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
};

export const modelApi = {
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

export interface AdminOverview {
  production: { modelCount: number; models: ModelSummary[] };
  challengers: { count: number; models: ModelSummary[] };
  alerts: { driftAlerts: number; dataQualityAlerts: number; total: number };
  grading: { pendingPicks: number };
  performance: { totalGradedPicks: number; avgROI: number | null; avgWinRate: number | null };
  automation: { health: string; lastRun: AutoRunSummary | null };
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
