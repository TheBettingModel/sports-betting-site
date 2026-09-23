import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  Zap,
  Target,
  DollarSign,
  Flame,
} from "lucide-react";

// ── Design tokens matching the real app ──────────────────────────────────────
const C = {
  bg: "#000000",
  surface: "#111111",
  surfaceHigh: "#1A1A1A",
  border: "#222222",
  accent: "#84CC16",
  accentDim: "#2D4A0A",
  fg: "#FFFFFF",
  muted: "#6B7280",
  win: "#84CC16",
  loss: "#EF4444",
  push: "#F59E0B",
  sportNFL: "#4F46E5",
  sportNBA: "#EA580C",
  sportMLB: "#2563EB",
  sportWNBA: "#EC4899",
  sportSoccer: "#10B981",
};

// ── Fake data ─────────────────────────────────────────────────────────────────
const SPORT_STATS = [
  { sport: "MLB", color: C.sportMLB, wins: 72, total: 138, units: 18.4, streak: 4, streakDir: "W" },
  { sport: "Soccer", color: C.sportSoccer, wins: 19, total: 24, units: 11.2, streak: 2, streakDir: "W" },
  { sport: "WNBA", color: C.sportWNBA, wins: 6, total: 16, units: -3.1, streak: 2, streakDir: "L" },
];

