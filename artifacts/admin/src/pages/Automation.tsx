import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { adminApi, type AutomationRun } from "@/lib/api";
import { timeAgo, formatDate, statusColor, statusDot } from "@/lib/utils";

const JOBS = ["odds-ingestion", "result-grading", "analytics-refresh", "drift-monitoring"];

export function Automation() {
  const qc = useQueryClient();
  const [jobFilter, setJobFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["automation", jobFilter],
    queryFn: () => adminApi.automation(jobFilter === "all" ? undefined : jobFilter, 100),
    refetchInterval: 10_000,
  });

  const trigger = useMutation({
    mutationFn: (name: string) => adminApi.triggerJob(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["automation"] });
    },
  });

  const runs: AutomationRun[] = data?.runs ?? [];
  const summary = data?.summary ?? {};

  function duration(run: AutomationRun): string {
    if (!run.completedAt) return run.status === "running" ? "running…" : "—";
    const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Automation</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Scheduled job history and manual triggers</p>
      </div>

      {/* Job summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {JOBS.map((job) => {
          const s = summary[job];
          return (
            <div key={job} className="bg-card border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-2 font-medium">{job}</div>
              {s ? (
                <>
                  <div className="text-xs text-muted-foreground">{s.count} runs</div>
                  <div className="text-xs text-muted-foreground">{(s.successRate * 100).toFixed(0)}% success</div>
                  <div className="text-xs text-muted-foreground mt-1">{timeAgo(s.last)}</div>
                </>
              ) : (
                <div className="text-xs text-zinc-600">Never run</div>
              )}
              <button
                onClick={() => trigger.mutate(job)}
                disabled={trigger.isPending}
                className="mt-2 flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-40"
              >
                <Play className="w-3 h-3" /> Trigger
              </button>
            </div>
          );
        })}
      </div>

      {trigger.isSuccess && (
        <div className="bg-green-950/40 border border-green-800/40 rounded p-2 text-xs text-green-400">
          Job triggered — check the run log below in a few seconds.
        </div>
      )}
      {trigger.error && (
        <div className="bg-red-950/40 border border-red-800/40 rounded p-2 text-xs text-red-400">
          {(trigger.error as Error).message}
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-wrap gap-1.5">
        {["all", ...JOBS].map((j) => (
          <button
            key={j}
            onClick={() => setJobFilter(j)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              jobFilter === j
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {j === "all" ? "All Jobs" : j}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Job</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Records</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Duration</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Started</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No automation runs yet.
                  </td>
                </tr>
              ) : runs.map((r) => (
                <tr key={r.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusDot(r.status)}`} />
                      <span className={`capitalize text-xs ${statusColor(r.status)}`}>{r.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground font-medium text-xs">{r.jobName}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{r.recordsProcessed}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">{duration(r)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(r.startedAt)}</td>
                  <td className="px-4 py-3 text-xs text-red-400 max-w-xs truncate">
                    {r.errorDetails ?? "—"}
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
