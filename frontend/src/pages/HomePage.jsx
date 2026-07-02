import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
}

function getScore(play) {
  return Number(play?.universal_pod_score ?? play?.pod_score ?? play?.final_model_score ?? 0);
}

function getBook(play) {
  return play?.best_sportsbook || play?.best_book || play?.sportsbook || "N/A";
}

function getRec(play) {
  return play?.final_recommendation || play?.recommendation || "N/A";
}

function getTier(play) {
  return play?.final_model_tier || play?.universal_pod_tier || play?.market_intelligence_grade || "N/A";
}

function getSport(play) {
  return play?.pod_sport || play?.sport || play?.league || "Unknown";
}

function MetricTile({ label, value, highlight = false }) {
  return (
    <div style={metricTileStyle}>
      <span style={metricLabelStyle}>{label}</span>
      <strong style={{ ...metricValueStyle, color: highlight ? "#22c55e" : "white" }}>
        {value ?? "N/A"}
      </strong>
    </div>
  );
}

function Badge({ children, color = "#1f2937" }) {
  return <span style={{ ...badgeStyle, backgroundColor: color }}>{children}</span>;
}

function FeaturedPlay({ play }) {
  if (!play) return <p>No featured play available.</p>;

  const reasons =
    play.final_rating_reasons ||
    play.market_intelligence_reasons ||
    play.universal_pod_reasons ||
    [];

  return (
    <div style={featuredCardStyle}>
      <div style={labelStyle}>Today’s Featured Model Play</div>

      <div style={featuredGridStyle}>
        <div>
          <h2 style={{ fontSize: "34px", marginBottom: "8px" }}>{play.game}</h2>
          <h3 style={{ fontSize: "26px", color: "#facc15", marginBottom: "16px" }}>
            {play.pick} {formatOdds(play.best_odds ?? play.odds)}
          </h3>

          <div style={badgeWrapStyle}>
            <Badge>Sport: {getSport(play)}</Badge>
            <Badge>Market: {play.market || "N/A"}</Badge>
            <Badge>Best Book: {getBook(play)}</Badge>
            <Badge>Edge: {play.edge ?? "N/A"}%</Badge>
            <Badge>Confidence: {play.confidence ?? "N/A"}</Badge>
            <Badge>POD: {getScore(play).toFixed(2)}</Badge>
            <Badge color="#16a34a">{getRec(play)}</Badge>
            <Badge color="#14532d">{getTier(play)}</Badge>
          </div>
        </div>

        <div style={scorePanelStyle}>
          <span style={{ color: "#9ca3af", fontWeight: "bold" }}>POD SCORE</span>
          <strong style={{ color: "#22c55e", fontSize: "46px" }}>
            {getScore(play).toFixed(2)}
          </strong>
          <p style={{ color: "#d1d5db", marginTop: "8px" }}>{getTier(play)}</p>
        </div>
      </div>

      <div style={signalGridStyle}>
        <div>
          <h4>📈 Market</h4>
          <p>Sharp: {play.sharp_signal || "N/A"}</p>
          <p>CLV: {play.clv_status || "N/A"}</p>
          <p>Grade: {play.market_intelligence_grade || "N/A"}</p>
        </div>
        <div>
          <h4>💰 Sportsbook</h4>
          <p>Best: {getBook(play)}</p>
          <p>Line Value: {play.line_shop_value ?? "N/A"}</p>
          <p>Worst Odds: {formatOdds(play.worst_odds)}</p>
        </div>
        <div>
          <h4>🔥 Sharp</h4>
          <p>Signal: {play.sharp_signal || "N/A"}</p>
          <p>Book: {play.sharp_book_signal || "N/A"}</p>
          <p>Steam: {play.steam_strength || "N/A"}</p>
        </div>
        <div>
          <h4>⭐ Rating</h4>
          <p>Model Score: {play.final_model_score ?? "N/A"}</p>
          <p>Stars: {play.final_stars ? `${play.final_stars}/5` : "N/A"}</p>
          <p>Recommendation: {getRec(play)}</p>
        </div>
      </div>

      <div style={reasonStyle}>
        {Array.isArray(reasons) && reasons.length > 0
          ? reasons.slice(0, 5).map((reason, index) => (
              <p key={index} style={{ margin: "5px 0" }}>✓ {reason}</p>
            ))
          : play.reason || play.sharp_reason || "No model reason available."}
      </div>
    </div>
  );
}

