/**
 * Variant A — Pick-First (v3)
 *
 * Changes from v2:
 *  - Real ESPN CDN logos in the matchup section
 *  - Better text contrast throughout (CLV labels, HOME/AWAY, opening odds, "vs")
 *  - HOME/AWAY badge on pick team is crisper
 *  - Matchup row rebuilt around logos
 */

import "./_group.css";

interface CardData {
  sport: string;
  sportKey: string;        // ESPN CDN key: "mlb", "nba", etc.
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
  clvShift: number;        // positive = market moved your way
  units: number;
  rating: "STRONG BUY" | "BUY" | "NEUTRAL" | "FADE";
  // Model
  score: number;
  edge: number;
  stars: number;
  // MLB-specific
  homeStarter?: string;
  awayStarter?: string;
}

const CARDS: CardData[] = [
  {
    sport: "MLB",
    sportKey: "mlb",
    sportColor: "#0EA5E9",
    homeAbbr: "tex",
    awayAbbr: "sea",
    homeRecord: "53-51",
    awayRecord: "51-54",
    gameTime: "2:35 PM ET",
    pickTeamAbbr: "TEX",
    pickIsHome: true,
    betType: "Moneyline",
    currentOdds: "-112",
    openingOdds: "-122",
    clvShift: 2.4,
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
    sportKey: "mlb",
    sportColor: "#0EA5E9",
    homeAbbr: "nym",
    awayAbbr: "lad",
    homeRecord: "43-62",
    awayRecord: "67-38",
    gameTime: "1:40 PM ET",
    pickTeamAbbr: "NYM",
    pickIsHome: true,
    betType: "Moneyline",
    currentOdds: "+145",
    openingOdds: "+130",
    clvShift: -1.8,        // line drifted away from NYM — bad for the bet
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
  NEUTRAL:      { bg: "#1A1A1A", text: "#9CA3AF" },
  FADE:         { bg: "#EF4444", text: "#ffffff" },
};

function Logo({ sportKey, abbr, size = 40 }: { sportKey: string; abbr: string; size?: number }) {
  const src = `https://a.espncdn.com/i/teamlogos/${sportKey}/500/${abbr.toLowerCase()}.png`;
  return (
    <img
      src={src}
      width={size}
      height={size}
      style={{ objectFit: "contain", display: "block" }}
      onError={(e) => {
        // fallback: hide broken image, show nothing (abbr shown separately)
        (e.target as HTMLImageElement).style.opacity = "0.2";
      }}
    />
  );
}

function Card({ d }: { d: CardData }) {
  const rating = RATING_COLORS[d.rating];
  const starsStr = "★".repeat(d.stars);
  const clvUp = d.clvShift > 0;
  const pickAbbrUpper = d.pickTeamAbbr.toUpperCase();

  return (
    <div
      style={{
        background: "#111111",
        borderRadius: 14,
        borderTop: "1px solid #1e1e1e",
        borderRight: "1px solid #1e1e1e",
        borderBottom: "1px solid #1e1e1e",
        borderLeft: `4px solid ${d.sportColor}`,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      {/* ━━━━ PICK BAND ━━━━ */}
      <div style={{ padding: "11px 14px 11px", borderBottom: "1px solid #1a1a1a" }}>

        {/* Row 1: label + badge + units */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#84CC16", letterSpacing: "0.15em" }}>
            THE PICK
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              background: rating.bg, color: rating.text,
              fontSize: 10, fontWeight: 800, letterSpacing: "0.07em",
              padding: "3px 9px", borderRadius: 4,
            }}>
              {d.rating}
            </div>
            <div style={{
              fontSize: 14, fontWeight: 900, color: "#84CC16",
              background: "#0d1f00", border: "1px solid #2a3d00",
              padding: "2px 9px", borderRadius: 5,
            }}>
              {d.units.toFixed(1)}u
            </div>
          </div>
        </div>

        {/* Row 2: team abbr + HOME/AWAY + bet type + odds */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: "#ffffff", letterSpacing: -0.5, lineHeight: 1 }}>
            {pickAbbrUpper}
          </span>
          {/* HOME/AWAY pill — bright enough to read, secondary to the abbr */}
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
            color: "#9CA3AF",
            background: "#1e1e1e", border: "1px solid #2e2e2e",
            padding: "2px 6px", borderRadius: 4,
          }}>
            {d.pickIsHome ? "HOME" : "AWAY"}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#9CA3AF" }}>
            {d.betType}
          </span>
          <span style={{
            fontSize: 15, fontWeight: 800, color: "#e5e7eb",
            background: "#1a1a1a", border: "1px solid #2a2a2a",
            padding: "2px 8px", borderRadius: 4,
          }}>
            {d.currentOdds}
          </span>
        </div>

        {/* Row 3: CLV line movement */}
        <div style={{
          marginTop: 8,
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 9px",
          background: "#0a0a0a", borderRadius: 6, border: "1px solid #1d1d1d",
        }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#9CA3AF", letterSpacing: "0.1em" }}>
            CLV
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF" }}>
            Open&nbsp;<span style={{ color: "#d1d5db", fontWeight: 700 }}>{d.openingOdds}</span>
          </span>
          <span style={{ fontSize: 10, color: "#4B5563" }}>→</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#e5e7eb" }}>
            {d.currentOdds}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: clvUp ? "#84CC16" : "#EF4444" }}>
              {clvUp ? "▲" : "▼"}&nbsp;{Math.abs(d.clvShift).toFixed(1)}%
            </span>
            {/* context label */}
            <span style={{ fontSize: 9, color: clvUp ? "#84CC16" : "#EF4444", opacity: 0.7 }}>
              {clvUp ? "with sharp" : "fading"}
            </span>
          </div>
        </div>
      </div>

      {/* ━━━━ MATCHUP ━━━━ */}
      <div style={{ padding: "10px 14px 0" }}>

        {/* Logos + abbrs + records */}
        <div style={{ display: "flex", alignItems: "center" }}>

          {/* Home team */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Logo sportKey={d.sportKey} abbr={d.homeAbbr} size={36} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  fontSize: 14, fontWeight: 800, letterSpacing: -0.2,
                  color: d.pickIsHome ? "#ffffff" : "#9CA3AF",
                }}>
                  {d.homeAbbr.toUpperCase()}
                </span>
                <span style={{ fontSize: 8, fontWeight: 700, color: "#6B7280", letterSpacing: "0.05em" }}>
                  HOME
                </span>
              </div>
              <div style={{ fontSize: 9, color: "#6B7280", marginTop: 1 }}>{d.homeRecord}</div>
            </div>
          </div>

          {/* vs */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#4B5563", letterSpacing: 1 }}>VS</span>
          </div>

          {/* Away team */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: "row-reverse" }}>
            <Logo sportKey={d.sportKey} abbr={d.awayAbbr} size={36} />
            <div style={{ textAlign: "right" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: "#6B7280", letterSpacing: "0.05em" }}>
                  AWAY
                </span>
                <span style={{
                  fontSize: 14, fontWeight: 800, letterSpacing: -0.2,
                  color: !d.pickIsHome ? "#ffffff" : "#9CA3AF",
                }}>
                  {d.awayAbbr.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: 9, color: "#6B7280", marginTop: 1 }}>{d.awayRecord}</div>
            </div>
          </div>

          {/* Sport + time */}
          <div style={{ marginLeft: 14, textAlign: "right", minWidth: 68 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#6B7280", letterSpacing: 0.3 }}>{d.sport}</div>
            <div style={{ fontSize: 9, color: "#6B7280", marginTop: 2, lineHeight: 1.3 }}>{d.gameTime}</div>
          </div>
        </div>

        {/* Starting pitchers */}
        {d.homeStarter && d.awayStarter && (
          <div style={{
            marginTop: 8,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "5px 9px",
            background: "#0a0a0a", borderRadius: 5, border: "1px solid #1a1a1a",
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF",
              color: d.pickIsHome ? "#d1d5db" : "#9CA3AF" }}>
              {d.homeStarter}
            </span>
            <span style={{ fontSize: 9, fontWeight: 600, color: "#6B7280", letterSpacing: "0.05em" }}>SP</span>
            <span style={{ fontSize: 10, fontWeight: 700,
              color: !d.pickIsHome ? "#d1d5db" : "#9CA3AF" }}>
              {d.awayStarter}
            </span>
          </div>
        )}

        {/* ━━━━ METRICS STRIP ━━━━ */}
        <div style={{
          display: "flex", alignItems: "center",
          padding: "10px 0 12px",
        }}>
          {/* Score */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: -0.5, lineHeight: 1 }}>
              {d.score}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#84CC16" }}>/100</span>
          </div>

          <div style={{ width: 1, height: 22, background: "#222", margin: "0 12px" }} />

          {/* Edge */}
          <div>
            <div style={{ fontSize: 8, color: "#9CA3AF", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 1 }}>EDGE</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#84CC16" }}>+{d.edge}%</div>
          </div>

          {d.stars >= 4 && (
            <>
              <div style={{ width: 1, height: 22, background: "#222", margin: "0 12px" }} />
              <div>
                <div style={{ fontSize: 8, color: "#9CA3AF", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 2 }}>CONF</div>
                <div style={{ fontSize: 12, color: "#84CC16", letterSpacing: 1 }}>{starsStr}</div>
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
    <div style={{
      background: "#000",
      minHeight: "100vh",
      padding: "16px 16px 32px",
      fontFamily: "Inter, sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ width: 3, height: 18, background: "#84CC16", borderRadius: 2 }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: "#84CC16", letterSpacing: "0.12em" }}>
          STRONG BUY
        </span>
        <div style={{
          width: 20, height: 20, borderRadius: "50%",
          background: "#1a2600", border: "1px solid #84CC16",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
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
