import { useEffect, useMemo, useState } from "react";
import TBMHeroPlayCard from "../components/home/TBMHeroPlayCard";
import TBMTopPlayRow from "../components/home/TBMTopPlayRow";
import "../components/home/TBMDashboardFramework.css";

const API_URL = import.meta.env.VITE_API_URL;

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
}

function score(play) {
  return Number(play?.universal_pod_score ?? play?.pod_score ?? play?.final_model_score ?? 0);
}

function sport(play) {
  return play?.pod_sport || play?.sport || play?.league || "Unknown";
}

function book(play) {
  return play?.best_sportsbook || play?.best_book || play?.sportsbook || "Best Available";
}

function rec(play) {
  return play?.final_recommendation || play?.recommendation || "Model Play";
}

function tier(play) {
  return play?.final_model_tier || play?.universal_pod_tier || play?.market_intelligence_grade || "N/A";
}

function odds(play) {
  return play?.best_odds ?? play?.odds;
}

function stars(play) {
  const value = Number(play?.final_stars || 0);
  if (!value) return "★★★☆☆";
  return "★".repeat(Math.max(1, Math.min(5, value))) + "☆".repeat(Math.max(0, 5 - value));
}

function ratingScore(play) {
  return play?.final_model_score ?? play?.universal_pod_score ?? play?.top_play_score ?? "N/A";
}

function movementText(play) {
  const opening = play?.opening_odds ?? play?.open_odds;
  const current = play?.current_odds ?? play?.best_odds ?? play?.odds;

  if (opening === undefined || opening === null || current === undefined || current === null) {
    return "Movement unavailable";
  }

  return `${formatOdds(opening)} → ${formatOdds(current)}`;
}

function Metric({ label, value, accent = false }) {
  return (
    <div style={metricStyle}>
      <span style={metricLabelStyle}>{label}</span>
      <strong style={{ ...metricValueStyle, color: accent ? "#22c55e" : "#f9fafb" }}>
        {value ?? "N/A"}
      </strong>
    </div>
  );
}

function Pill({ children, tone = "dark" }) {
  const colors = {
    green: "#16a34a",
    yellow: "#ca8a04",
    blue: "#2563eb",
    red: "#dc2626",
    dark: "#1f2937",
  };

  return <span style={{ ...pillStyle, backgroundColor: colors[tone] || colors.dark }}>{children}</span>;
}

function LogoBubble({ label, emoji }) {
  return (
    <div style={logoBubbleStyle}>
      <span>{emoji}</span>
      <small>{label}</small>
    </div>
  );
}

function FlagshipPlay({ play }) {
  return <TBMHeroPlayCard play={play} />;
}

function TopPlayRow({ play, index }) {
  return <TBMTopPlayRow play={play} index={index} />;
}

function SportCard({ name, play }) {
  if (!play) return null;

  return (
    <a href={sportPath(name)} style={sportCardStyle}>
      <div style={sportCardTopStyle}>
        <LogoBubble label={name} emoji={sportEmoji(name)} />
        <strong>{score(play).toFixed(1)}</strong>
      </div>

      <h3 style={sportPickStyle}>{play.pick}</h3>
      <p style={sportGameStyle}>{play.game}</p>

      <div style={sportMetricRowStyle}>
        <span>{play.market || "N/A"}</span>
        <span>{formatOdds(odds(play))}</span>
        <span>{play.confidence ?? "N/A"}%</span>
        <span>{rec(play)}</span>
      </div>
    </a>
  );
}

function sportEmoji(name) {
  return {
    MLB: "⚾",
    NBA: "🏀",
    NFL: "🏈",
    NHL: "🏒",
    WNBA: "🏀",
    NCAAF: "🏈",
    NCAAMB: "🏀",
    Soccer: "⚽",
    UFC: "🥊",
  }[name] || "📊";
}

function sportPath(name) {
  return {
    MLB: "/mlb-model",
    NBA: "/model-board",
    NFL: "/nfl-model",
    NHL: "/nhl-model",
    WNBA: "/wnba-model",
    NCAAF: "/ncaaf-model",
    NCAAMB: "/model/ncaamb",
    Soccer: "/soccer-model",
    UFC: "/model/ufc",
  }[name] || "/";
}

