import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, RefreshCw, Rocket, RotateCcw } from "lucide-react";
import { adminApi, modelApi, type ModelVersion } from "@/lib/api";
import { timeAgo, statusColor, statusDot } from "@/lib/utils";

const STATUS_ORDER = ["production", "challenger", "approved", "development", "retired", "rejected"];

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