function TopPlayCard({ play, index }) {
  if (!play) return null;

  return (
    <div style={playCardStyle}>
      <div style={labelStyle}>#{index + 1} Overall Play</div>
      <h3 style={{ fontSize: "22px", marginBottom: "8px" }}>{play.game}</h3>
      <h4 style={{ color: "#facc15", fontSize: "20px", marginBottom: "12px" }}>
        {play.pick} {formatOdds(play.best_odds ?? play.odds)}
      </h4>

      <div style={badgeWrapStyle}>
        <Badge>{getSport(play)}</Badge>
        <Badge>{play.market || "N/A"}</Badge>
        <Badge>{getBook(play)}</Badge>
        <Badge>Edge: {play.edge ?? "N/A"}%</Badge>
        <Badge>Conf: {play.confidence ?? "N/A"}</Badge>
        <Badge>POD: {getScore(play).toFixed(2)}</Badge>
        <Badge color="#16a34a">{getRec(play)}</Badge>
      </div>
    </div>
  );
}

function SportPlayCard({ sport, play }) {
  if (!play) return null;

  return (
    <div style={sportCardStyle}>
      <div style={sportTopStyle}>
        <div style={labelStyle}>{sport}</div>
        <strong style={{ color: "#22c55e", fontSize: "23px" }}>
          {getScore(play).toFixed(2)}
        </strong>
      </div>

      <h3 style={{ fontSize: "19px", marginBottom: "10px" }}>{play.game}</h3>
      <h4 style={{ color: "#facc15", marginBottom: "14px" }}>
        {play.pick} {formatOdds(play.best_odds ?? play.odds)}
      </h4>

      <div style={badgeWrapStyle}>
        <Badge>{play.market || "N/A"}</Badge>
        <Badge>{getBook(play)}</Badge>
        <Badge>Edge: {play.edge ?? "N/A"}%</Badge>
        <Badge>{getRec(play)}</Badge>
      </div>
    </div>
  );
}

