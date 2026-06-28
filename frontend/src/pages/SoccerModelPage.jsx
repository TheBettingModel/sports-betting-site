import { useEffect, useState } from "react";

function SoccerModelPage() {
  const [plays, setPlays] = useState([]);
  const [error, setError] = useState("");
  const [marketFilter, setMarketFilter] = useState("All");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    fetch(`${API_URL}/model/soccer/today`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setPlays(data.plays || []))
      .catch((err) => {
        console.error("Soccer model fetch error:", err);
        setError("Failed to load Soccer model.");
      });
  }, [API_URL]);

  const filtered = plays.filter((play) => {
    if (marketFilter === "All") return true;
    return play.market === marketFilter;
  });

  return (
    <div style={pageStyle}>
      <h1>⚽ Soccer Model</h1>

      <p style={subtitleStyle}>
        Soccer v3 Pro model with World Cup mode, team tiers, draw logic, totals environment,
        line shopping, market intelligence, and universal final ratings.
      </p>

      <div style={filterWrapStyle}>
        {["All", "Moneyline", "Spread", "Total"].map((market) => (
          <button
            key={market}
            onClick={() => setMarketFilter(market)}
            style={marketFilter === market ? activeButtonStyle : buttonStyle}
          >
            {market}
          </button>
        ))}
      </div>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : filtered.length === 0 ? (
        <p>No Soccer plays available.</p>
      ) : (
        <div style={gridStyle}>
          {filtered.map((play, index) => (
            <div key={`${play.game}-${play.pick}-${index}`} style={cardStyle}>
              <div style={topRowStyle}>
                <span style={sportBadgeStyle}>⚽ Soccer</span>
                <span style={badgeStyle}>{play.final_recommendation || play.recommendation}</span>
              </div>

              <h2 style={pickStyle}>{play.pick}</h2>
              <p style={gameStyle}>{play.game}</p>

              <div style={statsGridStyle}>
                <Stat label="Market" value={play.market} />
                <Stat label="Odds" value={play.best_odds || play.odds} />
                <Stat label="Edge" value={`${play.edge}%`} />
                <Stat label="Confidence" value={play.confidence} />
                <Stat label="Units" value={play.units} />
                <Stat label="Final Score" value={play.final_model_score} />
                <Stat label="Tier" value={play.final_model_tier} />
                <Stat label="POD Score" value={play.universal_pod_score} />
              </div>

              <div style={signalBoxStyle}>
                <p><strong>Market:</strong> {play.market_intelligence_grade || "N/A"} — {play.market_intelligence_signal || "N/A"}</p>
                <p><strong>Sharp:</strong> {play.sharp_signal || "N/A"}</p>
                <p><strong>Best Book:</strong> {play.best_sportsbook || play.sportsbook || "N/A"} ({play.best_odds || play.odds || "N/A"})</p>
                <p><strong>Line Value:</strong> {play.line_shop_value ?? "N/A"}</p>
              </div>

              <div style={soccerBoxStyle}>
                <p><strong>Team Tier:</strong> {play.soccer_team_tier || "N/A"}</p>
                <p><strong>Tournament Mode:</strong> {play.soccer_tournament_mode ? "Yes" : "No"}</p>
                <p><strong>Total Environment:</strong> {play.soccer_total_environment || "N/A"}</p>
                <p><strong>BTTS Score:</strong> {play.soccer_btts_score ?? "N/A"}</p>
              </div>

              <p style={reasonStyle}>{play.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={statStyle}>
      <span style={statLabelStyle}>{label}</span>
      <strong>{value ?? "N/A"}</strong>
    </div>
  );
}

const pageStyle = {
  backgroundColor: "#020617",
  color: "white",
  minHeight: "100vh",
  padding: "32px",
};

const subtitleStyle = {
  color: "#9ca3af",
  maxWidth: "900px",
  lineHeight: "1.6",
};

const filterWrapStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  margin: "24px 0",
};

const buttonStyle = {
  backgroundColor: "#111827",
  color: "white",
  border: "1px solid #374151",
  padding: "10px 14px",
  borderRadius: "999px",
  cursor: "pointer",
};

const activeButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#22c55e",
  color: "black",
  fontWeight: "bold",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
  gap: "20px",
};

const cardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "18px",
  padding: "22px",
};

const topRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  marginBottom: "14px",
};

const sportBadgeStyle = {
  backgroundColor: "#1f2937",
  border: "1px solid #374151",
  padding: "6px 10px",
  borderRadius: "999px",
  fontWeight: "bold",
};

const badgeStyle = {
  backgroundColor: "#22c55e",
  color: "black",
  padding: "6px 10px",
  borderRadius: "999px",
  fontWeight: "bold",
};

const pickStyle = {
  margin: "0 0 8px",
};

const gameStyle = {
  color: "#d1d5db",
  marginBottom: "16px",
};

const statsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "10px",
  marginBottom: "16px",
};

const statStyle = {
  backgroundColor: "#020617",
  border: "1px solid #374151",
  borderRadius: "12px",
  padding: "10px",
};

const statLabelStyle = {
  display: "block",
  color: "#9ca3af",
  fontSize: "12px",
  marginBottom: "4px",
};

const signalBoxStyle = {
  backgroundColor: "#020617",
  border: "1px solid #374151",
  borderRadius: "12px",
  padding: "12px",
  marginBottom: "12px",
  color: "#d1d5db",
};

const soccerBoxStyle = {
  backgroundColor: "#052e16",
  border: "1px solid #166534",
  borderRadius: "12px",
  padding: "12px",
  marginBottom: "12px",
  color: "#dcfce7",
};

const reasonStyle = {
  color: "#d1d5db",
  lineHeight: "1.6",
};

export default SoccerModelPage;
