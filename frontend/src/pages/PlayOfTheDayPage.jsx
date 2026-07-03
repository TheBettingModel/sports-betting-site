import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
}

function PlayOfTheDayPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/homepage`)
      .then((response) => response.json())
      .then((homepage) => {
        if (homepage.play_of_the_day) {
          setData(homepage);
        } else {
          setError(homepage.message || homepage.error || "No play of the day found.");
        }
      })
      .catch(() => setError("Could not load play of the day."));
  }, []);

  const pick = data?.play_of_the_day;

  const bestBySport = (() => {
    const raw = data?.best_by_sport || data?.by_sport || {};
    const cleaned = { ...raw };

    // Play of the Day is the single source of truth.
    // If POD is Soccer, the Soccer best-play card must match it.
    if (pick?.sport) {
      cleaned[pick.sport] = pick;
    }

    if (pick?.pod_sport) {
      cleaned[pick.pod_sport] = pick;
    }

    return cleaned;
  })();

  return (
    <div style={pageStyle}>
      <h1 style={{ fontSize: "38px", marginBottom: "10px" }}>Play of the Day</h1>

      <p style={subtitleStyle}>
        The official Play of the Day dashboard uses the same Homepage Data Engine as the public
        homepage, so the flagship play and best-by-sport cards stay consistent.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : !pick ? (
        <p>Loading play of the day...</p>
      ) : (
        <>
          <section style={podCardStyle}>
            <div style={labelStyle}>Official POD</div>

            <h2 style={{ fontSize: "30px", marginBottom: "8px" }}>{pick.game}</h2>
            <h3 style={{ fontSize: "24px", color: "#facc15", marginBottom: "18px" }}>
              {pick.pick} {formatOdds(pick.best_odds ?? pick.odds)}
            </h3>

            <div style={badgeWrapStyle}>
              <span style={badgeStyle}>Sport: {pick.sport || pick.pod_sport || "N/A"}</span>
              <span style={badgeStyle}>Market: {pick.market || "N/A"}</span>
              <span style={badgeStyle}>Book: {pick.best_sportsbook || pick.sportsbook || "N/A"}</span>
              <span style={badgeStyle}>Edge: {pick.edge ?? "N/A"}%</span>
              <span style={badgeStyle}>Confidence: {pick.confidence ?? "N/A"}</span>
              <span style={badgeStyle}>Units: {pick.units ?? "N/A"}</span>
              <span style={badgeStyle}>POD Score: {pick.universal_pod_score ?? "N/A"}</span>
              <span style={{ ...badgeStyle, backgroundColor: "#16a34a" }}>
                {pick.final_recommendation || pick.recommendation || "Model Play"}
              </span>
            </div>

            <div style={signalGridStyle}>
              <div>
                <h4>📈 Market</h4>
                <p>Market Grade: {pick.market_intelligence_grade || "N/A"}</p>
                <p>Sharp: {pick.sharp_signal || "N/A"}</p>
                <p>CLV: {pick.clv_status || "N/A"}</p>
              </div>

              <div>
                <h4>⭐ Rating</h4>
                <p>Tier: {pick.final_model_tier || pick.tier || "N/A"}</p>
                <p>Stars: {pick.final_stars ? `${pick.final_stars}/5` : "N/A"}</p>
                <p>Score: {pick.final_model_score ?? "N/A"}</p>
              </div>

              <div>
                <h4>💰 Sportsbook</h4>
                <p>Best Book: {pick.best_sportsbook || pick.sportsbook || "N/A"}</p>
                <p>Best Odds: {formatOdds(pick.best_odds ?? pick.odds)}</p>
                <p>Line Value: {pick.line_shop_value ?? "N/A"}</p>
              </div>
            </div>

            <p style={reasonStyle}>{pick.reason || "No model reason available."}</p>
          </section>

          <section style={{ marginTop: "42px" }}>
            <h2 style={{ marginBottom: "18px", fontSize: "28px" }}>Best Play By Sport</h2>

            <div style={sportGridStyle}>
              {Object.entries(bestBySport).map(([sport, play]) => (
                <div key={sport} style={sportCardStyle}>
                  <div style={labelStyle}>{sport}</div>
                  <h3 style={{ color: "#facc15" }}>{play.pick}</h3>
                  <p>{play.game}</p>
                  <div style={badgeWrapStyle}>
                    <span style={badgeStyle}>{play.market || "N/A"}</span>
                    <span style={badgeStyle}>{formatOdds(play.best_odds ?? play.odds)}</span>
                    <span style={badgeStyle}>POD {play.universal_pod_score ?? "N/A"}</span>
                    <span style={badgeStyle}>{play.final_recommendation || play.recommendation || "N/A"}</span>
                  </div>
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
  padding: "30px",
  backgroundColor: "#0b0b0b",
  minHeight: "100vh",
  color: "white",
};

const subtitleStyle = {
  color: "#9ca3af",
  marginBottom: "30px",
  maxWidth: "900px",
  lineHeight: "1.6",
};

const podCardStyle = {
  backgroundColor: "#111827",
  border: "2px solid #22c55e",
  borderRadius: "16px",
  padding: "24px",
  boxShadow: "0 0 18px rgba(34,197,94,.35)",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
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

const sportGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "18px",
};

const sportCardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "18px",
};

export default PlayOfTheDayPage;
