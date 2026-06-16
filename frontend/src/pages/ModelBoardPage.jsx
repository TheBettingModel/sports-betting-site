import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

function MLBModelBoardPage() {
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
          setError(data.error || "Failed to load MLB model.");
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("MLB model fetch error:", err);
        setError("Failed to load MLB model.");
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

  const moneylinePlays = useMemo(() => {
    return sortedPlays.filter((play) => play.market === "Moneyline");
  }, [sortedPlays]);

  const topMoneyline = moneylinePlays[0];

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
      {label && <div style={labelStyle}>{label}</div>}

      <h2 style={{ marginBottom: "8px" }}>{play.game}</h2>

      <h3 style={{ color: "#facc15", marginBottom: "16px" }}>
        {play.pick}
      </h3>

      <div style={badgeWrapStyle}>
        <span style={badgeStyle}>Odds: {play.odds}</span>
        <span style={badgeStyle}>Edge: {play.edge}%</span>
        <span style={badgeStyle}>Confidence: {play.confidence}</span>
        <span style={badgeStyle}>Units: {play.units}</span>
        <span
          style={{
            ...badgeStyle,
            backgroundColor: getBadgeColor(play.recommendation),
          }}
        >
          {play.recommendation}
        </span>
      </div>

      <div style={miniGridStyle}>
        <div style={miniBoxStyle}>
          <strong>Sharp</strong>
          <p>{play.sharp_signal || "N/A"}</p>
        </div>

        <div style={miniBoxStyle}>
          <strong>CLV</strong>
          <p>{play.clv_status || "N/A"}</p>
        </div>

        <div style={miniBoxStyle}>
          <strong>Timing</strong>
          <p>{play.market_timing_signal || "N/A"}</p>
        </div>

        <div style={miniBoxStyle}>
          <strong>Best Book</strong>
          <p>{play.best_sportsbook || play.sportsbook || "N/A"}</p>
        </div>
      </div>

      <p style={reasonStyle}>
        {play.reason || play.sharp_reason || "No model reason available."}
      </p>
    </div>
  );

  return (
    <div style={pageStyle}>
      <h1 style={{ marginBottom: "10px", fontSize: "38px" }}>
        MLB Full Game Model
      </h1>

      <div style={tabContainerStyle}>
        <Link style={activeTabStyle} to="/mlb-model">
          Full Game
        </Link>

        <Link style={tabStyle} to="/mlb-runline">
          Run Line
        </Link>

        <Link style={tabStyle} to="/mlb-f5">
          F5
        </Link>

        <Link style={tabStyle} to="/mlb-nrfi">
          NRFI/YRFI
        </Link>

        <Link style={tabStyle} to="/mlb-totals">
          Totals
        </Link>
      </div>

      <p style={subtitleStyle}>
        Full game MLB model focused on moneyline value, pitcher edge, bullpen
        strength, lineup quality, Statcast signals, market movement, CLV, and
        weather/park adjustments.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : moneylinePlays.length === 0 ? (
        <p>No MLB moneyline plays available.</p>
      ) : (
        <>
          {topMoneyline &&
            renderCard(topMoneyline, 0, "Top MLB Moneyline", true)}

          <div style={gridStyle}>
            {moneylinePlays.slice(1).map((play, index) =>
              renderCard(play, index + 1)
            )}
          </div>
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

const subtitleStyle = {
  color: "#9ca3af",
  marginBottom: "30px",
  maxWidth: "850px",
  lineHeight: "1.6",
};

const tabContainerStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  marginBottom: "28px",
};

const tabStyle = {
  backgroundColor: "#1f2937",
  color: "white",
  textDecoration: "none",
  padding: "10px 16px",
  borderRadius: "999px",
  fontWeight: "bold",
  border: "1px solid #374151",
};

const activeTabStyle = {
  ...tabStyle,
  backgroundColor: "#22c55e",
  color: "black",
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
  marginBottom: "18px",
};

const badgeStyle = {
  backgroundColor: "#1f2937",
  border: "1px solid #374151",
  color: "white",
  padding: "8px 10px",
  borderRadius: "999px",
  fontSize: "14px",
  fontWeight: "bold",
};

const miniGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "12px",
  marginBottom: "18px",
};

const miniBoxStyle = {
  backgroundColor: "#020617",
  border: "1px solid #374151",
  borderRadius: "12px",
  padding: "12px",
};

const reasonStyle = {
  color: "#d1d5db",
  lineHeight: "1.6",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "20px",
  marginTop: "24px",
};

export default MLBModelBoardPage;