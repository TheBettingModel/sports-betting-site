import { useEffect, useState } from "react";

function AutoPODPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    fetch(`${API_URL}/model/mlb/play-of-the-day`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => {
        console.error("Auto POD fetch error:", err);
        setError("Failed to load Auto Play of the Day.");
      });
  }, [API_URL]);

  const pod = data?.play_of_the_day;
  const candidates = data?.candidates || [];

  return (
    <div style={pageStyle}>
      <h1>🔥 Auto Play of the Day</h1>

      <p style={subtitleStyle}>
        Model-ranked top play using edge, confidence, sharp signals, CLV,
        line shopping, and historical learning from Neon.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : !data ? (
        <p>Loading Auto POD...</p>
      ) : !pod ? (
        <p>{data.message || "No qualified Play of the Day available."}</p>
      ) : (
        <>
          <section style={podCardStyle}>
            <div style={labelStyle}>MLB Auto POD</div>

            <h2>{pod.game}</h2>

            <h3 style={pickStyle}>
              {pod.pick || pod.recommendation}
            </h3>

            <div style={badgeWrapStyle}>
              <span style={badgeStyle}>Market: {pod.market || "N/A"}</span>
              <span style={badgeStyle}>Odds: {pod.odds || "N/A"}</span>
              <span style={badgeStyle}>Edge: {pod.edge ?? "N/A"}%</span>
              <span style={badgeStyle}>Confidence: {pod.confidence ?? "N/A"}</span>
              <span style={badgeStyle}>Units: {pod.units ?? "N/A"}</span>
              <span style={badgeStyle}>POD Score: {pod.auto_pod_score}</span>
              <span style={badgeStyle}>Learning: {pod.learning_boost ?? 0}</span>
              <span style={badgeStyle}>Recommendation: {pod.recommendation}</span>
            </div>

            <div style={signalGridStyle}>
              <div>
                <h4>📈 Market</h4>
                <p>Sharp: {pod.sharp_signal || "N/A"}</p>
                <p>CLV: {pod.clv_status || "N/A"}</p>
                <p>Steam: {pod.steam_strength || "N/A"}</p>
              </div>

              <div>
                <h4>💰 Line Shopping</h4>
                <p>Best Book: {pod.best_sportsbook || pod.sportsbook || "N/A"}</p>
                <p>Best Odds: {pod.best_odds || pod.odds || "N/A"}</p>
                <p>Line Value: {pod.line_shop_value ?? "N/A"}</p>
              </div>

              <div>
                <h4>⚾ Matchup</h4>
                <p>Starter: {pod.starting_pitcher || "N/A"}</p>
                <p>BVP: {pod.bvp_signal || "N/A"}</p>
                <p>Lineup: {pod.lineup_status || "N/A"}</p>
              </div>

              <div>
                <h4>🧠 Learning</h4>
                <p>Boost: {pod.learning_boost ?? 0}</p>
                <p>Version: {data.model_version}</p>
                <p>Candidates: {data.count}</p>
              </div>
            </div>

            <p style={reasonStyle}>
              {pod.reason || pod.sharp_reason || "No model reason available."}
            </p>
          </section>

          <section>
            <h2>Top Candidates</h2>

            <div style={candidateGridStyle}>
              {candidates.map((play, index) => (
                <div key={`${play.game}-${play.pick}-${index}`} style={candidateCardStyle}>
                  <h3>#{index + 1}</h3>
                  <p><strong>{play.game}</strong></p>
                  <p>{play.pick || play.recommendation}</p>
                  <p>Market: {play.market || "N/A"}</p>
                  <p>Score: {play.auto_pod_score}</p>
                  <p>Learning: {play.learning_boost ?? 0}</p>
                  <p>Edge: {play.edge ?? "N/A"}%</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
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
  maxWidth: "850px",
  lineHeight: "1.6",
  marginBottom: "28px",
};

const podCardStyle = {
  backgroundColor: "#111827",
  border: "2px solid #22c55e",
  boxShadow: "0 0 22px rgba(34, 197, 94, 0.35)",
  borderRadius: "18px",
  padding: "26px",
  marginBottom: "36px",
};

const labelStyle = {
  backgroundColor: "#22c55e",
  color: "black",
  padding: "6px 10px",
  borderRadius: "8px",
  display: "inline-block",
  marginBottom: "16px",
  fontWeight: "bold",
};

const pickStyle = {
  color: "#facc15",
  fontSize: "24px",
  marginBottom: "16px",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
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

const candidateGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "18px",
};

const candidateCardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "14px",
  padding: "18px",
};

export default AutoPODPage;
