import { useEffect, useMemo, useState } from "react";

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

function FlagshipPlay({ play }) {
  if (!play) return <div style={emptyStyle}>No flagship play available.</div>;

  const reasons = play.final_rating_reasons || play.market_intelligence_reasons || play.universal_pod_reasons || [];

  return (
    <section style={flagshipStyle}>
      <div>
        <div style={eyebrowStyle}>Today’s Flagship Play</div>

        <div style={flagshipTopStyle}>
          <div>
            <h1 style={flagshipPickStyle}>{play.pick}</h1>
            <p style={flagshipGameStyle}>{play.game}</p>
          </div>

          <div style={scoreBadgeStyle}>
            <span>POD</span>
            <strong>{score(play).toFixed(2)}</strong>
          </div>
        </div>

        <div style={pillRowStyle}>
          <Pill tone="green">{rec(play)}</Pill>
          <Pill tone="blue">{sport(play)}</Pill>
          <Pill>{play.market || "N/A"}</Pill>
          <Pill tone="yellow">{tier(play)}</Pill>
        </div>

        <div style={ticketGridStyle}>
          <Metric label="Best Odds" value={formatOdds(odds(play))} accent />
          <Metric label="Best Book" value={book(play)} />
          <Metric label="Edge" value={`${play.edge ?? "N/A"}%`} accent />
          <Metric label="Confidence" value={play.confidence ?? "N/A"} accent />
          <Metric label="Units" value={play.units ?? "N/A"} />
          <Metric label="Market Grade" value={play.market_intelligence_grade || "N/A"} />
        </div>
      </div>

      <aside style={whyStyle}>
        <h3 style={{ marginTop: 0 }}>Why The Model Likes It</h3>
        {Array.isArray(reasons) && reasons.length > 0 ? (
          reasons.slice(0, 6).map((reason, index) => (
            <p key={index} style={reasonLineStyle}>✓ {reason}</p>
          ))
        ) : (
          <p style={reasonLineStyle}>{play.reason || play.sharp_reason || "No model reason available."}</p>
        )}

        <div style={modelMeterStyle}>
          <span>Model Rating</span>
          <strong>{stars(play)}</strong>
          <small>{ratingScore(play)} / 100</small>
        </div>

        <div style={miniSignalGridStyle}>
          <div>
            <span>Market Move</span>
            <strong>{movementText(play)}</strong>
          </div>
          <div>
            <span>CLV</span>
            <strong>{play.clv_status || "N/A"}</strong>
          </div>
          <div>
            <span>Sharp</span>
            <strong>{play.sharp_signal || "N/A"}</strong>
          </div>
          <div>
            <span>Line Value</span>
            <strong>{play.line_shop_value ?? "N/A"}</strong>
          </div>
        </div>
      </aside>
    </section>
  );
}

function TopPlayRow({ play, index }) {
  if (!play) return null;

  return (
    <div style={topRowStyle}>
      <div style={rankStyle}>#{index + 1}</div>

      <div style={{ flex: 1 }}>
        <div style={rowHeaderStyle}>
          <strong>{play.pick}</strong>
          <span>{formatOdds(odds(play))}</span>
        </div>
        <p style={rowSubStyle}>{play.game}</p>
      </div>

      <div style={rowMetricsStyle}>
        <span>{sport(play)}</span>
        <span>{play.market || "N/A"}</span>
        <span>{book(play)}</span>
        <span>{stars(play)}</span>
        <span>Edge {play.edge ?? "N/A"}%</span>
        <span>Conf {play.confidence ?? "N/A"}</span>
        <span>POD {score(play).toFixed(2)}</span>
        <span>{play.market_intelligence_grade || "Grade N/A"}</span>
      </div>

      <Pill tone="green">{rec(play)}</Pill>
    </div>
  );
}

function SportCard({ name, play }) {
  if (!play) return null;

  return (
    <a href={sportPath(name)} style={sportCardStyle}>
      <div style={sportCardTopStyle}>
        <span>{sportEmoji(name)} {name}</span>
        <strong>{score(play).toFixed(2)}</strong>
      </div>
      <h3 style={sportPickStyle}>{play.pick}</h3>
      <p style={sportGameStyle}>{play.game}</p>
      <div style={sportMetricRowStyle}>
        <span>{play.market || "N/A"}</span>
        <span>{formatOdds(odds(play))}</span>
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
      fetch(`${API_URL}/model/play-of-the-day-v2`).then((res) => res.json()),
      fetch(`${API_URL}/platform/intelligence`).then((res) => res.json()),
      fetch(`${API_URL}/model/status`).then((res) => res.json()),
    ])
      .then(([pod, intel, modelStatus]) => {
        setPodData(pod);
        setIntelligence(intel);
        setStatus(modelStatus);
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
      .filter((name) => bySport[name])
      .map((name) => [name, bySport[name]]);
  }, [podData]);

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>The Betting Model</div>
          <h1 style={heroTitleStyle}>One free pick. Full card for members.</h1>
          <p style={heroTextStyle}>
            The Betting Model gives free visitors today’s flagship play. Pro members unlock the full
            daily card, model boards, market intelligence, sharp money, line shopping, and CLV tools.
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
                  Free visitors get today’s flagship play. Pro members unlock the full daily card,
                  including premium MLB, F5, NRFI, Soccer, WNBA, NCAAMB, UFC and all model-board plays.
                </p>
              </div>

              <div style={lockedListStyle}>
                <div style={lockedPickStyle}>🔒 Premium Play #1</div>
                <div style={lockedPickStyle}>🔒 Premium Play #2</div>
                <div style={lockedPickStyle}>🔒 Premium Play #3</div>
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

            <div style={sportGridStyle}>
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
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: "30px",
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
  fontSize: "20px",
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
  fontSize: "20px",
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

const sportGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(245px, 1fr))",
  gap: "16px",
};

const sportCardStyle = {
  display: "block",
  background: "linear-gradient(145deg, #111827, #020617)",
  border: "1px solid #374151",
  borderRadius: "18px",
  padding: "18px",
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
  marginBottom: "8px",
};

const sportGameStyle = {
  color: "#9ca3af",
  minHeight: "42px",
};

const sportMetricRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  color: "#d1d5db",
  fontSize: "13px",
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
  padding: "13px",
  color: "#d1d5db",
  fontWeight: "900",
};

const emptyStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "18px",
  color: "#9ca3af",
};
