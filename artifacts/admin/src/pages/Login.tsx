import React, { useState } from "react";
import { Activity } from "lucide-react";
import { createSession, setSession } from "@/lib/api";

export function Login() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setError("");

    try {
      const result = await createSession(key.trim());
      if (result) {
        setSession(result.token, result.expiresAt);
        window.location.reload();
      } else {
        setError("Invalid key.");
      }
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">TBM Admin</div>
            <div className="text-xs text-muted-foreground">Restricted Access</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Master API Key
            </label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter your MASTER_API_KEY"
              autoComplete="current-password"
              className="w-full px-3 py-2.5 bg-card border border-border rounded text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying…" : "Access Dashboard"}
          </button>
        </form>

        <p className="mt-6 text-xs text-muted-foreground text-center">
          Session expires after 8 hours of inactivity.
        </p>
      </div>
    </div>
  );
}
