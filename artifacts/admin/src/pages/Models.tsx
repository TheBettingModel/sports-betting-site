import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Rocket, RotateCcw, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, LineChart, Line,
} from "recharts";
import {
  adminApi, modelApi,
  type ModelVersion, type SportStat, type WeeklyHistoryEntry,
} from "@/lib/api";
import { timeAgo, statusColor, statusDot, pct } from "@/lib/utils";

const STATUS_ORDER = ["production", "challenger", "approved", "development", "retired", "rejected"];
const SPORT_TABS = ["ALL", "MLB", "NFL", "NBA", "WNBA", "NHL", "Soccer"];

// ── Colour helpers ─────────────────────────────────────────────────────────────

function winRateColor(rate: number): string {
  if (rate >= 0.55) return "#4ade80"; // green-400
  if (rate >= 0.50) return "#facc15"; // yellow-400
  return "#f87171";                   // red-400
}

function unitBarColor(units: number): string {
  return units >= 0 ? "#4ade80" : "#f87171";
}

// ── Format week label ──────────────────────────────────────────────────────────

function formatWeek(iso: string): string {
  // iso = "2025-07-14" (Monday of that week)
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// ── Stat cards ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  highlight?: string;
}

function StatCard({ label, value, sub, highlight }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold" style={highlight ? { color: highlight } : undefined}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Win-rate trend line chart ──────────────────────────────────────────────────

interface WinRateChartProps {
  history: WeeklyHistoryEntry[];
  sport: string;
}

function WinRateChart({ history, sport }: WinRateChartProps) {
  const filtered = history
    .filter((h) => h.sport === sport)
    .map((h) => ({
      week: formatWeek(h.week),
      winPct: h.totalPicks > 0 ? Math.round((h.wins / h.totalPicks) * 1000) / 10 : null,
      picks: h.totalPicks,
    }));

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No graded picks in the last 8 weeks.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={filtered} margin={{ left: 4, right: 12, top: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 10, fill: "#71717a" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10, fill: "#71717a" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.1)" }}
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
          formatter={(v: number) => [`${v}%`, "Win Rate"]}
        />
        <ReferenceLine y={50} stroke="#52525b" strokeDasharray="4 2" />
        <Line
          type="monotone"
          dataKey="winPct"
          stroke="#60a5fa"
          strokeWidth={2}
          dot={{ r: 3, fill: "#60a5fa" }}
          connectNulls={false}
          name="Win %"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Units won/lost bar chart ───────────────────────────────────────────────────

interface UnitsChartProps {
  history: WeeklyHistoryEntry[];
  sport: string;
}

function UnitsChart({ history, sport }: UnitsChartProps) {
  const filtered = history
    .filter((h) => h.sport === sport)
    .map((h) => ({
      week: formatWeek(h.week),
      unitsWon: h.unitsWon,
    }));

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No graded picks in the last 8 weeks.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={filtered} margin={{ left: 4, right: 12, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 10, fill: "#71717a" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}u`}
          tick={{ fontSize: 10, fill: "#71717a" }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
          formatter={(v: number) => [`${v > 0 ? "+" : ""}${v} units`, "Units Won/Lost"]}
        />
        <ReferenceLine y={0} stroke="#52525b" strokeDasharray="4 2" />
        <Bar dataKey="unitsWon" radius={[3, 3, 0, 0]} maxBarSize={28}>
          {filtered.map((entry, i) => (
            <Cell key={i} fill={unitBarColor(entry.unitsWon)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Per-tier performance table ────────────────────────────────────────────────

interface TierTableProps {
  stats: SportStat[];
}

function TierTable({ stats }: TierTableProps) {
  if (stats.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No tier data available yet.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sport</th>
            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Overall</th>
            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Elite</th>
            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Strong</th>
            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Playable</th>
            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Picks</th>
            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Brier</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {stats.map((s) => (
            <tr key={s.sport} className="hover:bg-accent/20 transition-colors">
              <td className="px-3 py-2 font-medium text-foreground">{s.sport}</td>
              <td className="px-3 py-2 text-right">
                <span style={{ color: winRateColor(s.accuracyRate) }} className="font-medium">
                  {pct(s.accuracyRate)}
                </span>
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {s.eliteAccuracy != null ? pct(s.eliteAccuracy) : "—"}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {s.strongAccuracy != null ? pct(s.strongAccuracy) : "—"}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {s.playableAccuracy != null ? pct(s.playableAccuracy) : "—"}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">{s.totalPredictions}</td>
              <td className="px-3 py-2 text-right text-muted-foreground font-mono text-xs">
                {s.brierScore != null ? s.brierScore.toFixed(3) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Performance Panel ─────────────────────────────────────────────────────────

function PerformancePanel() {
  const [selectedSport, setSelectedSport] = useState("ALL");

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["model-stats"],
    queryFn: () => modelApi.stats(),
    refetchInterval: 60_000,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["model-stats-history"],
    queryFn: () => modelApi.statsHistory(),
    refetchInterval: 60_000,
  });

  const stats = statsData?.stats ?? [];
  const history = historyData?.history ?? [];
  const overallAccuracy = statsData?.overallAccuracy ?? 0;
  const totalPicks = statsData?.totalPredictions ?? 0;

  // Overall Brier score (average across sports)
  const sportsWithBrier = stats.filter((s) => s.brierScore != null);
  const overallBrier =
    sportsWithBrier.length > 0
      ? sportsWithBrier.reduce((sum, s) => sum + (s.brierScore ?? 0), 0) / sportsWithBrier.length
      : null;

  // Overall avg CLV
  const sportsWithClv = stats.filter((s) => s.avgClv != null);
  const overallAvgClv =
    sportsWithClv.length > 0
      ? sportsWithClv.reduce((sum, s) => sum + (s.avgClv ?? 0), 0) / sportsWithClv.length
      : null;

  const isLoading = statsLoading || historyLoading;

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-muted-foreground text-sm">Loading performance data…</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Top stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Overall Accuracy"
          value={pct(overallAccuracy)}
          sub={`${totalPicks} graded picks`}
          highlight={winRateColor(overallAccuracy)}
        />
        <StatCard
          label="Total Picks"
          value={totalPicks.toLocaleString()}
          sub="all sports combined"
        />
        <StatCard
          label="Avg CLV"
          value={
            overallAvgClv != null
              ? `${overallAvgClv > 0 ? "+" : ""}${(overallAvgClv * 100).toFixed(1)}%`
              : "—"
          }
          sub="closing line value"
          highlight={overallAvgClv != null ? (overallAvgClv >= 0 ? "#4ade80" : "#f87171") : undefined}
        />
        <StatCard
          label="Avg Brier Score"
          value={overallBrier != null ? overallBrier.toFixed(3) : "—"}
          sub="lower is better"
        />
      </div>

      {/* ── Charts + tier table panel ── */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Win-Rate Trends & ROI</h2>
          </div>
        </div>

        {/* Sport selector tabs */}
        <div className="flex flex-wrap gap-1.5">
          {SPORT_TABS.map((sport) => (
            <button
              key={sport}
              onClick={() => setSelectedSport(sport)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                selectedSport === sport
                  ? "bg-primary text-primary-foreground"
                  : "bg-background border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {sport}
            </button>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Win-rate line chart */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">
              Win Rate % — Last 8 Weeks ({selectedSport})
            </p>
            <WinRateChart history={history} sport={selectedSport} />
          </div>

          {/* Units bar chart */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">
              Units Won / Lost — Last 8 Weeks ({selectedSport})
            </p>
            <UnitsChart history={history} sport={selectedSport} />
          </div>
        </div>

        {/* Per-tier performance table */}
        {stats.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">
              Per-Sport Tier Performance
            </p>
            <TierTable stats={stats} />
          </div>
        )}

        {stats.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No graded picks yet — charts and stats will appear once results are recorded.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Models() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["models", filter],
    queryFn: () => modelApi.list(filter === "all" ? undefined : filter),
    refetchInterval: 30_000,
  });

  const deployMutation = useMutation({
    mutationFn: (id: number) => adminApi.deployModel(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["models"] }); },
  });

  const rollbackMutation = useMutation({
    mutationFn: (id: number) => adminApi.rollbackModel(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["models"] }); },
  });

  const models: ModelVersion[] = data?.models ?? [];
  const sorted = [...models].sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a.status);
    const bi = STATUS_ORDER.indexOf(b.status);
    return ai - bi || a.sport.localeCompare(b.sport);
  });

  const filters = ["all", "production", "challenger", "approved", "development", "retired"];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Model Registry</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Deploy, rollback, and monitor model versions</p>
      </div>

      {/* Performance charts + stat cards */}
      <PerformancePanel />

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading models…</div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sport</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Market</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Model ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No models found.
                  </td>
                </tr>
              ) : sorted.map((m) => (
                <tr key={m.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusDot(m.status)}`} />
                      <span className={`capitalize text-xs font-medium ${statusColor(m.status)}`}>{m.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground font-medium">{m.sport}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{m.market}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{m.modelId}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{timeAgo(m.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {m.status === "approved" && (
                        <button
                          onClick={() => deployMutation.mutate(m.id)}
                          disabled={deployMutation.isPending}
                          title="Deploy to production"
                          className="flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary border border-primary/30 rounded text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
                        >
                          <Rocket className="w-3 h-3" />
                          Deploy
                        </button>
                      )}
                      {m.status === "production" && m.rollbackTargetId && (
                        <button
                          onClick={() => {
                            if (confirm("Roll back this model to the previous version?")) {
                              rollbackMutation.mutate(m.id);
                            }
                          }}
                          disabled={rollbackMutation.isPending}
                          title="Rollback to previous version"
                          className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/30 rounded text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Rollback
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(deployMutation.error || rollbackMutation.error) && (
        <div className="bg-red-950/40 border border-red-800/50 rounded p-3 text-sm text-red-400">
          {((deployMutation.error || rollbackMutation.error) as Error).message}
        </div>
      )}
    </div>
  );
}
