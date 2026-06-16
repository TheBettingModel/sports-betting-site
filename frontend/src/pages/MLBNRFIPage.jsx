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
    return [...plays].sort((a, b) => {
      return (parseFloat(b.edge) || 0) - (parseFloat(a.edge) || 0);
    });
  }, [plays]);

  const filteredPlays = useMemo(() => {
    return sortedPlays.filter((play) => true);
  }, [sortedPlays]);

  const topPlay = filteredPlays[0];

  const getBadgeColor = (recommendation) => {
    if (recommendation === "Play") return "#16a34a";
    if (recommendation === "Lean") return "#f59e0b";
    return "#6b7280";
  };

  const renderCard = (play, index, label = null, featured = false) => (
    <div
      key={`${play.game}-${play.pick || play.recommendation}-${index}`}
      style={{
        backgroundColor: "#111827",
        border: featured ? "2px solid #22c55e" : "1px solid #374151",
        borderRadius: "16px",
        padding: "24px",
        boxShadow: featured ? "0 0 18px rgba(34, 197, 94, 0.35)" : "none",
      }}
    >
      {label && <div style={labelStyle}>{label}</div>}

      <h2 style={{ fontSize: "24px", marginBottom: "8px" }}>
        {play.game}
      </h2>

      <h3 style={{ fontSize: "20px", color: "#facc15", marginBottom: "12px" }}>
        {play.pick || play.recommendation}
      </h3>

      <div style={badgeWrapStyle}>
        <span style={badgeStyle}>Market: {play.market || "N/A"}</span>
        <span style={badgeStyle}>Odds: {play.odds || "N/A"}</span>
        <span style={badgeStyle}>Edge: {play.edge ?? "N/A"}%</span>
        <span style={badgeStyle}>Confidence: {play.confidence ?? "N/A"}</span>
        <span style={badgeStyle}>Units: {play.units ?? "N/A"}</span>
        <span style={badgeStyle}>
          Best Book: {play.best_sportsbook || play.sportsbook || "N/A"}
        </span>

        <span
          style={{
            ...badgeStyle,
            backgroundColor: getBadgeColor(play.recommendation),
          }}
        >
          {play.recommendation || "N/A"}
        </span>
      </div>

      <div style={signalGridStyle}>
        <div>
          <h4>📈 Market</h4>
          <p>Sharp: {play.sharp_signal || "N/A"}</p>
          <p>CLV: {play.clv_status || "N/A"}</p>
          <p>Timing: {play.market_timing_signal || "N/A"}</p>
        </div>

        <div>
          <h4>⚾ Pitching</h4>
          <p>Starter: {play.starting_pitcher || play.away_starter || "N/A"}</p>
          <p>Rating: {play.pitcher_rating || play.combined_pitcher_rating || "N/A"}</p>
          <p>Diff: {play.pitcher_rating_diff || "N/A"}</p>
        </div>

        <div>
          <h4>🔥 Offense</h4>
          <p>BVP: {play.bvp_signal || "N/A"}</p>
          <p>Lineup: {play.lineup_status || "N/A"}</p>
          <p>Power: {play.statcast_power_rating || "N/A"}</p>
        </div>

        <div>
          <h4>⚠️ Risk</h4>
          <p>Bullpen: {play.high_leverage_risk || play.bullpen_status || "N/A"}</p>
          <p>Weather: {play.weather_risk || "N/A"}</p>
          <p>Park: {play.ballpark || "N/A"}</p>
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
        MLB NRFI/YRFI Model
      </h1>

      <MLBTabs />

      <p style={subtitleStyle}>
        MLB model powered by pitching, bullpen, lineup quality, Statcast,
        weather, sharp action, CLV, sportsbook comparison, and market timing.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : filteredPlays.length === 0 ? (
        <p>No MLB NRFI/YRFI plays available.</p>
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
              Plays
            </h2>

            <div style={{ display: "grid", gap: "24px" }}>
              {filteredPlays.map((play, index) =>
                renderCard(play, index, index < 3 ? "Top Play" : null)
              )}
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

const subtitleStyle = {
  color: "#9ca3af",
  marginBottom: "30px",
  maxWidth: "850px",
  lineHeight: "1.6",
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

const reasonStyle = {
  color: "#d1d5db",
  lineHeight: "1.6",
};

export default MLBNRFIPage;