function SportStatusTable({ status }) {
  const sports = status?.sports || {};

  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Sport</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Plays</th>
            <th style={thStyle}>Top Play</th>
            <th style={thStyle}>Model</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(sports).map(([sport, info]) => {
            const top = info?.top_play;
            return (
              <tr key={sport}>
                <td style={tdStyle}>{sport}</td>
                <td style={tdStyle}>
                  <span style={{
                    ...statusPillStyle,
                    backgroundColor: info.healthy ? "#14532d" : "#374151",
                    color: info.healthy ? "#86efac" : "#d1d5db",
                  }}>
                    {info.healthy ? "Active" : "No Games"}
                  </span>
                </td>
                <td style={tdStyle}>{info.play_count ?? 0}</td>
                <td style={tdStyle}>{top ? `${top.pick || "N/A"} (${top.game || "N/A"})` : "N/A"}</td>
                <td style={tdStyle}>{info.model_version || "N/A"}</td>
              </tr>
            );
          })}
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
  const topThree = useMemo(() => {
    return Array.isArray(podData?.top_5) ? podData.top_5.slice(0, 3) : [];
  }, [podData]);

  const featuredPlay = podData?.overall_play || topThree[0] || summary.best_value_play || null;
  const sportEntries = Object.entries(podData?.by_sport || {}).filter(([, play]) => play);

  return (
    <div style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <div style={labelStyle}>The Betting Model</div>
          <h1 style={{ marginBottom: "10px", fontSize: "42px" }}>
            Sports Betting Intelligence Platform
          </h1>
          <p style={subtitleStyle}>
            AI-powered betting analytics built on market intelligence, sportsbook comparison,
            sharp signals, line shopping, CLV, model confidence, and universal POD rankings.
          </p>

          <div style={heroButtonWrapStyle}>
            <a href="#top-plays" style={primaryButtonStyle}>View Today’s Plays</a>
            <a href="#membership" style={secondaryButtonStyle}>Become a Member</a>
          </div>
        </div>

        <div style={heroMetricGridStyle}>
          <MetricTile label="Slate Strength" value={summary.slate_strength || "Loading"} highlight />
          <MetricTile label="Best Sport" value={summary.best_sport_today || "N/A"} />
          <MetricTile label="Elite Plays" value={summary.elite_plays ?? "N/A"} highlight />
          <MetricTile label="Sharp Plays" value={summary.sharp_plays ?? "N/A"} />
        </div>
      </section>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      {!podData ? (
        <p>Loading dashboard...</p>
      ) : (
        <>
          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Platform Intelligence</h2>
            <p style={subtitleStyle}>{summary.market_pulse_summary || "Loading market pulse..."}</p>

            <div style={metricGridStyle}>
              <MetricTile label="Total Plays" value={summary.total_plays} />
              <MetricTile label="Active Sports" value={summary.active_sports} />
              <MetricTile label="Best Market" value={summary.best_market_today} />
              <MetricTile label="Top Sportsbook" value={summary.top_sportsbook} />
              <MetricTile label="Avg Edge" value={`${summary.average_edge ?? 0}%`} highlight />
              <MetricTile label="Avg Confidence" value={summary.average_confidence} />
              <MetricTile label="Line Shop Opps" value={summary.line_shop_opportunities} highlight />
              <MetricTile label="Slate Score" value={summary.slate_score} />
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Today’s Featured Play</h2>
            <FeaturedPlay play={featuredPlay} />
          </section>

          <section id="top-plays" style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Top 3 Overall Model Plays</h2>
            <div style={gridStyle}>
              {topThree.map((play, index) => (
                <TopPlayCard key={`${play.game}-${play.pick}-${index}`} play={play} index={index} />
              ))}
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Best Play By Sport</h2>
            <div style={sportGridStyle}>
              {sportEntries.map(([sport, play]) => (
                <SportPlayCard key={sport} sport={sport} play={play} />
              ))}
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Market Pulse</h2>
            <div style={signalGridStyle}>
              <div>
                <h4>🔥 Best Value</h4>
                <p>{summary.best_value_play?.pick || "N/A"}</p>
                <p>{summary.best_value_play?.game || "N/A"}</p>
              </div>
              <div>
                <h4>📈 Highest Edge</h4>
                <p>{summary.highest_edge_play?.pick || "N/A"}</p>
                <p>Edge: {summary.highest_edge_play?.edge ?? "N/A"}%</p>
              </div>
              <div>
                <h4>✅ Highest Confidence</h4>
                <p>{summary.highest_confidence_play?.pick || "N/A"}</p>
                <p>Confidence: {summary.highest_confidence_play?.confidence ?? "N/A"}</p>
              </div>
              <div>
                <h4>💰 Best Line Shop</h4>
                <p>{summary.best_line_shop_play?.pick || "N/A"}</p>
                <p>Value: {summary.best_line_shop_play?.line_shop_value ?? "N/A"}</p>
              </div>
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Sport Status</h2>
            <SportStatusTable status={status} />
          </section>

          <section id="membership" style={membershipStyle}>
            <div>
              <div style={labelStyle}>Coming Soon</div>
              <h2 style={{ fontSize: "32px", marginBottom: "10px" }}>The Betting Model Pro</h2>
              <p style={subtitleStyle}>
                Unlock every model board, advanced analytics, sportsbook comparison,
                CLV tracking, market timing, historical performance, and premium betting tools.
              </p>
            </div>

            <div style={membershipGridStyle}>
              <MetricTile label="Free" value="Top Plays" />
              <MetricTile label="Pro" value="Full Access" highlight />
              <MetricTile label="VIP" value="Alerts + Reports" highlight />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const pageStyle = {
  padding: "30px",
  backgroundColor: "#0b0b0b",
  minHeight: "100vh",
  color: "white",
};

const heroStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "18px",
  padding: "28px",
  marginBottom: "34px",
  display: "grid",
  gridTemplateColumns: "1.35fr 1fr",
  gap: "24px",
};

const subtitleStyle = {
  color: "#9ca3af",
  marginBottom: "20px",
  maxWidth: "950px",
  lineHeight: "1.6",
};

const heroButtonWrapStyle = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
};

const primaryButtonStyle = {
  backgroundColor: "#22c55e",
  color: "black",
  padding: "12px 16px",
  borderRadius: "10px",
  fontWeight: "bold",
  textDecoration: "none",
};

const secondaryButtonStyle = {
  backgroundColor: "#1f2937",
  color: "white",
  padding: "12px 16px",
  borderRadius: "10px",
  fontWeight: "bold",
  textDecoration: "none",
  border: "1px solid #374151",
};

const heroMetricGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "12px",
};

