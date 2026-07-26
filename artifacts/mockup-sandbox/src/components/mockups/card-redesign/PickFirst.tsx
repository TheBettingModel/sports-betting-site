/**
 * Variant A — Pick-First (updated)
 *
 * THE PICK is the hero. Improvements:
 *  - CLV row: opening → current odds + market direction signal
 *  - Home/away clarity on team labels
 *  - Starter names (MLB-specific context row)
 *  - Stars merged into the metrics line (cleaner bottom strip)
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
  // Pick
  pickTeamAbbr: string;
  pickIsHome: boolean;
  betType: string;
  currentOdds: string;
  openingOdds: string;
  clvShift: number;   // positive = market moved your way (good), negative = moved against
  units: number;
  rating: "STRONG BUY" | "BUY" | "NEUTRAL" | "FADE";
  // Model
  score: number;
  edge: number;
  stars: number;
  // Sport-specific context
  homeStarter?: string;
  awayStarter?: string;
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
    pickIsHome: true,
    betType: "Moneyline",
    currentOdds: "-112",
    openingOdds: "-122",
    clvShift: 2.4,   // line moved from -122 → -112, market de-juiced TEX, good
    units: 1.0,
    rating: "BUY",
    score: 73,
    edge: 9.2,
    stars: 4,
    homeStarter: "N. Eovaldi",
    awayStarter: "G. Kirby",
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
    pickIsHome: true,
    betType: "Moneyline",
    currentOdds: "+145",
    openingOdds: "+130",
    clvShift: 3.1,   // underdog got longer, market has moved away from NYM — actually bad
    units: 0.5,
    rating: "STRONG BUY",
    score: 71,
    edge: 10.1,
    stars: 5,
    homeStarter: "S. Manaea",
    awayStarter: "Y. Yamamoto",
  },
];

const RATING_COLORS: Record<string, { bg: string; text: string }> = {
  "STRONG BUY": { bg: "#84CC16", text: "#000000" },
  BUY:          { bg: "#22C55E", text: "#ffffff" },
  NEUTRAL:      { bg: "#1A1A1A", text: "#6B7280" },
  FADE:         { bg: "#EF4444", text: "#ffffff" },
};

function OddsShiftArrow({ shift }: { shift: number }) {
  // positive shift on a favourite (odds got shorter = market buying) = good
  // For display we just show the raw direction from opening→current
  const up = shift > 0;
  return (
    <span style={{ color: up ? "#84CC16" : "#EF4444", fontSize: 11, fontWeight: 800 }}>
      {up ? "▲" : "▼"} {Math.abs(shift).toFixed(1)}%
    </span>
  );
}

function Card({ d }: { d: CardData }) {
  const rating = RATING_COLORS[d.rating];
  const starsStr = "★".repeat(d.stars);

  return (
    <div
      style={{
        background: "#111111",
        borderRadius: 14,
        borderTop: "1px solid #222",
        borderRight: "1px solid #222",
        borderBottom: "1px solid #222",
        borderLeft: `4px solid ${d.sportColor}`,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      {/* ── PICK BAND — hero ── */}
      <div
        style={{
          padding: "11px 14px 10px",
          borderBottom: "1px solid #1a1a1a",
        }}
      >
        {/* Row 1: label + badge + units */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#84CC16", letterSpacing: "0.14em" }}>
            THE PICK
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                background: rating.bg,
                color: rating.text,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.07em",
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              {d.rating}
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: "#84CC16",
                background: "#0d1f00",
                border: "1px solid #2a3d00",
                padding: "2px 9px",
                borderRadius: 5,
              }}
            >
              {d.units.toFixed(1)}u
            </div>
          </div>
        </div>

        {/* Row 2: team + bet type + current odds */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 900, color: "#fff", letterSpacing: -0.5, lineHeight: 1 }}>
            {d.pickTeamAbbr}
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#6B7280",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              padding: "1px 5px",
              borderRadius: 3,
              letterSpacing: "0.06em",
            }}
          >
            {d.pickIsHome ? "HOME" : "AWAY"}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#9CA3AF" }}>
            {d.betType}
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: "#e5e7eb",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              padding: "1px 7px",
              borderRadius: 4,
            }}
          >
            {d.currentOdds}
          </span>
        </div>

        {/* Row 3: CLV / line movement */}
        <div
          style={{
            marginTop: 7,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 8px",
            background: "#0a0a0a",
            borderRadius: 6,
            border: "1px solid #1d1d1d",
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 700, color: "#6B7280", letterSpacing: "0.1em" }}>
            CLV
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>
            Open {d.openingOdds}
          </span>
          <span style={{ fontSize: 10, color: "#444" }}>→</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#e5e7eb" }}>
            {d.currentOdds}
          </span>
          <div style={{ marginLeft: "auto" }}>
            <OddsShiftArrow shift={d.clvShift} />
          </div>
        </div>
      </div>

      {/* ── MATCHUP CONTEXT ── */}
      <div style={{ padding: "9px 14px" }}>
        {/* Teams + records */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          {/* Home */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: d.pickIsHome ? "#fff" : "#6B7280",
                  letterSpacing: -0.2,
                }}
              >
                {d.homeAbbr}
              </span>
              <span style={{ fontSize: 8, color: "#555", fontWeight: 600, letterSpacing: "0.05em" }}>HOME</span>
            </div>
            <div style={{ fontSize: 9, color: "#555", marginTop: 1 }}>{d.homeRecord}</div>
          </div>

          <div style={{ flex: 1, textAlign: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#333" }}>vs</span>
          </div>

          {/* Away */}
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
              <span style={{ fontSize: 8, color: "#555", fontWeight: 600, letterSpacing: "0.05em" }}>AWAY</span>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: !d.pickIsHome ? "#fff" : "#6B7280",
                  letterSpacing: -0.2,
                }}
              >
                {d.awayAbbr}
              </span>
            </div>
            <div style={{ fontSize: 9, color: "#555", marginTop: 1 }}>{d.awayRecord}</div>
          </div>

          {/* Meta */}
          <div style={{ marginLeft: 16, textAlign: "right", minWidth: 72 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#555", letterSpacing: 0.3 }}>{d.sport}</div>
            <div style={{ fontSize: 9, color: "#555", marginTop: 1 }}>{d.gameTime}</div>
          </div>
        </div>

        {/* Starters (MLB-only context) */}
        {d.homeStarter && d.awayStarter && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 8px",
              background: "#0a0a0a",
              borderRadius: 5,
              border: "1px solid #1a1a1a",
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 10, color: "#6B7280" }}>SP</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: d.pickIsHome ? "#d1d5db" : "#6B7280" }}>
              {d.homeStarter}
            </span>
            <span style={{ fontSize: 9, color: "#333" }}>vs</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: !d.pickIsHome ? "#d1d5db" : "#6B7280" }}>
              {d.awayStarter}
            </span>
          </div>
        )}

        {/* Metrics strip: score + edge + stars */}
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: -0.5, lineHeight: 1 }}>
              {d.score}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#84CC16" }}>/100</span>
          </div>

          <div style={{ width: 1, height: 22, background: "#222", margin: "0 12px" }} />

          <div>
            <div style={{ fontSize: 8, color: "#6B7280", fontWeight: 700, letterSpacing: "0.08em" }}>EDGE</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#84CC16" }}>+{d.edge}%</div>
          </div>

          {d.stars >= 4 && (
            <>
              <div style={{ width: 1, height: 22, background: "#222", margin: "0 12px" }} />
              <div>
                <div style={{ fontSize: 8, color: "#6B7280", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 2 }}>CONF</div>
                <div style={{ fontSize: 11, color: "#84CC16", letterSpacing: 1 }}>{starsStr}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function PickFirst() {
  return (
    <div
      style={{
        background: "#000",
        minHeight: "100vh",
        padding: "16px 16px 32px",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ width: 3, height: 18, background: "#84CC16", borderRadius: 2 }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: "#84CC16", letterSpacing: "0.12em" }}>
          STRONG BUY
        </span>
        <div
          style={{
            width: 20, height: 20, borderRadius: "50%",
            background: "#1a2600", border: "1px solid #84CC16",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 800, color: "#84CC16" }}>2</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", letterSpacing: "0.1em" }}>
          MODEL EDGE VS VEGAS
        </span>
      </div>

      {CARDS.map((d) => (
        <Card key={d.homeAbbr + d.awayAbbr} d={d} />
      ))}
    </div>
  );
}
