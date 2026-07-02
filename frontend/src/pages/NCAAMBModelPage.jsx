import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function NCAAMBModelPage() {
  const [plays, setPlays] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/model/ncaamb/today`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.plays)) setPlays(data.plays);
        else setError(data.error || "No NCAA Basketball plays available.");
      })
      .catch(() => setError("Failed to load NCAA Basketball model."));
  }, []);

  const sortedPlays = useMemo(() => {
    return [...plays].sort((a, b) => (Number(b.edge) || 0) - (Number(a.edge) || 0));
  }, [plays]);

  const topPlay = sortedPlays[0];

  const renderCard = (play, index, featured = false) => (
    <div
      key={`${play.game}-${play.pick}-${index}`}
      style={{
        backgroundColor: "#111827",
        border: featured ? "2px solid #22c55e" : "1px solid #374151",
        borderRadius: "16px",
        padding: "24px",
        boxShadow: featured ? "0 0 18px rgba(34,197,94,.35)" : "none",
      }}
    >
      {featured && <div style={labelStyle}>Top NCAA Basketball Play</div>}
      <h2>{play.game}</h2>
      <h3 style={{ color: "#facc15" }}>{play.pick} {play.odds}</h3>

      <div style={badgeWrapStyle}>
        <span style={badgeStyle}>Market: {play.market || "N/A"}</span>
        <span style={badgeStyle}>Edge: {play.edge ?? "N/A"}%</span>
        <span style={badgeStyle}>Confidence: {play.confidence ?? "N/A"}</span>
        <span style={badgeStyle}>Book: {play.best_sportsbook || play.sportsbook || "N/A"}</span>
        <span style={badgeStyle}>Tier: {play.final_model_tier || "N/A"}</span>
        <span style={badgeStyle}>{play.final_recommendation || play.recommendation || "N/A"}</span>
      </div>

      <div style={signalGridStyle}>
        <div>
          <h4>🏀 Efficiency</h4>
          <p>Off/Def Edge: {play.ncaamb_offense_vs_defense_edge ?? "N/A"}</p>
          <p>Tempo: {play.ncaamb_combined_tempo ?? "N/A"}</p>
          <p>SOS Diff: {play.ncaamb_sos_diff ?? "N/A"}</p>
        </div>
        <div>
          <h4>📈 Market</h4>
          <p>Sharp: {play.sharp_signal || "N/A"}</p>
          <p>Grade: {play.market_intelligence_grade || "N/A"}</p>
          <p>CLV: {play.clv_status || "N/A"}</p>
        </div>
        <div>
          <h4>🔥 Form</h4>
          <p>Recent Form Diff: {play.ncaamb_recent_form_diff ?? "N/A"}</p>
          <p>Possession Edge: {play.ncaamb_possession_edge ?? "N/A"}</p>
          <p>Adj: {play.ncaamb_adjustment ?? "N/A"}</p>
        </div>
      </div>

      <p style={reasonStyle}>{play.reason || "No model reason available."}</p>
    </div>
  );

  return (
    <div style={pageStyle}>
      <h1 style={{ fontSize: "38px", marginBottom: "10px" }}>NCAA Men’s Basketball Model</h1>
      <p style={subtitleStyle}>
        NCAA Basketball model powered by team ratings, efficiency, tempo, strength of schedule,
        recent form, sportsbook comparison, sharp signals, and Universal POD scoring.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : sortedPlays.length === 0 ? (
        <p>No NCAA Basketball plays available right now.</p>
      ) : (
        <>
          {topPlay && (
            <section style={{ marginBottom: "45px" }}>
              <h2>Top NCAA Basketball Play</h2>
              {renderCard(topPlay, 0, true)}
            </section>
          )}

          <section>
            <h2>Plays</h2>
            <div style={{ display: "grid", gap: "24px" }}>
              {sortedPlays.map((play, index) => renderCard(play, index))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const pageStyle = { padding: "30px", backgroundColor: "#0b0b0b", minHeight: "100vh", color: "white" };
const subtitleStyle = { color: "#9ca3af", marginBottom: "30px", maxWidth: "850px", lineHeight: "1.6" };
const labelStyle = { backgroundColor: "#22c55e", color: "black", padding: "6px 10px", borderRadius: "8px", display: "inline-block", marginBottom: "16px", fontWeight: "bold" };
const badgeWrapStyle = { display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "20px" };
const badgeStyle = { backgroundColor: "#1f2937", border: "1px solid #374151", color: "white", padding: "8px 10px", borderRadius: "999px", fontSize: "14px", fontWeight: "bold" };
const signalGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", backgroundColor: "#020617", padding: "18px", borderRadius: "12px", marginBottom: "18px" };
const reasonStyle = { color: "#d1d5db", lineHeight: "1.6" };

export default NCAAMBModelPage;
