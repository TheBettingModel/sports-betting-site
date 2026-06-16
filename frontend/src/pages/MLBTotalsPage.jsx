import { useEffect, useMemo, useState } from "react";
import MLBTabs from "../components/MLBTabs";

function MLBTotalsPage() {
  const [plays, setPlays] = useState([]);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    setError("");

    fetch(`${API_URL}/model/mlb/today`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data.plays)) {
          setPlays(data.plays);
        } else {
          setError(data.error || "Failed to load MLB totals model.");
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;

        console.error("MLB totals fetch error:", err);
        setError("Failed to load MLB totals model.");
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [API_URL]);

  const sortedPlays = useMemo(() => {
    return [...plays].sort((a, b) => (b.edge || 0) - (a.edge || 0));
  }, [plays]);

  const totalPlays = useMemo(() => {
    return sortedPlays.filter((play) => play.market === "Total");
  }, [sortedPlays]);

  const topTotal = totalPlays[0];

  const getBadgeColor = (recommendation) => {
    if (recommendation === "Play") return "#16a34a";
    if (recommendation === "Lean") return "#f59e0b";
    return "#6b7280";
  };

  const renderCard = (play, index, label = null, featured = false) => (
    <div
      key={`${play.game}-${play.pick}-${index}`}
      style={{
        backgroundColor: "#111827",
        border: featured ? "2px solid #22c55e" : "1px solid #374151",
        borderRadius: "16px",
        padding: "24px",
        boxShadow: featured ? "0 0 18px rgba(34, 197, 94, 0.35)" : "none",
      }}
    >
      {label && (
        <div
          style={{
            backgroundColor: "#22c55e",
            color: "black",
            padding: "6px 10px",
            borderRadius: "8px",
            display: "inline-block",
            marginBottom: "16px",
            fontWeight: "bold",
            fontSize: "14px",
          }}
        >
          {label}
        </div>
      )}

      <h2 style={{ fontSize: "24px", marginBottom: "8px" }}>
        {play.game}
      </h2>

      <h3
        style={{
          fontSize: "20px",
          color: "#facc15",
          marginBottom: "12px",
        }}
      >
        {play.pick}
      </h3>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        <span style={badgeStyle}>Market: {play.market}</span>
        <span style={badgeStyle}>Odds: {play.odds}</span>
        <span style={badgeStyle}>Edge: {play.edge}%</span>
        <span style={badgeStyle}>Confidence: {play.confidence}</span>
        <span style={badgeStyle}>Units: {play.units}</span>
        <span style={badgeStyle}>Best Book: {play.best_sportsbook || "N/A"}</span>
        <span style={badgeStyle}>Best Odds: {play.best_odds || "N/A"}</span>

        <span
          style={{
            ...badgeStyle,
            backgroundColor: getBadgeColor(play.recommendation),
            color: "white",
          }}
        >
          {play.recommendation}
        </span>
      </div>

      <div style={signalGridStyle}>
        <div>
          <h4>🌦️ Weather / Park</h4>
          <p>Weather: {play.weather_risk}</p>
          <p>Park: {play.ballpark}</p>
          <p>Weather Adj: {play.weather_adjustment}</p>
        </div>

        <div>
          <h4>🔥 Offense</h4>
          <p>Lineup: {play.lineup_status}</p>
          <p>Power: {play.statcast_power_rating}</p>
          <p>BVP: {play.bvp_signal}</p>
        </div>

        <div>
          <h4>⚾ Pitching / Bullpen</h4>
          <p>Starter Diff: {play.pitcher_rating_diff}</p>
          <p>Bullpen: {play.high_leverage_risk}</p>
          <p>Fatigue: {play.bullpen_fatigue}</p>
        </div>

        <div>
          <h4>📈 Market</h4>
          <p>Sharp: {play.sharp_signal}</p>
          <p>CLV: {play.clv_status}</p>
          <p>Steam: {play.steam_strength}</p>
        </div>
      </div>

      <p
        style={{
          color: "#d1d5db",
          lineHeight: "1.6",
        }}
      >
        {play.reason || "No model reason available."}
      </p>
    </div>
  );

  return (
    <div
      style={{
        padding: "30px",
        backgroundColor: "#0b0b0b",
        minHeight: "100vh",
        color: "white",
      }}
    >
      <h1
        style={{
          marginBottom: "10px",
          fontSize: "38px",
        }}
      >
        MLB Totals Model
      </h1>

      <MLBTabs />

      <p
        style={{
          color: "#9ca3af",
          marginBottom: "30px",
          maxWidth: "850px",
          lineHeight: "1.6",
        }}
      >
        MLB totals model using weather, park factors, lineup strength,
        Statcast power, pitcher quality, bullpen fatigue, and market movement.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : totalPlays.length === 0 ? (
        <p>No MLB totals plays available.</p>
      ) : (
        <>
          {topTotal && (
            <section style={{ marginBottom: "45px" }}>
              <h2
                style={{
                  marginBottom: "18px",
                  fontSize: "30px",
                }}
              >
                Top Totals Play
              </h2>

              {renderCard(
                topTotal,
                0,
                "Top Totals Play",
                true
              )}
            </section>
          )}

          <section>
            <h2
              style={{
                marginBottom: "18px",
                fontSize: "30px",
              }}
            >
              Totals Plays
            </h2>

            <div
              style={{
                display: "grid",
                gap: "24px",
              }}
            >
              {totalPlays.map((play, index) =>
                renderCard(
                  play,
                  index,
                  index < 3 ? "Top Play" : null
                )
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const badgeStyle = {
  backgroundColor: "#1f2937",
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

export default MLBTotalsPage;
