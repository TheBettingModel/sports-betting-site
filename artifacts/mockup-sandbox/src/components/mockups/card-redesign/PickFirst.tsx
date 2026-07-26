/**
 * Variant A — Pick-First
 *
 * The pick is the hero. First thing your eye lands on is WHO to bet and HOW MUCH.
 * Matchup context (logos, records, time) sits below as supporting info.
 * Score/edge/confidence are in a compact metrics strip at the bottom.
 *
 * Design hypothesis: bettors scan for the action, not the analysis.
 * Lead with the decision; let the data justify it beneath.
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
  pick: string;
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
    pick: "Texas Rangers",
    pickTeamAbbr: "TEX",
    betType: "Moneyline",
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
    pick: "New York Mets",
    pickTeamAbbr: "NYM",
    betType: "Moneyline",
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
  const stars = "★".repeat(d.stars) + "☆".repeat(5 - d.stars);

  return (
    <div
      style={{
        background: "#111111",
        borderRadius: 14,
        borderLeft: `4px solid ${d.sportColor}`,
        borderTop: "1px solid #222",
        borderRight: "1px solid #222",
        borderBottom: "1px solid #222",
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      {/* ── PICK BAND — the hero ── */}
      <div
        style={{
          padding: "10px 14px 9px",
          borderBottom: "1px solid #1d1d1d",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Left: THE PICK label + team */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#84CC16", letterSpacing: "0.12em", marginBottom: 3 }}>
            THE PICK
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: -0.5 }}>
              {d.pickTeamAbbr}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#84CC16" }}>
              {d.betType}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#9CA3AF",
                background: "#1A1A1A",
                borderRadius: 4,
                padding: "1px 6px",
                border: "1px solid #2a2a2a",
              }}
            >
              {d.odds}
            </span>
          </div>
        </div>

        {/* Right: units pill + badge */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
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
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: "#84CC16",
              background: "#1a2600",
              padding: "2px 8px",
              borderRadius: 5,
            }}
          >
            {d.units.toFixed(1)}u
          </div>
        </div>
      </div>

      {/* ── MATCHUP CONTEXT ── */}
      <div
        style={{
          padding: "9px 14px 11px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Teams + records */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: d.pickTeamAbbr === d.homeAbbr ? "#fff" : "#6B7280" }}>
              {d.homeAbbr}
            </div>
            <div style={{ fontSize: 9, color: "#6B7280", marginTop: 1 }}>{d.homeRecord}</div>
          </div>
          <div style={{ fontSize: 10, color: "#444", fontWeight: 700 }}>vs</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: d.pickTeamAbbr === d.awayAbbr ? "#fff" : "#6B7280" }}>
              {d.awayAbbr}
            </div>
            <div style={{ fontSize: 9, color: "#6B7280", marginTop: 1 }}>{d.awayRecord}</div>
          </div>
        </div>

        {/* Right: metrics */}
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3, justifyContent: "flex-end" }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: -0.5 }}>{d.score}</span>
            <span style={{ fontSize: 11, color: "#84CC16", fontWeight: 700 }}>/100</span>
          </div>
          <div style={{ fontSize: 10, color: "#6B7280", marginTop: 1 }}>
            {d.sport} · {d.gameTime}
          </div>
          <div style={{ fontSize: 10, color: "#84CC16", fontWeight: 700, marginTop: 2 }}>
            +{d.edge}% edge
          </div>
        </div>
      </div>

      {/* Stars */}
      {d.stars >= 4 && (
        <div style={{ padding: "0 14px 8px" }}>
          <span style={{ fontSize: 11, color: "#84CC16", letterSpacing: 1 }}>{stars}</span>
        </div>
      )}
    </div>
  );
}

export function PickFirst() {
  return (
    <div style={{ background: "#000", minHeight: "100vh", padding: "16px 16px 32px", fontFamily: "Inter, sans-serif" }}>
      {/* Section header */}
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