const sectionStyle = {
  marginBottom: "45px",
};

const sectionTitleStyle = {
  marginBottom: "18px",
  fontSize: "30px",
};

const metricGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "14px",
};

const metricTileStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "14px",
  padding: "18px",
};

const metricLabelStyle = {
  color: "#9ca3af",
  display: "block",
  fontSize: "13px",
  fontWeight: "bold",
  marginBottom: "8px",
  textTransform: "uppercase",
};

const metricValueStyle = {
  fontSize: "22px",
  display: "block",
};

const featuredCardStyle = {
  backgroundColor: "#111827",
  border: "2px solid #22c55e",
  borderRadius: "16px",
  padding: "24px",
  boxShadow: "0 0 18px rgba(34, 197, 94, 0.35)",
};

const featuredGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 190px",
  gap: "22px",
};

const scorePanelStyle = {
  backgroundColor: "#020617",
  border: "1px solid #14532d",
  borderRadius: "14px",
  padding: "18px",
  textAlign: "center",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "22px",
};

const sportGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: "24px",
};

const playCardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "22px",
};

const sportCardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "22px",
};

const sportTopStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
};

const labelStyle = {
  backgroundColor: "#22c55e",
  color: "black",
  padding: "6px 10px",
  borderRadius: "8px",
  display: "inline-block",
  marginBottom: "16px",
  fontWeight: "bold",
  fontSize: "14px",
};

const badgeWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  marginBottom: "20px",
};

const badgeStyle = {
  border: "1px solid #374151",
  color: "white",
  padding: "8px 10px",
  borderRadius: "999px",
  fontSize: "14px",
  fontWeight: "bold",
};

const signalGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "16px",
  backgroundColor: "#020617",
  padding: "18px",
  borderRadius: "12px",
  marginBottom: "18px",
};

const reasonStyle = {
  color: "#d1d5db",
  lineHeight: "1.6",
};

const tableWrapStyle = {
  overflowX: "auto",
  border: "1px solid #374151",
  borderRadius: "14px",
};

const tableStyle = {
  width: "100%",
  minWidth: "850px",
  borderCollapse: "collapse",
  backgroundColor: "#111827",
};

const thStyle = {
  color: "#9ca3af",
  padding: "12px",
  textAlign: "left",
  borderBottom: "1px solid #374151",
};

const tdStyle = {
  padding: "12px",
  borderBottom: "1px solid #1f2937",
};

const statusPillStyle = {
  padding: "5px 9px",
  borderRadius: "999px",
  fontSize: "13px",
  fontWeight: "bold",
};

const membershipStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "18px",
  padding: "28px",
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr",
  gap: "24px",
};

const membershipGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "12px",
};
