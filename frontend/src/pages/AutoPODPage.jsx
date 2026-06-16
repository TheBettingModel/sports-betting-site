import { useEffect, useState } from "react";

function AutoPODPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    fetch(`${API_URL}/model/play-of-the-day`)
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

  const overallPod = data?.overall_pod;
  const mlbPod = data?.mlb_pod;
  const nbaPod = data?.nba_pod;

  const getQuickReason = (play) => {
    if (!play) return "No qualified play available.";

    if (play.market_timing_signal) {
      return `${play.market_timing_signal} — ${play.sharp_signal || "Model value"} with ${play.clv_status || "neutral CLV"}.`;
    }

    return play.sharp_reason || play.reason || "Model-qualified play.";
  };

  const renderPodCard = (title, emoji, play, featured = false) => {
    if (!play) {
      return (
        <section style={featured ? featuredCardStyle : podCardStyle}>
          <div style={labelStyle}>{emoji} {title}</div>
          <h2>No Qualified POD</h2>
          <p style={mutedTextStyle}>No play met the model threshold today.</p>
        </section>
      );
    }

    return (
      <section style={featured ? featuredCardStyle : podCardStyle}>
        <div style={labelStyle}>{emoji} {title}</div>

        <h2 style={{ marginBottom: "8px" }}>{play.pick || play.recommendation}</h2>

        <p style={gameStyle}>{play.game}</p>

        <div style={badgeWrapStyle}>
          <span style={badgeStyle}>{play.market || "N/A"}</span>
          <span style={badgeStyle}>Odds: {play.best_odds || play.odds || "N/A"}</span>
          <span style={badgeStyle}>Units: {play.units ?? "N/A"}</span>
          <span style={badgeStyle}>Confidence: {play.confidence ?? "N/A"}</span>
          <span style={badgeStyle}>{play.market_timing_signal || "Timing N/A"}</span>
        </div>

        <p style={reasonStyle}>{getQuickReason(play)}</p>

        <div style={smallMetaStyle}>
          <span>Book: {play.best_sportsbook || play.sportsbook || "N/A"}</span>
          <span>Score: {play.auto_pod_score ?? "N/A"}</span>
        </div>
      </section>
    );
  };

  return (
    <div style={pageStyle}>
      <h1>🔥 Auto Play of the Day</h1>

      <p style={subtitleStyle}>
        Clean model-selected POD board showing the best overall play plus each sport’s top play.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : !data ? (
        <p>Loading Auto POD...</p>
      ) : (
        <>
          {renderPodCard("Overall POD", "🔥", overallPod, true)}

          <div style={gridStyle}>
            {renderPodCard("MLB POD", "⚾", mlbPod)}
            {renderPodCard("NBA POD", "🏀", nbaPod)}
          </div>
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
  maxWidth: "760px",
  lineHeight: "1.6",
  marginBottom: "28px",
};

const featuredCardStyle = {
  backgroundColor: "#111827",
  border: "2px solid #22c55e",
  boxShadow: "0 0 22px rgba(34, 197, 94, 0.3)",
  borderRadius: "18px",
  padding: "26px",
  marginBottom: "28px",
};

const podCardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "18px",
  padding: "24px",
};

const labelStyle = {
  backgroundColor: "#22c55e",
  color: "black",
  padding: "6px 10px",
  borderRadius: "999px",
  display: "inline-block",
  marginBottom: "14px",
  fontWeight: "bold",
  fontSize: "13px",
};

const gameStyle = {
  color: "#d1d5db",
  marginBottom: "16px",
  fontSize: "16px",
};

const badgeWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  marginBottom: "16px",
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

const reasonStyle = {
  color: "#d1d5db",
  lineHeight: "1.6",
  marginBottom: "16px",
};

const mutedTextStyle = {
  color: "#9ca3af",
};

const smallMetaStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "14px",
  color: "#9ca3af",
  fontSize: "13px",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "20px",
};

export default AutoPODPage;