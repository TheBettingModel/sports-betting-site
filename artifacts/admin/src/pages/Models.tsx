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
  type RoiByRatingEntry, type RoiBySportEntry, type LossReviewEntry,
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

// ── ROI by rating tier chart ──────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  "Strong Buy": "#4ade80",
  "Buy":        "#60a5fa",
  "Neutral":    "#a1a1aa",
  "Fade":       "#f87171",
};
const TIER_ORDER = ["Strong Buy", "Buy", "Neutral", "Fade"];

interface RoiByRatingChartProps {
  byRating: RoiByRatingEntry[];
  bySport: RoiBySportEntry[];
}

function RoiByRatingChart({ byRating, bySport }: RoiByRatingChartProps) {
  const ratingData = TIER_ORDER
    .map((rec) => byRating.find((r) => r.recommendation === rec))
    .filter((r): r is RoiByRatingEntry => !!r && r.totalPicks > 0)
    .map((r) => ({
      name: r.recommendation === "Strong Buy" ? "Strong Buy" : r.recommendation,
      winRate: r.winRate,
      roi: r.roi,
      units: r.unitsWonLost,
      picks: r.totalPicks,
      color: TIER_COLORS[r.recommendation] ?? "#71717a",
    }));

  if (ratingData.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-sm text-muted-foreground">
        No graded picks yet — ROI by tier will appear after games are graded.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Win rate + ROI bar chart */}
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={ratingData} margin={{ left: 4, right: 12, top: 4, bottom: 0 }} barGap={4}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            width={38}
            domain={[0, 100]}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`}
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            width={42}
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
            formatter={(v: number, name: string) => [
              name === "winRate" ? `${v}%` : `${v > 0 ? "+" : ""}${v}%`,
              name === "winRate" ? "Win Rate" : "ROI",
            ]}
          />
          <ReferenceLine yAxisId="left" y={50} stroke="#52525b" strokeDasharray="4 2" />
          <Bar yAxisId="left" dataKey="winRate" radius={[3, 3, 0, 0]} maxBarSize={36} name="winRate">
            {ratingData.map((entry, i) => (
              <Cell key={i} fill={entry.color} fillOpacity={0.85} />
            ))}
          </Bar>
          <Bar yAxisId="right" dataKey="roi" radius={[3, 3, 0, 0]} maxBarSize={20} name="roi">
            {ratingData.map((entry, i) => (
              <Cell key={i} fill={entry.color} fillOpacity={0.45} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Summary table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">Tier</th>
              <th className="text-right px-2 py-1.5 text-muted-foreground font-medium">Picks</th>
              <th className="text-right px-2 py-1.5 text-muted-foreground font-medium">W–L</th>
              <th className="text-right px-2 py-1.5 text-muted-foreground font-medium">Win%</th>
              <th className="text-right px-2 py-1.5 text-muted-foreground font-medium">Units</th>
              <th className="text-right px-2 py-1.5 text-muted-foreground font-medium">ROI%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ratingData.map((r) => (
              <tr key={r.name} className="hover:bg-accent/20 transition-colors">
                <td className="px-2 py-1.5">
                  <span className="font-medium" style={{ color: r.color }}>{r.name}</span>
                </td>
                <td className="px-2 py-1.5 text-right text-muted-foreground">{r.picks}</td>
                <td className="px-2 py-1.5 text-right text-muted-foreground font-mono">
                  {byRating.find((b) => b.recommendation === r.name)?.wins ?? 0}–{byRating.find((b) => b.recommendation === r.name)?.losses ?? 0}
                </td>
                <td className="px-2 py-1.5 text-right font-medium" style={{ color: winRateColor(r.winRate / 100) }}>
                  {r.winRate}%
                </td>
                <td className="px-2 py-1.5 text-right font-mono" style={{ color: r.units >= 0 ? "#4ade80" : "#f87171" }}>
                  {r.units >= 0 ? "+" : ""}{r.units.toFixed(1)}u
                </td>
                <td className="px-2 py-1.5 text-right font-mono" style={{ color: r.roi >= 0 ? "#4ade80" : "#f87171" }}>
                  {r.roi >= 0 ? "+" : ""}{r.roi.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-sport ROI breakdown */}
      {bySport.length > 0 && (
        <div className="overflow-x-auto mt-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">By Sport</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">Sport</th>
                <th className="text-right px-2 py-1.5 text-muted-foreground font-medium">Picks</th>
                <th className="text-right px-2 py-1.5 text-muted-foreground font-medium">W–L</th>
                <th className="text-right px-2 py-1.5 text-muted-foreground font-medium">Win%</th>
                <th className="text-right px-2 py-1.5 text-muted-foreground font-medium">Units</th>
                <th className="text-right px-2 py-1.5 text-muted-foreground font-medium">ROI%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bySport.map((s) => (
                <tr key={s.sport} className="hover:bg-accent/20 transition-colors">
                  <td className="px-2 py-1.5 font-medium text-foreground">{s.sport}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{s.totalPicks}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground font-mono">{s.wins}–{s.losses}</td>
                  <td className="px-2 py-1.5 text-right font-medium" style={{ color: winRateColor(s.winRate / 100) }}>
                    {s.winRate}%
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono" style={{ color: s.unitsWonLost >= 0 ? "#4ade80" : "#f87171" }}>
                    {s.unitsWonLost >= 0 ? "+" : ""}{s.unitsWonLost.toFixed(1)}u
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono" style={{ color: s.roi >= 0 ? "#4ade80" : "#f87171" }}>
                    {s.roi >= 0 ? "+" : ""}{s.roi.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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

// ── Outcome review panel ──────────────────────────────────────────────────────

function OutcomeReviewPanel({
  reviews,
  patterns,
  isLoading,
}: {
  reviews: LossReviewEntry[];
  patterns: Array<{ classification: string; sampleSize: number }>;
  isLoading: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Recent Outcome Reviews</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Evidence and safe follow-ups from saved pregame decisions, market movement, availability, and data quality.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {patterns.slice(0, 3).map((pattern) => (
            <span key={pattern.classification} className="px-2 py-1 rounded bg-muted text-[11px] text-muted-foreground">
              {pattern.classification.replaceAll("_", " ")} · n={pattern.sampleSize}
            </span>
          ))}
        </div>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading loss reviews…</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviewed outcomes yet.</p>
      ) : (
        <div className="space-y-2">
          {reviews.slice(0, 8).map((loss) => (
            <article key={loss.pickId} className="rounded-md border border-border bg-background/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-medium text-foreground">
                  {loss.sport} · {loss.market} · {loss.selection.toUpperCase()}
                  {loss.finalScore ? <span className="text-muted-foreground font-normal"> · Final {loss.finalScore}</span> : null}
                </p>
                <p className={`text-xs font-medium ${loss.result === "win" ? "text-emerald-400" : "text-red-400"}`}>
                  {loss.result.toUpperCase()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(loss.modelProbability * 100).toFixed(0)}% model probability
                  {loss.clv != null ? ` · ${loss.clv >= 0 ? "+" : ""}${loss.clv.toFixed(2)} CLV` : ""}
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{loss.review?.summary}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(loss.review?.flags ?? []).map((flag) => (
                  <span key={flag} className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
                    {flag.replaceAll("_", " ")}
                  </span>
                ))}
                {(loss.review?.evidence?.factorEvidence ?? []).slice(0, 3).map((factor) => (
                  <span key={factor.factor} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {factor.factor}: {factor.contribution > 0 ? "+" : ""}{(factor.contribution * 100).toFixed(1)}pp
                  </span>
                ))}
                {(loss.review?.improvementActions ?? []).slice(0, 2).map((item) => (
                  <span key={`${item.area}-${item.action}`} className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                    {item.action}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
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

  const { data: roiData } = useQuery({
    queryKey: ["model-roi"],
    queryFn: () => modelApi.roi("season"),
    refetchInterval: 120_000,
  });

  const { data: outcomeReviewData, isLoading: outcomeReviewsLoading } = useQuery({
    queryKey: ["outcome-reviews", selectedSport],
    queryFn: () => adminApi.outcomeReviews(selectedSport),
    refetchInterval: 60_000,
  });

  const stats = statsData?.stats ?? [];
  const history = historyData?.history ?? [];
  const overallAccuracy = statsData?.overallAccuracy ?? 0;
  const totalPicks = statsData?.totalPredictions ?? 0;

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

        {/* ROI by rating tier */}
        <div>
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">
            ROI by Rating Tier (Season)
          </p>
          <RoiByRatingChart
            byRating={roiData?.byRating ?? []}
            bySport={roiData?.bySport ?? []}
          />
        </div>

        {stats.length === 0 && !roiData && (
          <p className="text-sm text-muted-foreground">
            No graded picks yet — charts and stats will appear once results are recorded.
          </p>
        )}
      </div>
      <OutcomeReviewPanel
        reviews={outcomeReviewData?.reviews ?? []}
        patterns={outcomeReviewData?.patterns ?? []}
        isLoading={outcomeReviewsLoading}
      />
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
