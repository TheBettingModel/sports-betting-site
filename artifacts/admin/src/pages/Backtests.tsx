import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Play } from "lucide-react";
import { adminApi, type BacktestRun } from "@/lib/api";
import { timeAgo, statusColor, statusDot } from "@/lib/utils";

const SPORTS = ["NFL", "NCAAF", "NBA", "NCAAB", "MLB", "NHL", "Soccer", "UFC", "WNBA"];
const MARKETS = ["moneyline", "spread", "total"];

export function Backtests() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    modelVersionId: "",
    sport: "NFL",
    market: "moneyline",
    dateFrom: "",
    dateTo: "",
  });
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["backtests"],
    queryFn: () => adminApi.backtests(),
    refetchInterval: 15_000,
  });

  const trigger = useMutation({
    mutationFn: () =>
      adminApi.triggerBacktest({
        modelVersionId: parseInt(form.modelVersionId, 10),
        sport: form.sport,
        market: form.market,
        dateFrom: form.dateFrom || undefined,
        dateTo: form.dateTo || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["backtests"] });
      setShowForm(false);
    },
  });

  const runs: BacktestRun[] = data?.runs ?? [];

  const testMetrics = (run: BacktestRun) => {
    const m = run.metrics as Record<string, Record<string, number>> | null;
    return m?.test ?? null;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Backtests</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Walk-forward validation results</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          Run Backtest
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">New Backtest</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Model Version ID</label>
              <input
                type="number"
                value={form.modelVersionId}
                onChange={(e) => setForm({ ...form, modelVersionId: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
                placeholder="e.g. 1"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Sport</label>
              <select
                value={form.sport}
                onChange={(e) => setForm({ ...form, sport: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
              >
                {SPORTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Market</label>
              <select
                value={form.market}
                onChange={(e) => setForm({ ...form, market: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
              >
                {MARKETS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Date From (optional)</label>
              <input
                type="date"
                value={form.dateFrom}
                onChange={(e) => setForm({ ...form, dateFrom: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {trigger.error && (
            <p className="text-sm text-red-400">{(trigger.error as Error).message}</p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => trigger.mutate()}
              disabled={trigger.isPending || !form.modelVersionId}
              className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {trigger.isPending ? "Running…" : "Start"}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading backtests…</div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Model</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sample</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Win Rate</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Net Units</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Brier</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No backtests yet. Run one using the button above.
                  </td>
                </tr>
              ) : runs.map((r) => {
                const tm = testMetrics(r);
                return (
                  <tr key={r.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusDot(r.status)}`} />
                        <span className={`capitalize text-xs ${statusColor(r.status)}`}>{r.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">v{r.modelVersionId}</td>
                    <td className="px-4 py-3 text-right text-foreground">{tm?.sampleSize ?? r.sampleSize ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {tm?.winRate != null
                        ? <span className={tm.winRate >= 0.5 ? "text-green-400" : "text-red-400"}>{(tm.winRate * 100).toFixed(1)}%</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      {tm?.netUnits != null
                        ? <span className={tm.netUnits >= 0 ? "text-green-400" : "text-red-400"}>{tm.netUnits >= 0 ? "+" : ""}{tm.netUnits.toFixed(2)}u</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{tm?.brierScore?.toFixed(4) ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(r.startedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
