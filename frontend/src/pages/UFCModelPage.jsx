import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
}

function badgeColor(recommendation) {
  const rec = String(recommendation || "").toLowerCase();
  if (rec.includes("elite") || rec.includes("play")) return "#16a34a";
  if (rec.includes("lean")) return "#ca8a04";
  return "#6b7280";
}

function Stat({ label, value, accent = false }) {
  return (
    <div style={statStyle}>
      <span style={statLabelStyle}>{label}</span>
      <strong style={{ color: accent ? "#22c55e" : "white" }}>{value ?? "N/A"}</strong>
    </div>
  );
}

function UFCModelPage() {
  const [plays, setPlays] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    fetch(`${API_URL}/model/ufc/today`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data.plays)) setPlays(data.plays);
        else setError(data.error || "No UFC plays available.");
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("UFC model fetch error:", err);
        setError("Failed to load UFC model.");
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const sortedPlays = useMemo(() => {
    return [...plays].sort((a, b) => {
      return (
        (Number(b.universal_pod_score) || 0) -
          (Number(a.universal_pod_score) || 0) ||
        (Number(b.edge) || 0) - (Number(a.edge) || 0)
      );
    });
  }, [plays]);

  const topPlay = sortedPlays[0];

  const renderCard = (play, index, featured = false) => {
    const recommendation = play.final_recommendation || play.recommendation || "N/A";

    return (
      <div
        key={`${play.game}-${play.pick}-${index}`}
        style={{
          ...cardStyle,
          border: featured ? "2px solid #22c55e" : "1px solid #374151",
          boxShadow: featured ? "0 0 20px rgba(34,197,94,.35)" : "none",
        }}
      >
        {featured && <div style={labelStyle}>Top UFC Model Play</div>}

        <div style={cardTopStyle}>
          <div>
            <h2 style={{ marginBottom: "8px" }}>{play.game}</h2>
            <h3 style={pickStyle}>
              {play.pick} {formatOdds(play.best_odds ?? play.odds)}
            </h3>
          </div>

          <div style={scoreBoxStyle}>
            <span>POD</span>
            <strong>{Number(play.universal_pod_score || 0).toFixed(2)}</strong>
          </div>
        </div>

        <div style={badgeWrapStyle}>
          <span style={badgeStyle}>🥊 {play.market || "Moneyline"}</span>
          <span style={badgeStyle}>Book: {play.best_sportsbook || play.sportsbook || "N/A"}</span>
          <span style={badgeStyle}>Edge: {play.edge ?? "N/A"}%</span>
          <span style={badgeStyle}>Confidence: {play.confidence ?? "N/A"}</span>
          <span style={badgeStyle}>Units: {play.units ?? "N/A"}</span>
          <span style={{ ...badgeStyle, backgroundColor: badgeColor(recommendation) }}>
            {recommendation}
          </span>
          <span style={badgeStyle}>{play.model_version || "ufc_v2_pro_analytics_engine"}</span>
        </div>

        <div style={heroGridStyle}>
          <Stat label="Style Matchup" value={play.ufc_style_matchup} accent />
          <Stat label="Overall Diff" value={play.ufc_overall_diff ?? play.ufc_rating_diff} accent />
          <Stat label="V2 Adjustment" value={play.ufc_v2_adjustment} accent />
          <Stat label="Finish Probability" value={`${play.ufc_estimated_finish_probability ?? "N/A"}%`} />
        </div>

        <div style={signalGridStyle}>
          <div>
            <h4>🥊 Striking</h4>
            <p>Striking Diff: {play.ufc_striking_diff ?? "N/A"}</p>
            <p>Power Diff: {play.ufc_power_diff ?? "N/A"}</p>
            <p>Speed Diff: {play.ufc_speed_diff ?? "N/A"}</p>
            <p>Counter Diff: {play.ufc_counter_diff ?? "N/A"}</p>
          </div>

          <div>
            <h4>🤼 Grappling</h4>
            <p>Takedown Path: {play.ufc_takedown_path_edge ?? "N/A"}</p>
            <p>TD Defense Edge: {play.ufc_takedown_defense_edge ?? "N/A"}</p>
            <p>Submission Diff: {play.ufc_submission_diff ?? "N/A"}</p>
            <p>Control Diff: {play.ufc_control_diff ?? "N/A"}</p>
          </div>

          <div>
            <h4>🧠 Fight Profile</h4>
            <p>Cardio Diff: {play.ufc_cardio_diff ?? "N/A"}</p>
            <p>Durability Diff: {play.ufc_durability_diff ?? "N/A"}</p>
            <p>Fight IQ Diff: {play.ufc_fight_iq_diff ?? "N/A"}</p>
            <p>Experience Diff: {play.ufc_experience_diff ?? "N/A"}</p>
          </div>

          <div>
            <h4>📏 Physical Edge</h4>
            <p>Reach: {play.ufc_reach_advantage ?? "N/A"}</p>
            <p>Height: {play.ufc_height_advantage ?? "N/A"}</p>
            <p>Age Curve: {play.ufc_age_curve_adjustment ?? "N/A"}</p>
            <p>Decision Prob: {play.ufc_estimated_decision_probability ?? "N/A"}%</p>
          </div>

          <div>
            <h4>📈 Market</h4>
            <p>Sharp: {play.sharp_signal || "N/A"}</p>
            <p>Market Grade: {play.market_intelligence_grade || "N/A"}</p>
            <p>Line Value: {play.line_shop_value ?? "N/A"}</p>
            <p>Book Count: {play.book_count ?? "N/A"}</p>
          </div>

          <div>
            <h4>⭐ Rating</h4>
            <p>Final Score: {play.final_model_score ?? "N/A"}</p>
            <p>Tier: {play.final_model_tier || "N/A"}</p>
            <p>Stars: {play.final_stars ? `${play.final_stars}/5` : "N/A"}</p>
            <p>POD Tier: {play.universal_pod_tier || "N/A"}</p>
          </div>
        </div>

        {Array.isArray(play.ufc_v2_notes) && play.ufc_v2_notes.length > 0 && (
          <div style={notesStyle}>
            <h4>Model Notes</h4>
            {play.ufc_v2_notes.map((note, noteIndex) => (
              <p key={noteIndex}>✓ {note}</p>
            ))}
          </div>
        )}

        <p style={reasonStyle}>{play.reason || "No model reason available."}</p>
      </div>
    );
  };

  return (
    <div style={pageStyle}>
      <h1 style={{ fontSize: "38px", marginBottom: "10px" }}>UFC Model</h1>
      <p style={subtitleStyle}>
        UFC v2 Pro model powered by fighter ratings, striking, grappling, takedown paths,
        cardio, durability, fight IQ, reach, age curve, finish probability, sportsbook comparison,
        market intelligence, and Universal POD scoring.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : sortedPlays.length === 0 ? (
        <p>No UFC plays available right now.</p>
      ) : (
        <>
          {topPlay && (
            <section style={{ marginBottom: "45px" }}>
              <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>Top UFC Play</h2>
              {renderCard(topPlay, 0, true)}
            </section>
          )}

          <section>
            <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>UFC Plays</h2>
            <div style={{ display: "grid", gap: "24px" }}>
              {sortedPlays.map((play, index) => renderCard(play, index))}
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
  maxWidth: "950px",
  lineHeight: "1.6",
};

const cardStyle = {
  backgroundColor: "#111827",
  borderRadius: "16px",
  padding: "24px",
};

const cardTopStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "18px",
  alignItems: "flex-start",
};

const pickStyle = {
  color: "#facc15",
  fontSize: "24px",
  marginBottom: "14px",
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

const scoreBoxStyle = {
  backgroundColor: "#020617",
  border: "1px solid #14532d",
  borderRadius: "14px",
  padding: "14px",
  minWidth: "120px",
  textAlign: "center",
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

const heroGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
  marginBottom: "18px",
};

const statStyle = {
  backgroundColor: "#020617",
  border: "1px solid #374151",
  borderRadius: "12px",
  padding: "14px",
};

const statLabelStyle = {
  display: "block",
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: "bold",
  textTransform: "uppercase",
  marginBottom: "6px",
};

const signalGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "16px",
  backgroundColor: "#020617",
  padding: "18px",
  borderRadius: "12px",
  marginBottom: "18px",
};

const notesStyle = {
  backgroundColor: "#020617",
  border: "1px solid #374151",
  borderRadius: "12px",
  padding: "16px",
  marginBottom: "16px",
  color: "#d1d5db",
};

const reasonStyle = {
  color: "#d1d5db",
  lineHeight: "1.6",
};

export default UFCModelPage;
