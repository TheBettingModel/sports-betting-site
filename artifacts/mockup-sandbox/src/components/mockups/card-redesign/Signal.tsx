/**
 * Variant C — Signal
 *
 * Three horizontal bands separated by hairline dividers:
 *   1. Matchup band — teams, records, sport, time
 *   2. Signal band — THE PICK, full width, green-tinted
 *   3. Metrics band — score, edge, confidence stars
 *
 * Design hypothesis: structured scanning. Sports bettors read fast.
 * A card with clear bands lets eyes jump to the zone they care about
 * instead of hunting across a mixed-content layout.
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
  const pickIsHome = d.pickTeamAbbr === d.homeAbbr;

  return (
    <div
      style={{
        background: "#111111",
        borderRadius: 14,
        borderLeft: `4px solid ${d.sportColor}`,
        border: "1px solid #222",
        borderLeftWidth: 4,
        borderLeftColor: d.sportColor,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      {/* ── BAND 1: MATCHUP ── */}
      <div style={{ padding: "11px 14px 11px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Home team */}
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: pickIsHome ? "#fff" : "#6B7280", letterSpacing: -0.3 }}>
            {d.homeAbbr}
          </div>
          <div style={{ fontSize: 9, color: "#555", marginTop: 1 }}>{d.homeRecord}</div>
        </div>

        {/* Center */}
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#333", letterSpacing: 1 }}>VS</div>
        </div>

        {/* Away team */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: !pickIsHome ? "#fff" : "#6B7280", letterSpacing: -0.3 }}>
            {d.awayAbbr}
          </div>
          <div style={{ fontSize: 9, color: "#555", marginTop: 1 }}>{d.awayRecord}</div>
        </div>

        {/* Meta (right edge) */}
        <div style={{ marginLeft: 16, textAlign: "right", minWidth: 64 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#6B7280", letterSpacing: 0.3 }}>{d.sport}</div>
          <div style={{ fontSize: 9, color: "#555", marginTop: 2 }}>{d.gameTime}</div>
        </div>
      </div>

      {/* ── BAND 2: SIGNAL (THE PICK) ── */}
      <div
        style={{
          background: "linear-gradient(90deg, #0d1f00 0%, #0a1800 100%)",
          borderTop: "1px solid #1d3300",
          borderBottom: "1px solid #1d3300",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Pick identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Label */}
          <div
            style={{
              background: "#84CC16",
              color: "#000",
              fontSize: 8,
              fontWeight: 900,
              letterSpacing: "0.15em",
              padding: "2px 6px",
              borderRadius: 3,
            }}
          >
            PICK
          </div>

          {/* Team + bet */}
          <span style={{ fontSize: 19, fontWeight: 900, color: "#84CC16", letterSpacing: -0.5 }}>
            {d.pickTeamAbbr}
          </span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#84CC16", opacity: 0.9 }}>{d.betType}</div>
            <div style={{ fontSize: 10, color: "#6B7280", marginTop: 1 }}>
              {d.odds}
            </div>
          </div>
        </div>

        {/* Right: units + badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              background: rating.bg,
              color: rating.text,
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.08em",
              padding: "3px 8px",
              borderRadius: 4,
            }}
          >
            {d.rating}
          </div>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#84CC16" }}>
            {d.units.toFixed(1)}u
          </div>
        </div>
      </div>

      {/* ── BAND 3: METRICS ── */}
      <div
        style={{
          padding: "9px 14px 10px",
          display: "flex",
          alignItems: "center",
          gap: 0,
        }}
      >
        {/* Score */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginRight: 16 }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: -0.5 }}>{d.score}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#84CC16" }}>/100</span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: "#222", marginRight: 16 }} />

        {/* Edge */}
        <div>
          <div style={{ fontSize: 9, color: "#6B7280", fontWeight: 600, letterSpacing: "0.08em" }}>EDGE</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#84CC16" }}>+{d.edge}%</div>
        </div>

        {/* Stars */}
        {d.stars >= 4 && (
          <>
            <div style={{ width: 1, height: 28, background: "#222", marginLeft: 16, marginRight: 16 }} />
            <div>
              <div style={{ fontSize: 9, color: "#6B7280", fontWeight: 600, letterSpacing: "0.08em" }}>CONF</div>
              <div style={{ fontSize: 11, color: "#84CC16", letterSpacing: 1 }}>{"★".repeat(d.stars)}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Signal() {
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
