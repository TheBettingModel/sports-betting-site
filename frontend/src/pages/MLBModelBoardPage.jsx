import { useEffect, useMemo, useState } from "react";

function MLBModelBoardPage() {
  const [plays, setPlays] = useState([]);
  const [topPlay, setTopPlay] = useState(null);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    fetch(`${API_URL}/model/mlb/today`)
      .then((res) => res.json())
      .then((data) => {
        if (data.plays) {
          setPlays(data.plays);
          setTopPlay(data.top_play || null);
        } else {
          setError("Failed to load MLB Model");
        }
      })
      .catch(() => setError("Failed to load MLB Model"));
  }, [API_URL]);

  const sortedPlays = useMemo(() => {
    return [...plays].sort(
      (a, b) =>
        (parseFloat(b.top_play_score) || 0) -
        (parseFloat(a.top_play_score) || 0)
    );
  }, [plays]);

  const topMoneyline = sortedPlays.filter((play) => play.market === "Moneyline");
  const topTotals = sortedPlays.filter((play) => play.market === "Total");

  const badgeStyle = {
    backgroundColor: "#1f2937",
    border: "1px solid #374151",
    color: "white",
    padding: "8px 12px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: "600",
  };

  const sectionStyle = {
    backgroundColor: "#111827",
    border: "1px solid #374151",
    borderRadius: "14px",
    padding: "18px",
    marginBottom: "18px",
  };

  const statBoxStyle = {
    backgroundColor: "#0f172a",
    border: "1px solid #374151",
    borderRadius: "12px",
    padding: "14px",
  };

  const getSignalColor = (signal) => {
    if (signal === "Sharp Play") return "#166534";
    if (signal === "Value Watch") return "#854d0e";
    if (signal === "Market Caution") return "#7f1d1d";
    return "#374151";
  };

  const getStrengthColor = (strength) => {
    if (strength === "Strong") return "#166534";
    if (strength === "Moderate") return "#854d0e";
    if (strength === "Weak") return "#7f1d1d";
    return "#374151";
  };

  const getLineSignalColor = (signal) => {
    if (signal === "Steam Toward Pick") return "#166534";
    if (signal === "Price Drift") return "#7f1d1d";
    return "#374151";
  };

  const getClvColor = (status) => {
    if (status === "Positive CLV") return "#166534";
    if (status === "Negative CLV") return "#7f1d1d";
    return "#374151";
  };

  const formatPlus = (value) => {
    if (value === undefined || value === null) return "N/A";
    return Number(value) > 0 ? `+${value}` : value;
  };

  const renderCard = (play, index, label, featured = false) => {
    return (
      <div
        key={`${play.game}-${play.pick}-${play.market}-${index}`}
        style={{
          backgroundColor: featured ? "#111827" : "#0f172a",
          border: featured
            ? "2px solid #22c55e"
            : index === 0
            ? "2px solid #dc2626"
            : "1px solid #374151",
          borderRadius: "18px",
          padding: "26px",
          marginBottom: "24px",
          boxShadow: featured ? "0 0 22px rgba(34, 197, 94, 0.28)" : "none",
        }}
      >
        <div
          style={{
            backgroundColor: featured ? "#166534" : "#dc2626",
            color: "white",
            display: "inline-block",
            padding: "6px 12px",
            borderRadius: "8px",
            marginBottom: "18px",
            fontWeight: "bold",
            fontSize: "13px",
          }}
        >
          {label}
        </div>

        <p style={{ color: "#9ca3af", marginBottom: "8px", fontSize: "14px" }}>
          {play.market} • {play.sportsbook}
        </p>

        <h2 style={{ marginBottom: "10px", fontSize: "40px" }}>{play.pick}</h2>

        <h3 style={{ color: "#d1d5db", marginBottom: "22px", fontSize: "24px" }}>
          {play.game}
        </h3>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "22px" }}>
          <span style={badgeStyle}>Odds: {play.odds}</span>
          <span style={badgeStyle}>Edge: {play.edge}%</span>
          <span style={badgeStyle}>Confidence: {play.confidence}%</span>
          <span style={badgeStyle}>Units: {play.units}u</span>
          <span style={badgeStyle}>Top Score: {play.top_play_score ?? "N/A"}</span>

          <span style={{ ...badgeStyle, backgroundColor: getSignalColor(play.sharp_signal) }}>
            {play.sharp_signal || "No Signal"}
          </span>

          <span style={{ ...badgeStyle, backgroundColor: getStrengthColor(play.market_strength) }}>
            {play.market_strength || "Neutral"}
          </span>

          <span style={{ ...badgeStyle, backgroundColor: getClvColor(play.clv_status) }}>
            {play.clv_status || "Neutral CLV"}
          </span>

          <span style={{ ...badgeStyle, backgroundColor: "#1d4ed8" }}>
            Best Book: {play.best_sportsbook || "N/A"}
          </span>

          <span style={{ ...badgeStyle, backgroundColor: "#065f46" }}>
            Best Odds: {play.best_odds ?? "N/A"}
          </span>

          <span style={{ ...badgeStyle, backgroundColor: "#7c2d12" }}>
            Worst Odds: {play.worst_odds ?? "N/A"}
          </span>

          <span style={{ ...badgeStyle, backgroundColor: "#312e81" }}>
            Books: {play.book_count ?? 1}
          </span>

          <span
            style={{
              ...badgeStyle,
              backgroundColor:
                (play.line_shop_value || 0) >= 20
                  ? "#166534"
                  : (play.line_shop_value || 0) >= 10
                  ? "#854d0e"
                  : "#374151",
            }}
          >
            Line Value: {play.line_shop_value ?? 0}
          </span>
        </div>

        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0 }}>Why We Like It</h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
              marginTop: "14px",
            }}
          >
            <div style={statBoxStyle}>
              <strong>Pitching Edge</strong>
              <p>{formatPlus(play.pitcher_rating_diff)}</p>
            </div>

            <div style={statBoxStyle}>
              <strong>Starting Pitcher</strong>
              <p>{play.starting_pitcher || play.away_starter || "N/A"}</p>
            </div>

            <div style={statBoxStyle}>
              <strong>Bullpen Status</strong>
              <p>{play.bullpen_status || "N/A"}</p>
            </div>

            <div style={statBoxStyle}>
              <strong>Market Signal</strong>
              <p>{play.sharp_signal || "No Signal"}</p>
            </div>

            <div style={statBoxStyle}>
              <strong>CLV Status</strong>
              <p>{play.clv_status || "Neutral CLV"}</p>
            </div>

            <div style={statBoxStyle}>
              <strong>Best Available Price</strong>
              <p>
                {play.best_sportsbook || "N/A"}{" "}
                {play.best_odds !== undefined && play.best_odds !== null
                  ? `(${play.best_odds})`
                  : ""}
              </p>
            </div>

            <div style={statBoxStyle}>
              <strong>Line Shopping Edge</strong>
              <p>{play.line_shop_value ?? 0} cents</p>
            </div>

            <div style={statBoxStyle}>
              <strong>Ballpark</strong>
              <p>{play.ballpark || "N/A"}</p>
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0 }}>Sharp Market Signal</h3>

          <p style={{ color: "#d1d5db", lineHeight: "1.8" }}>
            <strong>Score:</strong> {play.sharp_score ?? "N/A"} —{" "}
            {play.sharp_reason || "No sharp analysis available."}
          </p>

          <p style={{ color: "#d1d5db", lineHeight: "1.8" }}>
            <strong>Line Movement:</strong> {play.line_movement ?? 0}
          </p>

          <p style={{ color: "#d1d5db", lineHeight: "1.8" }}>
            <strong>CLV:</strong> {play.clv_status || "Neutral CLV"}{" "}
            ({play.clv_score ?? 0}) — {play.clv_reason || "No CLV analysis available."}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "14px",
            marginBottom: "24px",
          }}
        >
          <div style={statBoxStyle}>
            <strong>Implied Probability</strong>
            <p>{play.implied_probability}%</p>
          </div>

          <div style={statBoxStyle}>
            <strong>Model Probability</strong>
            <p>{play.model_probability}%</p>
          </div>

          <div style={statBoxStyle}>
            <strong>Market Adjustment</strong>
            <p>{play.market_adjustment ?? "N/A"}</p>
          </div>

          <div style={statBoxStyle}>
            <strong>Weather Adjustment</strong>
            <p>{play.weather_adjustment ?? "N/A"}</p>
          </div>
        </div>

        <hr style={{ borderColor: "#374151", margin: "24px 0" }} />

        {play.market === "Total" ? (
          <>
            <h3>Projected Starters</h3>
            <p><strong>Away Starter:</strong> {play.away_starter || "N/A"}</p>
            <p><strong>Away Rating:</strong> {play.away_pitcher_rating ?? "N/A"}</p>
            <p><strong>Home Starter:</strong> {play.home_starter || "N/A"}</p>
            <p><strong>Home Rating:</strong> {play.home_pitcher_rating ?? "N/A"}</p>
          </>
        ) : (
          <>
            <h3>Pitching Matchup</h3>
            <p><strong>Starting Pitcher:</strong> {play.starting_pitcher || "N/A"}</p>
            <p><strong>ERA:</strong> {play.pitcher_era ?? "N/A"}</p>
            <p><strong>WHIP:</strong> {play.pitcher_whip ?? "N/A"}</p>
            <p><strong>Pitcher Rating:</strong> {play.pitcher_rating ?? "N/A"}</p>
          </>
        )}

        <hr style={{ borderColor: "#374151", margin: "24px 0" }} />

        <h3>Weather / Ballpark</h3>
        <p><strong>Ballpark:</strong> {play.ballpark || "N/A"}</p>
        <p><strong>Weather Risk:</strong> {play.weather_risk || "N/A"}</p>
        <p><strong>Run Factor:</strong> {play.run_factor ?? "N/A"}</p>
        <p><strong>HR Factor:</strong> {play.hr_factor ?? "N/A"}</p>

        <hr style={{ borderColor: "#374151", margin: "24px 0" }} />

        <h3>Bullpen</h3>
        <p><strong>Fatigue:</strong> {play.bullpen_fatigue ?? "N/A"}</p>
        <p><strong>Status:</strong> {play.bullpen_status || "N/A"}</p>
      </div>
    );
  };

  return (
    <div
      style={{
        backgroundColor: "#020617",
        minHeight: "100vh",
        color: "white",
        padding: "30px",
      }}
    >
      <h1 style={{ fontSize: "42px", marginBottom: "10px" }}>MLB Model</h1>

      <p style={{ color: "#9ca3af", marginBottom: "35px", maxWidth: "900px", lineHeight: "1.7" }}>
        MLB betting intelligence dashboard powered by pitcher ratings, bullpen fatigue, weather,
        park factors, sharp market signals, line movement, CLV, sportsbook comparison, and model
        edge detection.
      </p>

      {error ? (
        <p>{error}</p>
      ) : sortedPlays.length === 0 ? (
        <p>No MLB plays available.</p>
      ) : (
        <>
          {topPlay && (
            <section style={{ marginBottom: "55px" }}>
              <h2 style={{ marginBottom: "18px", fontSize: "32px" }}>Auto Top Play</h2>
              {renderCard(topPlay, 0, "Auto Top Play", true)}
            </section>
          )}

          <section style={{ marginBottom: "50px" }}>
            <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>Top Moneyline Plays</h2>

            {topMoneyline.length === 0 ? (
              <p style={{ color: "#9ca3af" }}>No moneyline plays available.</p>
            ) : (
              topMoneyline.map((play, index) => renderCard(play, index, "Top Moneyline"))
            )}
          </section>

          <section>
            <h2 style={{ marginBottom: "18px", fontSize: "30px" }}>Top Totals</h2>

            {topTotals.length === 0 ? (
              <p style={{ color: "#9ca3af" }}>No totals available.</p>
            ) : (
              topTotals.map((play, index) => renderCard(play, index, "Top Total"))
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default MLBModelBoardPage;
