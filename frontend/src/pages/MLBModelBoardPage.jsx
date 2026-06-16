import { useEffect, useMemo, useState } from "react";
import MLBTabs from "../components/MLBTabs";

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

      <MLBTabs />

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

export default MLBModelBoardPage;
