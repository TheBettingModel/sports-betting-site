import { useEffect, useMemo, useState } from "react";

function MLBF5ModelPage() {
  const [plays, setPlays] = useState([]);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  const badgeStyle = {
    backgroundColor: "#1f2937",
    border: "1px solid #374151",
    color: "white",
    padding: "8px 10px",
    borderRadius: "999px",
    fontSize: "14px",
    fontWeight: "bold",
  };

  useEffect(() => {
    fetch(`${API_URL}/model/mlb/f5/today`)
      .then((res) => res.json())
      .then((data) => {
        if (data.plays) setPlays(data.plays);
        else setError("Failed to load MLB F5 model.");
      })
      .catch(() => setError("Failed to load MLB F5 model."));
  }, [API_URL]);

  const sortedPlays = useMemo(() => {
    return [...plays].sort((a, b) => (b.edge || 0) - (a.edge || 0));
  }, [plays]);

  return (
    <div style={{ padding: "30px", backgroundColor: "#0b0b0b", minHeight: "100vh", color: "white" }}>
      <h1 style={{ marginBottom: "10px", fontSize: "38px" }}>MLB F5 Model</h1>

      <p style={{ color: "#9ca3af", marginBottom: "30px", maxWidth: "850px", lineHeight: "1.6" }}>
        First 5 innings model focused on starting pitching, early-game pricing,
        ballpark environment, and market edge while removing bullpen variance.
      </p>

      {error ? (
        <p>{error}</p>
      ) : sortedPlays.length === 0 ? (
        <p>No MLB F5 plays available.</p>
      ) : (
        <div style={{ display: "grid", gap: "24px" }}>
          {sortedPlays.map((play, index) => (
            <div
              key={index}
              style={{
                backgroundColor: "#111827",
                border: index < 3 ? "2px solid #e10600" : "1px solid #374151",
                borderRadius: "16px",
                padding: "24px",
                boxShadow: index < 3 ? "0 0 15px rgba(225, 6, 0, 0.35)" : "none",
              }}
            >
              {index < 3 && (
                <div
                  style={{
                    backgroundColor: "#e10600",
                    color: "white",
                    padding: "6px 10px",
                    borderRadius: "8px",
                    display: "inline-block",
                    marginBottom: "16px",
                    fontWeight: "bold",
                    fontSize: "14px",
                  }}
                >
                  Top F5 Play
                </div>
              )}

              <p style={{ color: "#9ca3af", fontSize: "14px", marginBottom: "6px" }}>
                {play.market} • {play.sportsbook}
              </p>

              <h2>{play.game}</h2>

              <h1 style={{ color: "#22c55e", fontSize: "30px" }}>
                {play.pick}
              </h1>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "18px" }}>
                <span style={badgeStyle}>Odds: {play.odds}</span>
                <span style={badgeStyle}>Edge: {play.edge}%</span>
                <span style={badgeStyle}>Confidence: {play.confidence}%</span>
                <span style={badgeStyle}>Units: {play.units}u</span>
                <span style={badgeStyle}>{play.recommendation}</span>
              </div>

              <div
                style={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "10px",
                  padding: "14px",
                  marginBottom: "16px",
                }}
              >
                <h3 style={{ marginTop: 0 }}>Why We Like It</h3>
                <p style={{ color: "#d1d5db", lineHeight: "1.7" }}>{play.reason}</p>
              </div>

              <h3>F5 Pitching Edge</h3>

              <p><strong>Starting Pitcher:</strong> {play.starting_pitcher || "N/A"}</p>
              <p><strong>ERA:</strong> {play.pitcher_era ?? "N/A"}</p>
              <p><strong>WHIP:</strong> {play.pitcher_whip ?? "N/A"}</p>
              <p><strong>Pitcher Rating:</strong> {play.pitcher_rating ?? "N/A"}</p>
              <p><strong>Opponent:</strong> {play.opponent || "N/A"}</p>
              <p><strong>Opponent Pitcher Rating:</strong> {play.opponent_pitcher_rating ?? "N/A"}</p>
              <p><strong>Pitcher Rating Differential:</strong> {play.pitcher_rating_diff ?? "N/A"}</p>

              <hr style={{ borderColor: "#374151", margin: "20px 0" }} />

              <h3>Market + Environment</h3>

              <p><strong>Implied Probability:</strong> {play.implied_probability}%</p>
              <p><strong>Model Probability:</strong> {play.model_probability}%</p>
              <p><strong>Pitcher Adjustment:</strong> {play.pitcher_diff_adjustment ?? "N/A"}</p>
              <p><strong>Weather Adjustment:</strong> {play.weather_adjustment ?? "N/A"}</p>
              <p><strong>Ballpark:</strong> {play.ballpark || "N/A"}</p>
              <p><strong>Weather Risk:</strong> {play.weather_risk || "N/A"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MLBF5ModelPage;
