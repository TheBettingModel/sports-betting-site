import { useEffect, useState } from "react";


function normalizeBestBySport(data) {
  const pick = data?.play_of_the_day || data?.overall_play;
  const raw = data?.best_by_sport || data?.by_sport || {};
  const cleaned = { ...raw };

  if (pick?.sport) cleaned[pick.sport] = pick;
  if (pick?.pod_sport) cleaned[pick.pod_sport] = pick;

  return cleaned;
}
\nfunction AutoPODPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    fetch(`${API_URL}/homepage`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => {
        console.error("Auto POD v2 fetch error:", err);
        setError("Failed to load Play of the Day.");
      });
  }, [API_URL]);

  const overallPlay = data?.overall_play;
  const topFive = data?.top_5 || [];
  const bySport = normalizeBestBySport(data);

  const sportEmojis = {
    MLB: "⚾",
    NBA: "🏀",
    NFL: "🏈",
    WNBA: "🏀",
    NHL: "🏒",
    NCAAF: "🏈",
  };

  const getReason = (play) => {
    if (!play) return "No qualified play available.";

    const reasons = play.universal_pod_reasons || play.final_rating_reasons;

    if (Array.isArray(reasons) && reasons.length > 0) {
      return reasons.slice(0, 3).join(" ");
    }

    return play.reason || play.sharp_reason || "Model-qualified play.";
  };

  const renderPodCard = (title, emoji, play, featured = false) => {
    if (!play) {
      return (
        <section style={featured ? featuredCardStyle : podCardStyle}>
          <div style={labelStyle}>{emoji} {title}</div>
          <h2>No Qualified Play</h2>
          <p style={mutedTextStyle}>No play met the model threshold today.</p>
        </section>
      );
    }

    return (
      <section style={featured ? featuredCardStyle : podCardStyle}>
        <div style={labelStyle}>{emoji} {title}</div>

        <h2 style={{ marginBottom: "8px" }}>
          {play.pick || "N/A"}
        </h2>

        <p style={gameStyle}>
          {play.pod_sport || play.sport || "Sport"} — {play.game || "N/A"}
        </p>

        <div style={scoreRowStyle}>
          <div>
            <p style={miniLabelStyle}>POD Score</p>
            <h3 style={scoreStyle}>{play.universal_pod_score ?? "N/A"}</h3>
          </div>

          <div>
            <p style={miniLabelStyle}>Final Score</p>
            <h3 style={scoreStyle}>{play.final_model_score ?? "N/A"}</h3>
          </div>

          <div>
            <p style={miniLabelStyle}>Market Grade</p>
            <h3 style={scoreStyle}>{play.market_intelligence_grade || "N/A"}</h3>
          </div>
        </div>

        <div style={badgeWrapStyle}>
          <span style={badgeStyle}>{play.market || "N/A"}</span>
          <span style={badgeStyle}>Odds: {play.best_odds || play.odds || "N/A"}</span>
          <span style={badgeStyle}>Edge: {play.edge ?? "N/A"}%</span>
          <span style={badgeStyle}>Units: {play.units ?? "N/A"}</span>
          <span style={badgeStyle}>
            {play.final_recommendation || play.recommendation || "N/A"}
          </span>
        </div>

        <div style={signalGridStyle}>
          <div>
            <strong>Sharp</strong>
            <p>{play.sharp_signal || "N/A"}</p>
          </div>

          <div>
            <strong>Market</strong>
            <p>{play.market_intelligence_signal || "N/A"}</p>
          </div>

          <div>
            <strong>Book</strong>
            <p>{play.best_sportsbook || play.sportsbook || "N/A"}</p>
          </div>

          <div>
            <strong>Line Value</strong>
            <p>{play.line_shop_value ?? "N/A"}</p>
          </div>
        </div>

        <p style={reasonStyle}>{getReason(play)}</p>
      </section>
    );
  };

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>🔥 Play of the Day</h1>

      <p style={subtitleStyle}>
        Universal Play of the Day engine ranking every qualified play across all sports
        using final score, market intelligence, sharp signal, CLV, timing, sportsbook quality,
        and line value.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : !data ? (
        <p>Loading Play of the Day...</p>
      ) : (
        <>
          {renderPodCard("Overall Play of the Day", "🔥", overallPlay, true)}

          <section style={sectionStyle}>
            <h2>Top 5 Plays Today</h2>

            {topFive.length === 0 ? (
              <p style={mutedTextStyle}>No qualified top plays available.</p>
            ) : (
              <div style={rankListStyle}>
                {topFive.map((play, index) => (
                  <div key={`${play.game}-${play.pick}-${index}`} style={rankRowStyle}>
                    <div style={rankNumberStyle}>#{index + 1}</div>

                    <div style={{ flex: 1 }}>
                      <strong>
                        {sportEmojis[play.pod_sport] || "⭐"} {play.pick}
                      </strong>
                      <p style={rankMetaStyle}>
                        {play.pod_sport || play.sport} — {play.game} — {play.market}
                      </p>
                    </div>

                    <div style={rankScoreStyle}>
                      {play.universal_pod_score ?? "N/A"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={sectionStyle}>
            <h2>Best Play by Sport</h2>

            <div style={gridStyle}>
              {Object.entries(normalizeBestBySport(data)).map(([sport, play]) =>
                renderPodCard(`${sport} POD`, sportEmojis[sport] || "⭐", play)
              )}
            </div>
          </section>

          {data.note && (
            <p style={noteStyle}>{data.note}</p>
          )}
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

const titleStyle = {
  fontSize: "42px",
  marginBottom: "10px",
};

const subtitleStyle = {
  color: "#9ca3af",
  maxWidth: "950px",
  lineHeight: "1.6",
  marginBottom: "28px",
};

const featuredCardStyle = {
  backgroundColor: "#111827",
  border: "2px solid #22c55e",
  boxShadow: "0 0 24px rgba(34, 197, 94, 0.35)",
  borderRadius: "20px",
  padding: "28px",
  marginBottom: "28px",
};

const podCardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "18px",
  padding: "24px",
};

const sectionStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "18px",
  padding: "24px",
  marginBottom: "28px",
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
  marginBottom: "18px",
  fontSize: "16px",
};

const scoreRowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: "12px",
  marginBottom: "18px",
};

const miniLabelStyle = {
  color: "#9ca3af",
  margin: 0,
  fontSize: "13px",
  fontWeight: "bold",
};

const scoreStyle = {
  color: "#22c55e",
  margin: "4px 0 0",
  fontSize: "28px",
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

const signalGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "12px",
  backgroundColor: "#020617",
  borderRadius: "14px",
  padding: "16px",
  marginBottom: "18px",
};

const reasonStyle = {
  color: "#d1d5db",
  lineHeight: "1.6",
  marginBottom: 0,
};

const mutedTextStyle = {
  color: "#9ca3af",
};

const rankListStyle = {
  display: "grid",
  gap: "12px",
};

const rankRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  backgroundColor: "#020617",
  border: "1px solid #374151",
  borderRadius: "14px",
  padding: "14px",
};

const rankNumberStyle = {
  backgroundColor: "#22c55e",
  color: "black",
  fontWeight: "bold",
  borderRadius: "999px",
  width: "42px",
  height: "42px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const rankMetaStyle = {
  color: "#9ca3af",
  margin: "4px 0 0",
};

const rankScoreStyle = {
  color: "#22c55e",
  fontSize: "24px",
  fontWeight: "bold",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: "20px",
};

const noteStyle = {
  color: "#9ca3af",
  fontSize: "13px",
  marginTop: "20px",
};

export default AutoPODPage;
