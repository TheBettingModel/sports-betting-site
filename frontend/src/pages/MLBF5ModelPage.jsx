import { useEffect, useMemo, useState } from "react";

function MLBF5ModelPage() {
  const [plays, setPlays] = useState([]);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    setError("");

    fetch(`${API_URL}/model/mlb/f5/today`, {
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
          setError(data.error || "Failed to load MLB F5 model.");
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("MLB F5 fetch error:", err);
        setError("Failed to load MLB F5 model.");
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

  const topF5 = sortedPlays[0];

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

      <h2 style={{ fontSize: "24px", marginBottom: "8px" }}>{play.game}</h2>

      <h3 style={{ fontSize: "20px", color: "#facc15", marginBottom: "12px" }}>
        {play.pick}
      </h3>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
        <span style={badgeStyle}>Market: {play.market}</span>
        <span style={badgeStyle}>Odds: {play.odds}</span>
        <span style={badgeStyle}>Edge: {play.edge}%</span>
        <span style={badgeStyle}>Confidence: {play.confidence}</span>
        <span style={badgeStyle}>Units: {play.units}</span>
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
      <h1 style={{ marginBottom: "10px", fontSize: "38px" }}>MLB F5 Model</h1>

      <p
        style={{
          color: "#9ca3af",
          marginBottom: "30px",
          maxWidth: "850px",
          lineHeight: "1.6",
        }}
      >
        First 5 innings model focused on starting pitching, Statcast pitching,
        early-game pricing, lineup strength, weather, and market edge.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : sortedPlays.length === 0 ? (
        <p>No MLB F5 plays available.</p>
      ) : (
        <>
          {topF5 && (
            <section style={{ marginBottom: "45px" }}>
              <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>
                Top F5 Play
              </h2>

              {renderCard(topF5, 0, "Top F5 Play", true)}
            </section>
          )}

          <section>
            <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>
              F5 Plays
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

export default MLBF5ModelPage;