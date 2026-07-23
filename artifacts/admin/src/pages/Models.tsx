import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Rocket, RotateCcw, TrendingUp, BarChart2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { adminApi, modelApi, type ModelVersion, type SportStat } from "@/lib/api";
import { timeAgo, statusColor, statusDot, pct } from "@/lib/utils";

const STATUS_ORDER = ["production", "challenger", "approved", "development", "retired", "rejected"];

// ── Colour helpers ─────────────────────────────────────────────────────────────

function winRateColor(rate: number): string {
  if (rate >= 0.55) return "#4ade80"; // green-400
  if (rate >= 0.50) return "#facc15"; // yellow-400
  return "#f87171";                   // red-400
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

interface TooltipPayload {
  payload: SportStat;
}

function WinRateTooltip({
  active, payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]!.payload;
  return (
    <div className="bg-card border border-border rounded p-2.5 text-xs space-y-1 shadow-xl">
      <p className="font-semibold text-foreground">{d.sport}</p>
      <p className="text-muted-foreground">Overall: <span className="text-foreground font-medium">{pct(d.accuracyRate)}</span></p>
      <p className="text-muted-foreground">Strong Buy: <span className="text-foreground font-medium">{pct(d.strongBuyAccuracy)}</span></p>
      <p className="text-muted-foreground">Buy: <span className="text-foreground font-medium">{pct(d.buyAccuracy)}</span></p>
      <p className="text-muted-foreground">Sample: <span className="text-foreground font-medium">{d.totalPredictions} picks</span></p>
      {d.avgClv != null && (
        <p className="text-muted-foreground">Avg CLV: <span className="text-foreground font-medium">{d.avgClv > 0 ? "+" : ""}{(d.avgClv * 100).toFixed(1)}%</span></p>
      )}
    </div>
  );
}

// ── Performance charts panel ──────────────────────────────────────────────────

function PerformancePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["model-stats"],
    queryFn: () => modelApi.stats(),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-muted-foreground text-sm">Loading performance data…</div>
      </div>
    );
  }

  const stats = data?.stats ?? [];

  if (stats.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-1">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Performance</h2>
        </div>
        <p className="text-sm text-muted-foreground">No graded picks yet — charts will appear once results are recorded.</p>
      </div>
    );
  }

  // Sort by win rate descending for bar chart
  const sorted = [...stats].sort((a, b) => b.accuracyRate - a.accuracyRate);

  // Build comparison data for the grouped bar (Strong Buy vs Buy)
  const comparisonData = sorted.map((s) => ({
    sport: s.sport,
    "Strong Buy": Math.round(s.strongBuyAccuracy * 1000) / 10,
    "Buy": Math.round(s.buyAccuracy * 1000) / 10,
    sport_stat: s,
  }));

  const overallAccuracy = data?.overallAccuracy ?? 0;
  const totalPicks = data?.totalPredictions ?? 0;

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Performance</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Overall: <span className="font-medium" style={{ color: winRateColor(overallAccuracy) }}>{pct(overallAccuracy)}</span></span>
          <span>{totalPicks} graded picks</span>
        </div>
      </div>

      {/* Win rate by sport */}
      <div>
        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Win Rate by Sport</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              type="number"
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fontSize: 10, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="sport"
              tick={{ fontSize: 11, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip content={<WinRateTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <ReferenceLine x={0.5} stroke="#52525b" strokeDasharray="4 2" />
            <Bar dataKey="accuracyRate" radius={[0, 3, 3, 0]} maxBarSize={18}>
              {sorted.map((s) => (
                <Cell key={s.sport} fill={winRateColor(s.accuracyRate)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Strong Buy vs Buy comparison */}
      <div>
        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Strong Buy vs Buy Accuracy (%)</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={comparisonData} margin={{ left: 8, right: 8, top: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="sport"
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
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            />
            <ReferenceLine y={50} stroke="#52525b" strokeDasharray="4 2" />
            <Bar dataKey="Strong Buy" fill="#4ade80" radius={[3, 3, 0, 0]} maxBarSize={20} />
            <Bar dataKey="Buy" fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-400" />Strong Buy</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-400" />Buy</span>
          <span className="ml-auto">Dashed line = 50%</span>
        </div>
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

      {/* Performance charts */}
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