function StatusTable({ status }) {
  const sports = status?.sports || {};

  return (
    <div style={tableShellStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Sport</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Plays</th>
            <th style={thStyle}>Model</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(sports).map(([name, info]) => (
            <tr key={name}>
              <td style={tdStyle}>{sportEmoji(name)} {name}</td>
              <td style={tdStyle}>
                <span style={{
                  ...statusStyle,
                  backgroundColor: info.healthy ? "#14532d" : "#374151",
                  color: info.healthy ? "#86efac" : "#d1d5db",
                }}>
                  {info.healthy ? "Active" : "No Games"}
                </span>
              </td>
              <td style={tdStyle}>{info.play_count ?? 0}</td>
              <td style={tdStyle}>{info.model_version || "N/A"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HomePage() {
  const [podData, setPodData] = useState(null);
  const [intelligence, setIntelligence] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/homepage`).then((res) => res.json()),
    ])
      .then(([homepage]) => {
        setPodData({
          overall_play: homepage.overall_play,
          top_5: homepage.top_5,
          by_sport: homepage.by_sport,
        });
        setIntelligence({ summary: homepage.platform_intelligence });
        setStatus(homepage.model_status);
      })
      .catch(() => setError("Failed to load homepage dashboard."));
  }, []);

  const summary = intelligence?.summary || {};
  const topThree = useMemo(() => (Array.isArray(podData?.top_5) ? podData.top_5.slice(0, 3) : []), [podData]);
  const flagship = podData?.overall_play || topThree[0] || summary.best_value_play || null;

  const sportEntries = useMemo(() => {
    const bySport = podData?.by_sport || {};
    const order = ["MLB", "Soccer", "WNBA", "NBA", "NFL", "NHL", "NCAAF", "NCAAMB", "UFC"];

    return order
      .map((name) => {
        let play = bySport[name];

        // If the overall flagship play belongs to this sport, it should be
        // the official sport-best card too. This prevents conflicts like:
        // POD = Argentina -2.5, Soccer best = Argentina/Cape Verde Draw.
        if (flagship && sport(flagship) === name) {
          play = flagship;
        }

        // Safety: never show a same-game conflicting play against the flagship.
        if (
          flagship &&
          play &&
          play.game === flagship.game &&
          play.pick !== flagship.pick
        ) {
          play = flagship;
        }

        return play ? [name, play] : null;
      })
      .filter(Boolean);
  }, [podData, flagship]);

  return (
    <main style={pageStyle} className="tbm-home-v2">
      <div className="tbm-home-v2-inner">
      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>The Betting Model</div>
          <h1 style={heroTitleStyle}>Today’s Betting Dashboard</h1>
          <p style={heroTextStyle}>
            The Betting Model turns odds, sharp signals, line movement, sportsbook pricing, and model edge
            into a cleaner daily betting dashboard.
          </p>
          <div style={heroActionsStyle}>
            <a href="#top-plays" style={primaryButtonStyle}>View Premium Card</a>
            <a href="#membership" style={secondaryButtonStyle}>Become Pro</a>
          </div>
        </div>

        <div style={pulsePanelStyle}>
          <span style={pulseLabelStyle}>Today’s Market Pulse</span>
          <strong style={pulseTitleStyle}>{summary.slate_strength || "Loading Slate"}</strong>
          <p style={pulseTextStyle}>{summary.market_pulse_summary || "Loading platform intelligence..."}</p>
        </div>
      </section>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      {!podData ? (
        <p>Loading dashboard...</p>
      ) : (
        <>
          <FlagshipPlay play={flagship} />

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>Market Intelligence</div>
                <h2 style={sectionTitleStyle}>Today’s Betting Landscape</h2>
              </div>
            </div>

            <div style={metricGridStyle}>
              <Metric label="Total Plays" value={summary.total_plays} />
              <Metric label="Elite Plays" value={summary.elite_plays} accent />
              <Metric label="Best Sport" value={summary.best_sport_today} accent />
              <Metric label="Best Market" value={summary.best_market_today} />
              <Metric label="Sharp Plays" value={summary.sharp_plays} accent />
              <Metric label="Line Shopping" value={summary.line_shop_opportunities} accent />
              <Metric label="Avg Edge" value={`${summary.average_edge ?? 0}%`} />
              <Metric label="Slate Score" value={summary.slate_score} />
            </div>
          </section>

          <section id="top-plays" style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>Free Preview</div>
                <h2 style={sectionTitleStyle}>Today’s Premium Card</h2>
              </div>
            </div>

            <div style={lockedCardStyle}>
              <div>
                <h3 style={{ marginTop: 0, fontSize: "24px" }}>Full Card Locked</h3>
                <p style={heroTextStyle}>
                  Today’s public board shows the flagship model play. The full daily card will unlock
                  premium plays, deeper market intelligence, and complete model-board access.
                </p>
              </div>

              <div style={lockedListStyle}>
                <div style={lockedPickStyle}><span>🔒 Premium Play #1</span><strong>Full Card</strong></div>
                <div style={lockedPickStyle}><span>🔒 Premium Play #2</span><strong>Sharp Edge</strong></div>
                <div style={lockedPickStyle}><span>🔒 Premium Play #3</span><strong>Best Line</strong></div>
              </div>

              <a href="#membership" style={primaryButtonStyle}>Unlock Today’s Card</a>
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>Sport Boards</div>
                <h2 style={sectionTitleStyle}>Best Play By Sport</h2>
              </div>
            </div>

            <div style={sportGridStyle} className="tbm-home-sports-grid">
              {sportEntries.length > 0 ? (
                sportEntries.map(([name, play]) => (
                  <SportCard key={name} name={name} play={play} />
                ))
              ) : (
                <div style={emptyStyle}>No sport-by-sport plays available.</div>
              )}
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>Model Health</div>
                <h2 style={sectionTitleStyle}>Sport Status</h2>
              </div>
            </div>

            <StatusTable status={status} />
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>Model Transparency</div>
                <h2 style={sectionTitleStyle}>Performance Snapshot</h2>
              </div>
            </div>

            <div style={metricGridStyle}>
              <Metric label="Yesterday" value="Coming Soon" />
              <Metric label="Season Units" value="Tracked Soon" accent />
              <Metric label="Win Rate" value="Tracked Soon" />
              <Metric label="ROI" value="Tracked Soon" accent />
            </div>
          </section>

          <section id="membership" style={membershipStyle}>
            <div>
              <div style={eyebrowStyle}>Coming Soon</div>
              <h2 style={membershipTitleStyle}>The Betting Model Pro</h2>
              <p style={heroTextStyle}>
                Free users will see the flagship play, Top 3 board, and market pulse. Pro members
                will unlock full model boards, sharp money analysis, CLV tracking, line shopping,
                historical analytics, live refreshes, and premium alerts.
              </p>
            </div>

            <div style={membershipCardsStyle}>
              <Metric label="Free" value="Flagship + Top 3" />
              <Metric label="Pro" value="Full Model Boards" accent />
              <Metric label="VIP" value="Alerts + Reports" accent />
            </div>
          </section>
        </>
      )}
          </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: "0",
  color: "white",
  background: "radial-gradient(circle at top left, rgba(34,197,94,.12), transparent 28%), radial-gradient(circle at top right, rgba(59,130,246,.10), transparent 26%), #0b0b0b",
};

const heroStyle = {
  display: "grid",
  gridTemplateColumns: "1.4fr .9fr",
  gap: "24px",
  alignItems: "stretch",
  marginBottom: "28px",
};

const eyebrowStyle = {
  display: "inline-block",
  backgroundColor: "#22c55e",
  color: "black",
  padding: "6px 10px",
  borderRadius: "8px",
  marginBottom: "14px",
  fontWeight: "900",
  fontSize: "13px",
  textTransform: "uppercase",
};

const heroTitleStyle = {
  margin: "0 0 12px",
  fontSize: "56px",
  lineHeight: ".95",
  letterSpacing: "-0.06em",
};

const heroTextStyle = {
  color: "#9ca3af",
  lineHeight: "1.65",
  maxWidth: "850px",
};

const heroActionsStyle = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  marginTop: "20px",
};

const primaryButtonStyle = {
  backgroundColor: "#22c55e",
  color: "black",
  padding: "13px 17px",
  borderRadius: "12px",
  fontWeight: "900",
  textDecoration: "none",
};

const secondaryButtonStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  color: "white",
  padding: "13px 17px",
  borderRadius: "12px",
  fontWeight: "900",
  textDecoration: "none",
};

const pulsePanelStyle = {
  background: "linear-gradient(145deg, #111827, #020617)",
  border: "1px solid #374151",
  borderRadius: "20px",
  padding: "24px",
};

const pulseLabelStyle = {
  color: "#9ca3af",
  fontSize: "13px",
  fontWeight: "900",
  textTransform: "uppercase",
};

const pulseTitleStyle = {
  display: "block",
  color: "#22c55e",
  fontSize: "34px",
  marginTop: "12px",
};

const pulseTextStyle = {
  color: "#d1d5db",
  lineHeight: "1.55",
};

const flagshipStyle = {
  display: "grid",
  gridTemplateColumns: "1.35fr .8fr",
  gap: "24px",
  background: "linear-gradient(145deg, #111827, #020617)",
  border: "2px solid #22c55e",
  borderRadius: "22px",
  padding: "26px",
  boxShadow: "0 0 28px rgba(34,197,94,.22)",
  marginBottom: "42px",
};

const flagshipTopStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "18px",
  alignItems: "flex-start",
};

const flagshipPickStyle = {
  fontSize: "52px",
  lineHeight: ".95",
  margin: "0 0 8px",
  color: "#facc15",
  letterSpacing: "-0.055em",
};

const flagshipGameStyle = {
  color: "#d1d5db",
  fontSize: "18px",
  margin: 0,
};

const scoreBadgeStyle = {
  minWidth: "150px",
  backgroundColor: "#020617",
  border: "1px solid #14532d",
  borderRadius: "16px",
  padding: "16px",
  textAlign: "center",
};

const pillRowStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  margin: "18px 0",
};

const pillStyle = {
  display: "inline-flex",
  alignItems: "center",
  color: "white",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: "999px",
  padding: "8px 11px",
  fontSize: "13px",
  fontWeight: "900",
};

const ticketGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "12px",
};

const metricGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
};

const metricStyle = {
  background: "linear-gradient(145deg, #111827, #020617)",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "18px",
};

const metricLabelStyle = {
  display: "block",
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: "900",
  textTransform: "uppercase",
  marginBottom: "8px",
};

const metricValueStyle = {
  display: "block",
  fontSize: "18px",
};

const whyStyle = {
  backgroundColor: "#020617",
  border: "1px solid #374151",
  borderRadius: "18px",
  padding: "20px",
};

const reasonLineStyle = {
  color: "#d1d5db",
  lineHeight: "1.45",
};

const modelMeterStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "14px",
  padding: "14px",
  marginTop: "16px",
  marginBottom: "14px",
};

const miniSignalGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "10px",
  marginTop: "16px",
};

const sectionStyle = {
  marginBottom: "42px",
};

const sectionHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "18px",
  alignItems: "end",
  marginBottom: "18px",
};

const sectionTitleStyle = {
  margin: 0,
  fontSize: "32px",
  letterSpacing: "-0.04em",
};

const topBoardStyle = {
  display: "grid",
  gap: "14px",
};

const topRowStyle = {
  display: "flex",
  gap: "16px",
  alignItems: "center",
  background: "linear-gradient(145deg, #111827, #020617)",
  border: "1px solid #374151",
  borderRadius: "18px",
  padding: "18px",
};

const rankStyle = {
  width: "46px",
  height: "46px",
  borderRadius: "14px",
  display: "grid",
  placeItems: "center",
  backgroundColor: "#22c55e",
  color: "black",
  fontWeight: "900",
};

const rowHeaderStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  color: "#facc15",
  fontSize: "18px",
};

const rowSubStyle = {
  color: "#9ca3af",
  margin: "6px 0 0",
};

const rowMetricsStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  color: "#d1d5db",
  fontSize: "13px",
};

const logoBubbleStyle = {
  width: "46px",
  height: "46px",
  borderRadius: "999px",
  backgroundColor: "#020617",
  border: "1px solid #374151",
  display: "grid",
  placeItems: "center",
  color: "white",
};

const sportGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};

const sportCardStyle = {
  display: "block",
  background: "linear-gradient(145deg, #111827, #020617)",
  border: "1px solid #374151",
  borderRadius: "18px",
  padding: "15px",
  color: "white",
  textDecoration: "none",
};

const sportCardTopStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  color: "#22c55e",
  fontWeight: "900",
};

const sportPickStyle = {
  color: "#facc15",
  margin: "12px 0 6px",
  fontSize: "17px",
};

const sportGameStyle = {
  color: "#9ca3af",
  minHeight: "34px",
  fontSize: "13px",
  marginBottom: "10px",
};

const sportMetricRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "7px",
  color: "#d1d5db",
  fontSize: "12px",
};

const tableShellStyle = {
  overflowX: "auto",
  border: "1px solid #374151",
  borderRadius: "16px",
};

const tableStyle = {
  width: "100%",
  minWidth: "720px",
  borderCollapse: "collapse",
  backgroundColor: "#111827",
};

const thStyle = {
  color: "#9ca3af",
  padding: "13px",
  textAlign: "left",
  borderBottom: "1px solid #374151",
};

const tdStyle = {
  padding: "13px",
  borderBottom: "1px solid #1f2937",
};

const statusStyle = {
  display: "inline-block",
  borderRadius: "999px",
  padding: "5px 9px",
  fontSize: "12px",
  fontWeight: "900",
};

const membershipStyle = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr",
  gap: "22px",
  background: "linear-gradient(145deg, #111827, #020617)",
  border: "1px solid #374151",
  borderRadius: "22px",
  padding: "26px",
};

const membershipTitleStyle = {
  fontSize: "34px",
  margin: "0 0 10px",
};

const membershipCardsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "12px",
};

const lockedCardStyle = {
  display: "grid",
  gridTemplateColumns: "1.2fr .9fr auto",
  gap: "18px",
  alignItems: "center",
  background: "linear-gradient(145deg, #111827, #020617)",
  border: "1px solid #374151",
  borderRadius: "20px",
  padding: "22px",
};

const lockedListStyle = {
  display: "grid",
  gap: "10px",
};

const lockedPickStyle = {
  backgroundColor: "#020617",
  border: "1px solid #374151",
  borderRadius: "12px",
  padding: "12px",
  color: "#d1d5db",
  fontWeight: "900",
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
};

const emptyStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "18px",
  color: "#9ca3af",
};
