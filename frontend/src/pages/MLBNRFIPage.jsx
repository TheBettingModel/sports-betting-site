import { useEffect, useMemo, useState } from "react";

function MLBNRFIPage() {
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
    fetch(`${API_URL}/model/mlb/nrfi/today`)
      .then((res) => res.json())
      .then((data) => {
        if (data.plays) setPlays(data.plays);
        else setError("Failed to load MLB NRFI/YRFI model.");
      })
      .catch(() => setError("Failed to load MLB NRFI/YRFI model."));
  }, [API_URL]);

  const sortedPlays = useMemo(() => {
    return [...plays].sort((a, b) => {
      return (b.confidence || 0) - (a.confidence || 0);
    });
  }, [plays]);

  return (
    <div
      style={{
        padding: "30px",
        backgroundColor: "#0b0b0b",
        minHeight: "100vh",
        color: "white",
      }}
    >
      <h1 style={{ marginBottom: "10px", fontSize: "38px" }}>
        MLB NRFI / YRFI Model
      </h1>

      <p
        style={{
          color: "#9ca3af",
          marginBottom: "30px",
          maxWidth: "850px",
          lineHeight: "1.6",
        }}
      >
        First inning model focused on projected starters, pitcher ratings,
        weather, ballpark environment, and early scoring probability.
      </p>

      {error ? (
        <p>{error}</p>
      ) : sortedPlays.length === 0 ? (
        <p>No NRFI/YRFI plays available.</p>
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
                boxShadow:
                  index < 3 ? "0 0 15px rgba(225, 6, 0, 0.35)" : "none",
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
                  Top NRFI/YRFI Signal
                </div>
              )}

              <p
                style={{
                  color: "#9ca3af",
                  fontSize: "14px",
                  marginBottom: "6px",
                }}
              >
                First Inning Market
              </p>

              <h2>{play.game}</h2>

              <h1
                style={{
                  color:
                    play.recommendation === "NRFI"
                      ? "#22c55e"
                      : play.recommendation === "YRFI"
                      ? "#f97316"
                      : "#d1d5db",
                  fontSize: "30px",
                }}
              >
                {play.recommendation}
              </h1>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                  marginBottom: "18px",
                }}
              >
                <span style={badgeStyle}>
                  Confidence: {play.confidence}%
                </span>

                <span style={badgeStyle}>
                  NRFI: {play.nrfi_probability}%
                </span>

                <span style={badgeStyle}>
                  YRFI: {play.yrfi_probability}%
                </span>

                <span style={badgeStyle}>
                  Combined Pitcher Rating: {play.combined_pitcher_rating}
                </span>
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

                <p style={{ color: "#d1d5db", lineHeight: "1.7" }}>
                  {play.reason}
                </p>
              </div>

              <h3>Projected Starters</h3>

              <p>
                <strong>Away Starter:</strong> {play.away_starter || "N/A"}
              </p>

              <p>
                <strong>Away Pitcher Rating:</strong>{" "}
                {play.away_pitcher_rating ?? "N/A"}
              </p>

              <p>
                <strong>Home Starter:</strong> {play.home_starter || "N/A"}
              </p>

              <p>
                <strong>Home Pitcher Rating:</strong>{" "}
                {play.home_pitcher_rating ?? "N/A"}
              </p>

              <hr style={{ borderColor: "#374151", margin: "20px 0" }} />

              <h3>Environment</h3>

              <p>
                <strong>Ballpark:</strong> {play.ballpark || "N/A"}
              </p>

              <p>
                <strong>Weather Risk:</strong> {play.weather_risk || "N/A"}
              </p>

              <p>
                <strong>Weather Adjustment:</strong>{" "}
                {play.weather_adjustment ?? "N/A"}
              </p>

              <p>
                <strong>Model Version:</strong>{" "}
                {play.model_version || "N/A"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MLBNRFIPage;
