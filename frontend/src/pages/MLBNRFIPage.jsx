import { useEffect, useMemo, useState } from "react";
import MLBTabs from "../components/MLBTabs";

function MLBNRFIPage() {
  const [plays, setPlays] = useState([]);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    setError("");

    fetch(`${API_URL}/model/mlb/nrfi/today`, {
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
          setError(data.error || "Failed to load MLB NRFI/YRFI model.");
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("MLB NRFI/YRFI fetch error:", err);
        setError("Failed to load MLB NRFI/YRFI model.");
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [API_URL]);

  const sortedPlays = useMemo(() => {
    return [...plays].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }, [plays]);

  const topPlay = sortedPlays[0];

  const getBadgeColor = (recommendation) => {
    if (recommendation === "NRFI") return "#16a34a";
    if (recommendation === "YRFI") return "#2563eb";
    if (recommendation === "Play") return "#16a34a";
    if (recommendation === "Lean") return "#f59e0b";
    return "#6b7280";
  };

  const renderCard = (play, index, label = null, featured = false) => (
    <div
      key={`${play.game}-${play.recommendation}-${index}`}
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

      <h2 style={{ fontSize: "24px", marginBottom: "8px" }}>{play.game}</h2>

      <h3 style={{ fontSize: "20px", color: "#facc15", marginBottom: "12px" }}>
        {play.recommendation}
      </h3>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "20px" }}>
        <span style={badgeStyle}>Confidence: {play.confidence}</span>
        <span style={badgeStyle}>NRFI: {play.nrfi_probability}%</span>
        <span style={badgeStyle}>YRFI: {play.yrfi_probability}%</span>
        <span style={badgeStyle}>Pitcher Rating: {play.combined_pitcher_rating}</span>
        <span style={badgeStyle}>Lineup Strength: {play.combined_lineup_strength}</span>

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
          <h4>⚾ Starting Pitchers</h4>
          <p>Away: {play.away_starter || "N/A"}</p>
          <p>Home: {play.home_starter || "N/A"}</p>
          <p>Combined: {play.combined_pitcher_rating}</p>
        </div>

        <div>
          <h4>🔥 First Inning Offense</h4>
          <p>Lineups: {play.combined_lineup_strength}</p>
          <p>Top Order: {play.top_order_strength || "N/A"}</p>
          <p>Hitting: {play.combined_hitting_rating || "N/A"}</p>
        </div>

        <div>
          <h4>🌦️ Environment</h4>
          <p>Weather: {play.weather_risk || "N/A"}</p>
          <p>Park: {play.ballpark || "N/A"}</p>
          <p>Umpire: {play.umpire_signal || "N/A"}</p>
        </div>

        <div>
          <h4>📊 Model Read</h4>
          <p>NRFI: {play.nrfi_probability}%</p>
          <p>YRFI: {play.yrfi_probability}%</p>
          <p>Lean: {play.recommendation}</p>
        </div>
      </div>

      <p style={{ color: "#d1d5db", lineHeight: "1.6" }}>
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
      <h1 style={{ marginBottom: "10px", fontSize: "38px" }}>
        MLB NRFI / YRFI Model
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
        First inning model focused on starting pitchers, Statcast pitching,
        lineup strength, hitting quality, weather, ballpark, and umpire factors.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : sortedPlays.length === 0 ? (
        <p>No NRFI/YRFI plays available.</p>
      ) : (
        <>
          {topPlay && (
            <section style={{ marginBottom: "45px" }}>
              <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>
                Top NRFI/YRFI Play
              </h2>

              {renderCard(topPlay, 0, "Top NRFI/YRFI Play", true)}
            </section>
          )}

          <section>
            <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>
              NRFI/YRFI Plays
            </h2>

            <div style={{ display: "grid", gap: "24px" }}>
              {sortedPlays.map((play, index) =>
                renderCard(play, index, index < 3 ? "Top Play" : null)
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

export default MLBNRFIPage;
