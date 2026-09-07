import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Shadcn-compatible class merging helper. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

export function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function units(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}u`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    production: "text-green-400",
    challenger: "text-yellow-400",
    approved: "text-blue-400",
    development: "text-slate-400",
    retired: "text-zinc-500",
    rejected: "text-red-400",
    completed: "text-green-400",
    running: "text-yellow-400",
    failed: "text-red-400",
    skipped: "text-zinc-500",
    warning: "text-yellow-400",
    critical: "text-red-400",
    healthy: "text-green-400",
    degraded: "text-red-400",
    unknown: "text-zinc-500",
  };
  return map[status] ?? "text-zinc-400";
}

export function statusDot(status: string): string {
  const map: Record<string, string> = {
    production: "bg-green-400",
    challenger: "bg-yellow-400",
    approved: "bg-blue-400",
    development: "bg-slate-400",
    retired: "bg-zinc-600",
    rejected: "bg-red-600",
    completed: "bg-green-400",
    running: "bg-yellow-400",
    failed: "bg-red-500",
    healthy: "bg-green-400",
    degraded: "bg-red-500",
    warning: "bg-yellow-400",
    critical: "bg-red-500",
  };
  return map[status] ?? "bg-zinc-600";
}