const RECENT_RESULTS = [
  {
    id: 1,
    sport: "MLB",
    color: C.sportMLB,
    away: "PHI",
    home: "MIA",
    awayScore: 6,
    homeScore: 8,
    pick: "MIA ML",
    result: "W",
    units: 1.0,
    date: "Yesterday",
  },
  {
    id: 2,
    sport: "MLB",
    color: C.sportMLB,
    away: "ARI",
    home: "PIT",
    awayScore: 3,
    homeScore: 0,
    pick: "ARI ML",
    result: "W",
    units: 0.9,
    date: "Yesterday",
  },
  {
    id: 3,
    sport: "MLB",
    color: C.sportMLB,
    away: "TOR",
    home: "WSH",
    awayScore: 5,
    homeScore: 2,
    pick: "WSH ML",
    result: "L",
    units: -1.0,
    date: "Yesterday",
  },
  {
    id: 4,
    sport: "MLB",
    color: C.sportMLB,
    away: "BAL",
    home: "DET",
    awayScore: 10,
    homeScore: 9,
    pick: "BAL ML",
    result: "W",
    units: 1.1,
    date: "Yesterday",
  },
  {
    id: 5,
    sport: "WNBA",
    color: C.sportWNBA,
    away: "CHI",
    home: "NYL",
    awayScore: 74,
    homeScore: 82,
    pick: "NYL -4.5",
    result: "W",
    units: 1.0,
    date: "Jul 28",
  },
  {
    id: 6,
    sport: "Soccer",
    color: C.sportSoccer,
    away: "ARS",
    home: "MCI",
    awayScore: 1,
    homeScore: 2,
    pick: "MCI ML",
    result: "W",
    units: 1.3,
    date: "Jul 28",
  },
  {
    id: 7,
    sport: "MLB",
    color: C.sportMLB,
    away: "NYY",
    home: "CHW",
    awayScore: 7,
    homeScore: 2,
    pick: "NYY -1.5",
    result: "W",
    units: 1.0,
    date: "Jul 28",
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function WinRateBar({ wins, total, color }: { wins: number; total: number; color: string }) {
  const pct = total > 0 ? (wins / total) * 100 : 0;
  return (
    <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 2,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

function SportCard({ sport, color, wins, total, units, streak, streakDir }: (typeof SPORT_STATS)[0]) {
  const pct = total > 0 ? Math.round((wins / total) * 100) : 0;
  const unitsPositive = units >= 0;

  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "12px 14px",
        flex: "1 1 0",
        minWidth: 0,
      }}
    >
      {/* Sport label */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
          <span style={{ color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>{sport}</span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: streakDir === "W" ? C.win : C.loss,
            background: streakDir === "W" ? C.accentDim : "#3A0A0A",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          {streakDir}{streak}
        </span>
      </div>

      {/* Win % */}
      <div style={{ fontSize: 24, fontWeight: 700, color: C.fg, lineHeight: 1 }}>{pct}%</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
        {wins}–{total - wins}
      </div>

      <WinRateBar wins={wins} total={total} color={color} />

      {/* Units */}
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          fontWeight: 600,
          color: unitsPositive ? C.win : C.loss,
        }}
      >
        {unitsPositive ? "+" : ""}{units}u
      </div>
    </div>
  );
}

function ResultRow({ away, home, awayScore, homeScore, pick, result, units, date, color, sport }: (typeof RECENT_RESULTS)[0]) {
  const isWin = result === "W";
  const unitsLabel = isWin ? `+${units}u` : `-${Math.abs(units)}u`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "11px 16px",
        borderBottom: `1px solid ${C.border}`,
        gap: 12,
      }}
    >
      {/* Sport dot */}
      <div style={{ width: 3, height: 36, borderRadius: 2, background: color, flexShrink: 0 }} />

      {/* Score block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.fg }}>
            {away} {awayScore}
          </span>
          <span style={{ fontSize: 11, color: C.muted }}>@</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.fg }}>
            {home} {homeScore}
          </span>
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 2 }}>{date}</span>
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>
          Pick: <span style={{ color: C.fg, fontWeight: 500 }}>{pick}</span>
        </div>
      </div>

      {/* Result badge */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 8,
            background: isWin ? C.accentDim : "#3A0A0A",
            marginBottom: 3,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: isWin ? C.win : C.loss }}>{result}</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: isWin ? C.win : C.loss }}>{unitsLabel}</div>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function ResultsStats() {
  const [period, setPeriod] = useState<"week" | "season">("season");

  const totalWins = SPORT_STATS.reduce((s, x) => s + x.wins, 0);
  const totalGames = SPORT_STATS.reduce((s, x) => s + x.total, 0);
  const totalUnits = SPORT_STATS.reduce((s, x) => s + x.units, 0);
  const overallPct = Math.round((totalWins / totalGames) * 100);

  return (
    <div
      style={{
        width: 390,
        height: 844,
        background: C.bg,
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Status bar */}
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: C.fg }}>9:41</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ width: 16, height: 8, border: `1.5px solid ${C.fg}`, borderRadius: 2, position: "relative" }}>
            <div style={{ position: "absolute", left: 1, top: 1, bottom: 1, right: 3, background: C.fg, borderRadius: 1 }} />
          </div>
        </div>
      </div>

      {/* Header */}
      <div style={{ padding: "4px 16px 12px", flexShrink: 0 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.fg, margin: 0, letterSpacing: "-0.5px" }}>Results</h1>
        <p style={{ fontSize: 13, color: C.muted, margin: "2px 0 0" }}>Model performance & completed games</p>
      </div>

      {/* Period toggle */}
      <div style={{ padding: "0 16px 14px", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 3,
            gap: 3,
          }}
        >
          {(["week", "season"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                flex: 1,
                padding: "7px 0",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                background: period === p ? C.accent : "transparent",
                color: period === p ? "#000" : C.muted,
                transition: "all 0.15s",
              }}
            >
              {p === "week" ? "This Week" : "All Season"}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 90 }}>
        {/* Overall summary strip */}
        <div
          style={{
            margin: "0 16px 14px",
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: "14px 16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            {/* Record */}
            <div>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 4 }}>
                OVERALL RECORD
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: C.fg, letterSpacing: "-1px" }}>
                  {totalWins}–{totalGames - totalWins}
                </span>
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 4,
                  background: C.accentDim,
                  borderRadius: 6,
                  padding: "3px 8px",
                }}
              >
                <Target size={11} color={C.accent} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{overallPct}% WIN RATE</span>
              </div>
            </div>

            {/* Units */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 4 }}>
                UNITS
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                <TrendingUp size={18} color={C.win} />
                <span style={{ fontSize: 28, fontWeight: 800, color: C.win }}>
                  +{totalUnits.toFixed(1)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{totalGames} picks graded</div>
            </div>
          </div>

          {/* Mini sparkline bar */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: C.muted }}>Win rate trend</span>
              <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>↑ +3% last 30 days</span>
            </div>
            <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 28 }}>
              {[48, 51, 47, 53, 50, 55, 52, 58, 54, 57, 56, 60].map((v, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${((v - 44) / 20) * 100}%`,
                    background: i >= 10 ? C.accent : C.border,
                    borderRadius: 2,
                    minHeight: 4,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Sport breakdown */}
        <div style={{ padding: "0 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 10 }}>
            BY SPORT
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {SPORT_STATS.map((s) => (
              <SportCard key={s.sport} {...s} />
            ))}
          </div>
        </div>

        {/* Recent results */}
        <div>
          <div style={{ padding: "0 16px", marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: "0.06em" }}>
              RECENT RESULTS
            </div>
          </div>
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              margin: "0 16px",
              overflow: "hidden",
            }}
          >
            {RECENT_RESULTS.map((r, i) => (
              <ResultRow key={r.id} {...r} />
            ))}
          </div>
        </div>
      </div>

      {/* Tab bar (to show context) */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 83,
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(20px)",
          borderTop: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "flex-start",
          paddingTop: 10,
        }}
      >
        {[
          { label: "Today", active: false },
          { label: "Picks", active: false },
          { label: "Results", active: true },
          { label: "Account", active: false },
        ].map(({ label, active }) => (
          <div
            key={label}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: active ? C.accentDim : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {label === "Today" && <Zap size={16} color={active ? C.accent : C.muted} />}
              {label === "Picks" && <Target size={16} color={active ? C.accent : C.muted} />}
              {label === "Results" && <TrendingUp size={16} color={active ? C.accent : C.muted} />}
              {label === "Account" && (
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: active ? C.accent : C.muted,
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                color: active ? C.accent : C.muted,
                letterSpacing: "0.01em",
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
