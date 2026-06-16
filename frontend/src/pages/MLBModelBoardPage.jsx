import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

function MLBModelBoardPage() {
  const [plays, setPlays] = useState([]);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    fetch(`${API_URL}/model/mlb/today`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.plays)) {
          setPlays(data.plays);
        } else {
          setError("Failed to load MLB model.");
        }
      })
      .catch(() => {
        setError("Failed to load MLB model.");
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [API_URL]);

  const sortedPlays = useMemo(() => {
    return [...plays].sort(
      (a, b) => (b.edge || 0) - (a.edge || 0)
    );
  }, [plays]);

  const moneylinePlays = sortedPlays.filter(
    (play) => play.market === "Moneyline"
  );

  const topPlay = moneylinePlays[0];

  const renderCard = (play, index, featured = false) => (
    <div
      key={`${play.game}-${play.pick}-${index}`}
      style={{
        backgroundColor: "#111827",
        border: featured
          ? "2px solid #22c55e"
          : "1px solid #374151",
        borderRadius: "16px",
        padding: "24px",
      }}
    >
      {featured && (
        <div style={labelStyle}>
          Top Moneyline Play
        </div>
      )}

      <h2>{play.game}</h2>

      <h3 style={{ color: "#facc15" }}>
        {play.pick}
      </h3>

      <div style={badgeWrapStyle}>
        <span style={badgeStyle}>Odds: {play.odds}</span>
        <span style={badgeStyle}>Edge: {play.edge}%</span>
        <span style={badgeStyle}>
          Confidence: {play.confidence}
        </span>
        <span style={badgeStyle}>
          Units: {play.units}
        </span>
        <span style={badgeStyle}>
          {play.recommendation}
        </span>
      </div>

      <div style={signalGridStyle}>
        <div>
          <h4>📈 Market</h4>
          <p>Sharp: {play.sharp_signal}</p>
          <p>CLV: {play.clv_status}</p>
        </div>

        <div>
          <h4>⚾ Pitching</h4>
          <p>{play.starting_pitcher}</p>
          <p>Rating: {play.pitcher_rating}</p>
        </div>

        <div>
          <h4>🔥 Offense</h4>
          <p>{play.lineup_status}</p>
          <p>BVP: {play.bvp_signal}</p>
        </div>

        <div>
          <h4>⚠️ Risk</h4>
          <p>{play.weather_risk}</p>
          <p>{play.high_leverage_risk}</p>
        </div>
      </div>

      <p style={reasonStyle}>
        {play.reason || "No model reason available."}
      </p>
    </div>
  );

  return (
    <div style={pageStyle}>

      <h1 style={{ fontSize: "38px" }}>
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
        MLB model powered by pitching, bullpen,
        Statcast, lineup quality, weather,
        sharp action, CLV, and market movement.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>
          {error}
        </p>
      ) : (
        <>
          {topPlay &&
            renderCard(topPlay, 0, true)
          }

          <div style={gridStyle}>
            {moneylinePlays.slice(1).map(
              (play, index) =>
                renderCard(play, index)
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
  border: "1px solid #374151",
  fontWeight: "bold",
};

const activeTabStyle = {
  ...tabStyle,
  backgroundColor: "#22c55e",
  color: "black",
};

const labelStyle = {
  backgroundColor: "#22c55e",
  color: "black",
  padding: "8px",
  borderRadius: "8px",
  display: "inline-block",
};

const badgeWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
};

const badgeStyle = {
  backgroundColor: "#1f2937",
  padding: "8px 10px",
  borderRadius: "999px",
};

const signalGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(180px,1fr))",
  gap: "16px",
  marginTop: "20px",
};

const reasonStyle = {
  color: "#d1d5db",
  lineHeight: "1.6",
};

const gridStyle = {
  display: "grid",
  gap: "24px",
  marginTop: "30px",
};

export default MLBModelBoardPage;
