import { useEffect, useMemo, useState } from "react";

function MLBModelBoardPage() {
  const [plays, setPlays] = useState([]);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  const badgeStyle = {
    backgroundColor: "#1f2937",
    border: "1px solid #374151",
    color: "white",
    padding: "8px 10px",
    borderRadius: "999px",
    fontSize: "14px",
    fontWeight: "bold",
  };

  const sectionStyle = {
    marginBottom: "40px",
  };

  const cardStyle = (isTop = false) => ({
    backgroundColor: "#111827",
    border: isTop ? "2px solid #e10600" : "1px solid #374151",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: isTop ? "0 0 15px rgba(225, 6, 0, 0.35)" : "none",
  });

  useEffect(() => {
    fetch(`${API_URL}/model/mlb/today`)
      .then((res) => res.json())
      .then((data) => {
        if (data.plays) {
          setPlays(data.plays);
        } else {
          setError("Failed to load MLB model.");
        }
      })
      .catch(() => {
        setError("Failed to load MLB model.");
      });
  }, [API_URL]);

  const sortedPlays = useMemo(() => {
    return [...plays].sort((a, b) => {
      return (parseFloat(b.edge) || 0) - (parseFloat(a.edge) || 0);
    });
  }, [plays]);

  const topOverall = useMemo(() => {
    return sortedPlays.slice(0, 5);
  }, [sortedPlays]);

  const topSides = useMemo(() => {
    return sortedPlays
      .filter((play) => play.market === "Moneyline" || play.market === "Run Line")
      .slice(0, 5);
  }, [sortedPlays]);

  const topTotals = useMemo(() => {
    return sortedPlays
      .filter((play) => play.market === "Total")
      .slice(0, 5);
  }, [sortedPlays]);

  const topUnderdogs = useMemo(() => {
    return sortedPlays
      .filter((play) => {
        const odds = Number(play.odds);
        return odds > 0;
      })
      .slice(0, 5);
  }, [sortedPlays]);

  const renderPlayCard = (play, index, label = "Top Play") => {
    const isTop = index === 0;

    return (
      <div key={`${play.game}-${play.pick}-${play.market}-${index}`} style={cardStyle(isTop)}>
        {isTop && (
          <div
            style={{
              backgroundColor: "#e10600",
              color: "white",
              padding: "6px 10px",
              borderRadius: "8px",
              display: "inline-block",
              marginBottom: "16px",
              fontWeight: "bold",
              fontSize: "14px",
            }}
          >
            {label}
          </div>
        )}

        <p style={{ color: "#9ca3af", fontSize: "14px", marginBottom: "6px" }}>
          {play.market} • {play.sportsbook}
        </p>

        <h2 style={{ marginBottom: "8px" }}>{play.game}</h2>

        <h1 style={{ color: "#22c55e", marginBottom: "12px", fontSize: "30px" }}>
          {play.pick}
        </h1>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "18px" }}>
          <span style={badgeStyle}>Odds: {play.odds}</span>
          <span style={badgeStyle}>Edge: {play.edge}%</span>
          <span style={badgeStyle}>Confidence: {play.confidence}%</span>
          <span style={badgeStyle}>Units: {play.units}u</span>

          <span
            style={{
              ...badgeStyle,
              backgroundColor:
                play.recommendation === "Play"
                  ? "#166534"
                  : play.recommendation === "Lean"
                  ? "#854d0e"
                  : "#374151",
            }}
          >
            {play.recommendation}
          </span>
        </div>

        <div
          style={{
            backgroundColor: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "10px",
            padding: "14px",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Why We Like It</h3>
          <p style={{ color: "#d1d5db", lineHeight: "1.7" }}>{play.reason}</p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <div style={miniStatStyle}>
            <strong>Implied Probability</strong>
            <p>{play.implied_probability}%</p>
          </div>

          <div style={miniStatStyle}>
            <strong>Model Probability</strong>
            <p>{play.model_probability}%</p>
          </div>

          <div style={miniStatStyle}>
            <strong>Market Adjustment</strong>
            <p>{play.market_adjustment ?? "N/A"}</p>
          </div>

          <div style={miniStatStyle}>
            <strong>Weather Adjustment</strong>
            <p>{play.weather_adjustment ?? "N/A"}</p>
          </div>
        </div>

        {play.market === "Total" ? (
          <>
            <hr style={{ borderColor: "#374151", margin: "20px 0" }} />

            <h3>Projected Starters</h3>

            <p>
              <strong>Away Starter:</strong> {play.away_starter || "N/A"}
            </p>

            <p>
              <strong>Away Pitcher Rating:</strong>{" "}
              {play.away_pitcher_rating ?? "N/A"}
            </p>

            <p>
              <strong>Home Starter:</strong> {play.home_starter || "N/A"}
            </p>

            <p>
              <strong>Home Pitcher Rating:</strong>{" "}
              {play.home_pitcher_rating ?? "N/A"}
            </p>
          </>
        ) : (
          <>
            <hr style={{ borderColor: "#374151", margin: "20px 0" }} />

            <h3>Pitching Matchup</h3>

            <p>
              <strong>Starting Pitcher:</strong> {play.starting_pitcher || "N/A"}
            </p>

            <p>
              <strong>Pitcher ERA:</strong> {play.pitcher_era ?? "N/A"}
            </p>

            <p>
              <strong>Pitcher WHIP:</strong> {play.pitcher_whip ?? "N/A"}
            </p>

            <p>
              <strong>Pitcher Rating:</strong> {play.pitcher_rating ?? "N/A"}
            </p>

            <p>
              <strong>Opponent:</strong> {play.opponent || "N/A"}
            </p>

            <p>
              <strong>Opponent Pitcher Rating:</strong>{" "}
              {play.opponent_pitcher_rating ?? "N/A"}
            </p>

            <p>
              <strong>Pitcher Rating Differential:</strong>{" "}
              {play.pitcher_rating_diff ?? "N/A"}
            </p>
          </>
        )}

        <hr style={{ borderColor: "#374151", margin: "20px 0" }} />

        <h3>Weather / Ballpark</h3>

        <p>
          <strong>Ballpark:</strong> {play.ballpark || "N/A"}
        </p>

        <p>
          <strong>Weather Risk:</strong> {play.weather_risk || "N/A"}
        </p>

        <p>
          <strong>Run Factor:</strong> {play.run_factor ?? "N/A"}
        </p>

        <p>
          <strong>HR Factor:</strong> {play.hr_factor ?? "N/A"}
        </p>

        <hr style={{ borderColor: "#374151", margin: "20px 0" }} />

        <h3>Bullpen</h3>

        <p>
          <strong>Bullpen Fatigue:</strong> {play.bullpen_fatigue ?? "N/A"}
        </p>

        <p>
          <strong>Bullpen ERA:</strong> {play.bullpen_era ?? "N/A"}
        </p>

        <p>
          <strong>Bullpen Status:</strong> {play.bullpen_status || "N/A"}
        </p>
      </div>
    );
  };

  const miniStatStyle = {
    backgroundColor: "#111827",
    border: "1px solid #374151",
    borderRadius: "10px",
    padding: "12px",
  };

  const renderSection = (title, subtitle, sectionPlays, label) => {
    return (
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "28px", marginBottom: "6px" }}>{title}</h2>

        <p style={{ color: "#9ca3af", marginBottom: "18px" }}>{subtitle}</p>

        {sectionPlays.length === 0 ? (
          <p style={{ color: "#9ca3af" }}>No plays available in this section.</p>
        ) : (
          <div style={{ display: "grid", gap: "24px" }}>
            {sectionPlays.map((play, index) => renderPlayCard(play, index, label))}
          </div>
        )}
      </section>
    );
  };

  return (
    <div
      style={{
        padding: "30px",
        backgroundColor: "#0b0b0b",
        minHeight: "100vh",
        color: "white",
      }}
    >
      <h1 style={{ marginBottom: "10px", fontSize: "38px" }}>MLB Model</h1>

      <p style={{ color: "#9ca3af", maxWidth: "900px", lineHeight: "1.6", marginBottom: "30px" }}>
        Full-game MLB betting model powered by starting pitching, bullpen fatigue,
        market pricing, weather, ballpark factors, and projected edge.
      </p>

      {error ? (
        <p>{error}</p>
      ) : sortedPlays.length === 0 ? (
        <p>No MLB plays available.</p>
      ) : (
        <>
          {renderSection(
            "Top Overall Plays",
            "Highest-rated full-game MLB plays by model edge.",
            topOverall,
            "Top Overall"
          )}

          {renderSection(
            "Top Sides",
            "Best moneyline and run line positions.",
            topSides,
            "Top Side"
          )}

          {renderSection(
            "Top Totals",
            "Best full-game total positions using weather and park context.",
            topTotals,
            "Top Total"
          )}

          {renderSection(
            "Top Underdogs",
            "Positive-money opportunities with model support.",
            topUnderdogs,
            "Top Dog"
          )}
        </>
      )}
    </div>
  );
}

export default MLBModelBoardPage;
