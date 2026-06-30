import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
}

function getScore(play) {
  return Number(
    play?.universal_pod_score ??
      play?.top_play_score ??
      play?.final_model_score ??
      0
  );
}

function getSport(play) {
  return play?.pod_sport || play?.sport || play?.league || "Unknown";
}

function getBook(play) {
  return play?.best_sportsbook || play?.best_book || play?.sportsbook || "N/A";
}

function getOdds(play) {
  return play?.best_odds ?? play?.odds;
}

function getRecommendation(play) {
  return play?.final_recommendation || play?.recommendation || "N/A";
}

function getTier(play) {
  return (
    play?.final_model_tier ||
    play?.universal_pod_tier ||
    play?.market_intelligence_grade ||
    "N/A"
  );
}

function getBadgeColor(value) {
  if (!value) return "#6b7280";
  const text = String(value).toLowerCase();

  if (
    text.includes("elite") ||
    text.includes("play") ||
    text.includes("sharp") ||
    text.includes("positive") ||
    text.includes("a+")
  ) {
    return "#16a34a";
  }

  if (
    text.includes("lean") ||
    text.includes("watch") ||
    text.includes("neutral") ||
    text.includes("b")
  ) {
    return "#f59e0b";
  }

  return "#6b7280";
}

function renderBadge(label, value, color = null) {
  return (
    <span
      style={{
        ...badgeStyle,
        backgroundColor: color || "#1f2937",
      }}
    >
      {label}: {value ?? "N/A"}
    </span>
  );
}

function DashboardCard({ play, index, label = null, featured = false }) {
  if (!play) return null;

  const reasons =
    play.final_rating_reasons ||
    play.market_intelligence_reasons ||
    play.universal_pod_reasons ||
    [];

  return (
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

      <div style={featuredHeaderStyle}>
        <div>
          <h2 style={{ fontSize: featured ? "30px" : "24px", marginBottom: "8px" }}>
            {play.game || "Game unavailable"}
          </h2>

          <h3 style={{ fontSize: "22px", color: "#facc15", marginBottom: "12px" }}>
            {play.pick || "Pick unavailable"} {formatOdds(getOdds(play))}
          </h3>
        </div>

        {featured && (
          <div style={scoreBoxStyle}>
            <span style={{ color: "#9ca3af", fontSize: "13px", fontWeight: "bold" }}>
              POD Score
            </span>
            <strong style={{ color: "#22c55e", fontSize: "34px" }}>
              {getScore(play).toFixed(2)}
            </strong>
          </div>
        )}
      </div>

      <div style={badgeWrapStyle}>
        {renderBadge("Sport", getSport(play))}
        {renderBadge("Market", play.market)}
        {renderBadge("Best Book", getBook(play))}
        {renderBadge("Odds", formatOdds(getOdds(play)))}
        {renderBadge("Edge", play.edge !== undefined ? `${play.edge}%` : "N/A")}
        {renderBadge("Confidence", play.confidence)}
        {renderBadge("Units", play.units)}
        {renderBadge("POD", getScore(play).toFixed(2), "#14532d")}
        {renderBadge("Tier", getTier(play), getBadgeColor(getTier(play)))}
        {renderBadge("Recommendation", getRecommendation(play), getBadgeColor(getRecommendation(play)))}
      </div>

      <div style={signalGridStyle}>
        <div>
          <h4>📈 Market</h4>
          <p>Sharp: {play.sharp_signal || "N/A"}</p>
          <p>CLV: {play.clv_status || "N/A"}</p>
          <p>Grade: {play.market_intelligence_grade || "N/A"}</p>
        </div>

        <div>
          <h4>💰 Sportsbook</h4>
          <p>Best: {getBook(play)}</p>
          <p>Worst Odds: {formatOdds(play.worst_odds)}</p>
          <p>Line Value: {play.line_shop_value ?? "N/A"}</p>
        </div>

        <div>
          <h4>🔥 Sharp</h4>
          <p>Book Signal: {play.sharp_book_signal || "N/A"}</p>
          <p>Sharp Score: {play.sharp_score ?? "N/A"}</p>
          <p>Steam: {play.steam_strength || "N/A"}</p>
        </div>

        <div>
          <h4>⭐ Final Rating</h4>
          <p>Model Score: {play.final_model_score ?? "N/A"}</p>
          <p>Stars: {play.final_stars ? `${play.final_stars}/5` : "N/A"}</p>
          <p>Tier: {getTier(play)}</p>
        </div>
      </div>

      {Array.isArray(reasons) && reasons.length > 0 ? (
        <div style={reasonStyle}>
          {reasons.slice(0, 6).map((reason, i) => (
            <p key={i} style={{ margin: "4px 0" }}>
              ✓ {reason}
            </p>
          ))}
        </div>
      ) : (
        <p style={reasonStyle}>
          {play.sharp_reason || play.reason || "No model reason available."}
        </p>
      )}
    </div>
  );
}

