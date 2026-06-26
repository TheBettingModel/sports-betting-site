import { useEffect, useMemo, useState } from "react";
import NCAAFTabs from "../components/NCAAFTabs";

function NCAAFModelPage({ marketFilter = "All", title = "NCAA Football Moneyline Model" }) {
  const [plays, setPlays] = useState([]);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    setError("");

    fetch(`${API_URL}/model/ncaaf/today`, {
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
          setError(data.error || "Failed to load NCAA Football model.");
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("NCAA Football model fetch error:", err);
        setError("Failed to load NCAA Football model.");
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
    if (marketFilter === "All") return sortedPlays;

    return sortedPlays.filter((play) => play.market === marketFilter);
  }, [sortedPlays, marketFilter]);

  const topPlay = filteredPlays[0];

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

      <h2 style={{ fontSize: "24px", marginBottom: "8px" }}>
        {play.game}
      </h2>

      <h3 style={{ fontSize: "20px", color: "#facc15", marginBottom: "12px" }}>
        {play.pick}
      </h3>

      <div style={badgeWrapStyle}>
        <span style={badgeStyle}>Market: {play.market || "N/A"}</span>
        <span style={badgeStyle}>Odds: {play.odds || "N/A"}</span>
        <span style={badgeStyle}>Edge: {play.edge ?? "N/A"}%</span>
        <span style={badgeStyle}>Confidence: {play.confidence ?? "N/A"}</span>
        <span style={badgeStyle}>Units: {play.units ?? "N/A"}</span>
        <span style={badgeStyle}>POD Score: {play.auto_pod_score ?? "N/A"}</span>

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
          <h4>🏈 Power Ratings</h4>
          <p>Team: {play.team_rating ?? "N/A"}</p>
          <p>Opponent: {play.opponent_rating ?? "N/A"}</p>
          <p>Diff: {play.rating_diff ?? "N/A"}</p>
        </div>

        <div>
          <h4>🏟️ Situation</h4>
          <p>Home Field: {play.home_field_adjustment ?? "N/A"}</p>
          <p>Conference: {play.conference_adjustment ?? "N/A"}</p>
          <p>QB: {play.qb_adjustment ?? "N/A"}</p>
          <p>Explosive: {play.explosiveness_adjustment ?? "N/A"}</p>
          <p>Price Adj: {play.price_adjustment ?? "N/A"}</p>
          <p>Version: {play.model_version || "N/A"}</p>
        </div>

        <div>
          <h4>📚 Book</h4>
          <p>Book: {play.sportsbook || "N/A"}</p>
          <p>Sharp Book: {play.sharp_book_signal || "N/A"}</p>
          <p>Score: {play.sharp_book_score ?? "N/A"}</p>
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
        {title}
      </h1>

      <NCAAFTabs />

      <p style={subtitleStyle}>
        NCAA Football model powered by market odds, team ratings, home-field adjustment,
        sharp signals, CLV, sportsbook weighting, and market timing.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : filteredPlays.length === 0 ? (
        <p>No NCAA Football plays available right now.</p>
      ) : (
        <>
          {topPlay && (
            <section style={{ marginBottom: "45px" }}>
              <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>
                Top NCAA Football Play
              </h2>
              {renderCard(topPlay, 0, "Top NCAA Football Play", true)}
            </section>
          )}

          <section>
            <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>
              NCAA Football Plays
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

export default NCAAFModelPage;
