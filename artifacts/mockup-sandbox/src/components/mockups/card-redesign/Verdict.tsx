/**
 * Variant B — Verdict
 *
 * Keeps the familiar matchup-first layout users already know, but adds
 * a full-width "VERDICT" strip that names the pick explicitly before the
 * score/metrics row. The pick team is also highlighted in the abbr row
 * with a subtle underline treatment so it's scannable at a glance.
 *
 * Design hypothesis: don't break muscle-memory — upgrade clarity.
 * Users have learned the card shape; give them a cleaner pick signal
 * within the same structure.
 */

import "./_group.css";

interface CardData {
  sport: string;
  sportColor: string;
  homeAbbr: string;
  awayAbbr: string;
  homeRecord: string;
  awayRecord: string;
  gameTime: string;
  pickTeamAbbr: string;
  betType: string;
  odds: string;
  units: number;
  rating: "STRONG BUY" | "BUY" | "NEUTRAL" | "FADE";
  score: number;
  edge: number;
  stars: number;
}

const CARDS: CardData[] = [
  {
    sport: "MLB",
    sportColor: "#0EA5E9",
    homeAbbr: "TEX",
    awayAbbr: "SEA",
    homeRecord: "53-51",
    awayRecord: "51-54",
    gameTime: "2:35 PM ET",
    pickTeamAbbr: "TEX",
    betType: "ML",
    odds: "-112",
    units: 1.0,
    rating: "BUY",
    score: 73,
    edge: 9.2,
    stars: 4,
  },
  {
    sport: "MLB",
    sportColor: "#0EA5E9",
    homeAbbr: "NYM",
    awayAbbr: "LAD",
    homeRecord: "43-62",
    awayRecord: "67-38",
    gameTime: "1:40 PM ET",
    pickTeamAbbr: "NYM",
    betType: "ML",
    odds: "+145",
    units: 0.5,
    rating: "STRONG BUY",
    score: 71,
    edge: 10.1,
    stars: 5,
  },
];

const RATING_COLORS: Record<string, { bg: string; text: string }> = {
  "STRONG BUY": { bg: "#84CC16", text: "#000000" },
  BUY:          { bg: "#22C55E", text: "#ffffff" },
  NEUTRAL:      { bg: "#1A1A1A", text: "#6B7280" },
  FADE:         { bg: "#EF4444", text: "#ffffff" },
};

function Card({ d }: { d: CardData }) {
  const rating = RATING_COLORS[d.rating];
  const pickIsHome = d.pickTeamAbbr === d.homeAbbr;

  return (
    <div
      style={{
        background: "#111111",
        borderRadius: 14,
        borderLeft: `4px solid ${d.sportColor}`,
        border: `1px solid #222`,
        borderLeftWidth: 4,
        borderLeftColor: d.sportColor,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      {/* ── TOP ROW: logos + meta ── */}
      <div style={{ padding: "12px 14px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Logos + records */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Home team */}
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: "#1a1a1a",
                border: `1px solid ${pickIsHome ? "#84CC16" : "#2a2a2a"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 800,
                color: pickIsHome ? "#84CC16" : "#6B7280",
              }}
            >
              {d.homeAbbr[0]}
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#444", letterSpacing: 1 }}>VS</div>
            <div style={{ fontSize: 9, color: "#555", marginTop: 2 }}>
              {d.homeRecord} · {d.awayRecord}
            </div>
          </div>

          {/* Away team */}
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: "#1a1a1a",
                border: `1px solid ${!pickIsHome ? "#84CC16" : "#2a2a2a"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 800,
                color: !pickIsHome ? "#84CC16" : "#6B7280",
              }}
            >
              {d.awayAbbr[0]}
            </div>
          </div>
        </div>

        {/* Sport + time */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", letterSpacing: 0.3 }}>{d.sport}</div>
          <div style={{ fontSize: 10, color: "#6B7280", marginTop: 1 }}>{d.gameTime}</div>
        </div>
      </div>

      {/* ── ABBR ROW ── */}
      <div style={{ padding: "6px 14px 0", display: "flex", alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: pickIsHome ? "#fff" : "#6B7280" }}>
            {d.homeAbbr}
          </span>
          {pickIsHome && (
            <div style={{ position: "absolute", bottom: -2, left: 0, right: 0, height: 2, background: "#84CC16", borderRadius: 1 }} />
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: !pickIsHome ? "#fff" : "#6B7280" }}>
            {d.awayAbbr}
          </span>
          {!pickIsHome && (
            <div style={{ position: "absolute", bottom: -2, left: 0, right: 0, height: 2, background: "#84CC16", borderRadius: 1 }} />
          )}
        </div>
      </div>

      {/* ── VERDICT STRIP ── */}
      <div
        style={{
          margin: "10px 14px 0",
          background: "#0d1f00",
          border: "1px solid #2a3d00",
          borderRadius: 8,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#84CC16", letterSpacing: "0.12em" }}>PICK</span>
          <span style={{ fontSize: 15, fontWeight: 900, color: "#84CC16", letterSpacing: -0.3 }}>
            {d.pickTeamAbbr}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", opacity: 0.8 }}>
            {d.betType}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#9CA3AF",
              background: "#111",
              borderRadius: 4,
              padding: "1px 5px",
              border: "1px solid #2a2a2a",
            }}
          >
            {d.odds}
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: "#84CC16",
          }}
        >
          {d.units.toFixed(1)}u
        </div>
      </div>

      {/* ── BOTTOM ROW: score + badge ── */}
      <div
        style={{
          padding: "10px 14px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* Score */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <span style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: -0.5 }}>{d.score}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#84CC16" }}>/100</span>
        </div>

        {/* Badge */}
        <div
          style={{
            background: rating.bg,
            color: rating.text,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.08em",
            padding: "3px 9px",
            borderRadius: 5,
          }}
        >
          {d.rating}
        </div>

        {/* Edge */}
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#84CC16" }}>+{d.edge}%</div>
          {d.stars >= 4 && (
            <div style={{ fontSize: 9, color: "#84CC16", letterSpacing: 1, marginTop: 2 }}>
              {"★".repeat(d.stars)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Verdict() {
  return (
    <div style={{ background: "#000", minHeight: "100vh", padding: "16px 16px 32px", fontFamily: "Inter, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 3, height: 18, background: "#84CC16", borderRadius: 2 }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: "#84CC16", letterSpacing: "0.12em" }}>
          STRONG BUY
        </span>
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#1a2600", border: "1px solid #84CC16", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#84CC16" }}>2</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", letterSpacing: "0.1em" }}>
          MODEL EDGE VS VEGAS
        </span>
      </div>

      {CARDS.map((d) => (
        <Card key={d.homeAbbr} d={d} />
      ))}
    </div>
  );
}