function SportCard({ sport, play }) {
  if (!play) return null;

  return (
    <div style={sportCardStyle}>
      <div style={sportTopStyle}>
        <div style={labelStyle}>{sport}</div>
        <strong style={{ color: "#22c55e", fontSize: "24px" }}>
          {getScore(play).toFixed(2)}
        </strong>
      </div>

      <h3 style={{ fontSize: "20px", marginBottom: "10px" }}>
        {play.game || "Game unavailable"}
      </h3>

      <h4 style={{ color: "#facc15", marginBottom: "14px" }}>
        {play.pick || "Pick unavailable"} {formatOdds(getOdds(play))}
      </h4>

      <div style={badgeWrapStyle}>
        {renderBadge("Market", play.market)}
        {renderBadge("Book", getBook(play))}
        {renderBadge("Edge", play.edge !== undefined ? `${play.edge}%` : "N/A")}
        {renderBadge("Conf", play.confidence)}
        {renderBadge("Grade", getTier(play), getBadgeColor(getTier(play)))}
      </div>
    </div>
  );
}

function TopThreeBoard({ plays }) {
  if (!plays.length) {
    return <p>No ranked POD plays available.</p>;
  }

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {plays.map((play, index) => (
        <DashboardCard
          key={`${play.game}-${play.pick}-${index}`}
          play={play}
          index={index}
          label={`#${index + 1} Overall POD`}
          featured={index === 0}
        />
      ))}
    </div>
  );
}

export default function HomePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    setError("");

    fetch(`${API_URL}/model/play-of-the-day-v2`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((payload) => setData(payload))
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Homepage dashboard fetch error:", err);
        setError("Failed to load homepage dashboard.");
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const topThree = useMemo(() => {
    return Array.isArray(data?.top_5) ? data.top_5.slice(0, 3) : [];
  }, [data]);

  const overallPlay = data?.overall_play || topThree[0] || null;
  const sportEntries = Object.entries(data?.by_sport || {}).filter(([, play]) => play);

  return (
    <div style={pageStyle}>
      <h1 style={{ marginBottom: "10px", fontSize: "38px" }}>
        The Betting Model Dashboard
      </h1>

      <p style={subtitleStyle}>
        Universal model dashboard powered by Play of the Day rankings, best play by sport,
        sportsbook comparison, sharp action, CLV, line shopping, market intelligence,
        final model tiers, and betting recommendations.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : !data ? (
        <p>Loading dashboard...</p>
      ) : (
        <>
          <section style={{ marginBottom: "45px" }}>
            <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>
              Today’s Overall Play of the Day
            </h2>

            <DashboardCard
              play={overallPlay}
              index={0}
              label="Top Overall POD"
              featured
            />
          </section>

          <section style={{ marginBottom: "45px" }}>
            <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>
              Top 3 Overall Play of the Day
            </h2>

            <TopThreeBoard plays={topThree} />
          </section>

          <section style={{ marginBottom: "45px" }}>
            <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>
              Best Play By Sport
            </h2>

            {sportEntries.length === 0 ? (
              <p>No sport-by-sport plays available.</p>
            ) : (
              <div style={sportGridStyle}>
                {sportEntries.map(([sport, play]) => (
                  <SportCard key={sport} sport={sport} play={play} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>
              Dashboard Intelligence
            </h2>

            <div style={signalGridStyle}>
              <div>
                <h4>📊 System</h4>
                <p>Active Sports: {sportEntries.length}</p>
                <p>Universal POD: v3</p>
                <p>Ranking: Cross-Sport</p>
              </div>

              <div>
                <h4>🔥 Top Signal</h4>
                <p>Sharp: {overallPlay?.sharp_signal || "N/A"}</p>
                <p>Book: {overallPlay?.sharp_book_signal || "N/A"}</p>
                <p>Grade: {overallPlay?.market_intelligence_grade || "N/A"}</p>
              </div>

              <div>
                <h4>💰 Best Price</h4>
                <p>Book: {overallPlay ? getBook(overallPlay) : "N/A"}</p>
                <p>Odds: {formatOdds(overallPlay ? getOdds(overallPlay) : null)}</p>
                <p>Line Value: {overallPlay?.line_shop_value ?? "N/A"}</p>
              </div>

              <div>
                <h4>⭐ Model</h4>
                <p>Top POD: {overallPlay ? getScore(overallPlay).toFixed(2) : "N/A"}</p>
                <p>Recommendation: {overallPlay ? getRecommendation(overallPlay) : "N/A"}</p>
                <p>Tier: {overallPlay ? getTier(overallPlay) : "N/A"}</p>
              </div>
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

const featuredHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "20px",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const scoreBoxStyle = {
  backgroundColor: "#020617",
  border: "1px solid #14532d",
  borderRadius: "14px",
  padding: "14px 18px",
  textAlign: "center",
  minWidth: "150px",
};

const sportGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: "24px",
};

const sportCardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "22px",
};

const sportTopStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
};

