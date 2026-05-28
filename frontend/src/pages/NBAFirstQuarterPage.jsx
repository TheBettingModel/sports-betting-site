import { useEffect, useMemo, useState } from "react";

function NBAFirstQuarterPage() {
  const [games, setGames] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");

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

  const miniStatStyle = {
    backgroundColor: "#111827",
    border: "1px solid #374151",
    borderRadius: "10px",
    padding: "12px",
  };

  useEffect(() => {
    fetch(`${API_URL}/model/nba/today`)
      .then((res) => res.json())
      .then((data) => {
        if (data.plays) {
          setGames(data.plays);
        } else {
          setError("Failed to load NBA model.");
        }
      })
      .catch(() => {
        setError("Failed to load NBA model.");
      });
  }, [API_URL]);

  const sortedGames = useMemo(() => {
    return [...games].sort((a, b) => {
      return (parseFloat(b.edge) || 0) - (parseFloat(a.edge) || 0);
    });
  }, [games]);

const firstQuarterGames = useMemo(() => {
  return sortedGames.filter((game) => {
    const market = String(game.market || "").toLowerCase();

    return (
      market.includes("1q") ||
      market.includes("1st quarter") ||
      market.includes("first quarter")
    );
  });
}, [sortedGames]);

const filteredGames = useMemo(() => {
  if (filter === "All") return firstQuarterGames;

  return firstQuarterGames.filter(
    (game) => game.recommendation === filter
  );
}, [firstQuarterGames, filter]);

  const topPlayKeys = useMemo(() => {
    const topThree = sortedGames
      .filter((game) => game.recommendation === "Play")
      .slice(0, 3);

    return new Set(
      topThree.map((game) => `${game.game}-${game.pick}-${game.market}`)
    );
  }, [sortedGames]);

  const isTopPlay = (game) => {
    return topPlayKeys.has(`${game.game}-${game.pick}-${game.market}`);
  };

  const getRecommendedUnits = (edge) => {
    const edgeValue = parseFloat(String(edge).replace("%", ""));

    if (isNaN(edgeValue)) return "1 Unit";
    if (edgeValue >= 4) return "2 Units";
    if (edgeValue >= 2) return "1.5 Units";
    return "1 Unit";
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
      <h1
        style={{
          marginBottom: "20px",
          fontSize: "38px",
        }}
      >
        NBA 1Q Model
      </h1>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "30px",
        }}
      >
        {["All", "Play", "Lean", "Pass"].map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            style={{
              backgroundColor: filter === item ? "#e10600" : "#1f2937",
              color: "white",
              border: "1px solid #374151",
              borderRadius: "999px",
              padding: "10px 14px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            {item === "All" ? "All" : `${item}s`}
          </button>
        ))}
      </div>

      {error ? (
        <p>{error}</p>
      ) : filteredGames.length === 0 ? (
        <p>No {filter.toLowerCase()} available.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "24px",
          }}
        >
          {filteredGames.map((game, index) => (
            <div
              key={index}
              style={{
                backgroundColor: "#111827",
                border: isTopPlay(game)
                  ? "2px solid #e10600"
                  : "1px solid #374151",
                borderRadius: "16px",
                padding: "24px",
                boxShadow: isTopPlay(game)
                  ? "0 0 15px rgba(225, 6, 0, 0.35)"
                  : "none",
              }}
            >
              {isTopPlay(game) && (
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
                  Top Play
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <p
                  style={{
                    color: "#9ca3af",
                    fontSize: "14px",
                    marginBottom: "6px",
                  }}
                >
                  {game.market} • {game.sportsbook}
                </p>

                <h2 style={{ marginBottom: "8px" }}>{game.game}</h2>

                <h1
                  style={{
                    color: "#22c55e",
                    marginBottom: "12px",
                    fontSize: "30px",
                  }}
                >
                  {game.pick}
                </h1>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px",
                    marginBottom: "18px",
                  }}
                >
                  <span style={badgeStyle}>Odds: {game.odds}</span>

                  <span style={badgeStyle}>Edge: {game.edge}%</span>

                  <span style={badgeStyle}>
                    Confidence: {game.confidence}%
                  </span>

                  <span style={badgeStyle}>
                    Units: {getRecommendedUnits(game.edge)}
                  </span>

                  <span
                    style={{
                      ...badgeStyle,
                      backgroundColor:
                        game.recommendation === "Play"
                          ? "#166534"
                          : game.recommendation === "Lean"
                          ? "#854d0e"
                          : "#374151",
                    }}
                  >
                    {game.recommendation}
                  </span>
                </div>
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

                <p
                  style={{
                    color: "#d1d5db",
                    lineHeight: "1.7",
                  }}
                >
                  {game.reason || "Model edge based on pricing, team rating, market value, and playoff environment."}
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div style={miniStatStyle}>
                  <strong>Implied Probability</strong>
                  <p>{game.implied_probability}%</p>
                </div>

                <div style={miniStatStyle}>
                  <strong>Model Probability</strong>
                  <p>{game.model_probability}%</p>
                </div>

                <div style={miniStatStyle}>
                  <strong>Playoff Adjustment</strong>
                  <p>{game.playoff_adjustment ?? "N/A"}</p>
                </div>

                <div style={miniStatStyle}>
                  <strong>Recommendation</strong>
                  <p>{game.recommendation}</p>
                </div>
              </div>

              <hr
                style={{
                  borderColor: "#374151",
                  margin: "20px 0",
                }}
              />

              <h3>Model Details</h3>

              <p>
                <strong>Market:</strong> {game.market}
              </p>

              <p>
                <strong>Sportsbook:</strong> {game.sportsbook}
              </p>

              <p>
                <strong>Pick:</strong> {game.pick}
              </p>

              <p>
                <strong>Odds:</strong> {game.odds}
              </p>

              <p>
                <strong>Edge:</strong> {game.edge}%
              </p>

              <p>
                <strong>Confidence:</strong> {game.confidence}%
              </p>

              <p>
                <strong>Recommended Units:</strong>{" "}
                {getRecommendedUnits(game.edge)}
              </p>

              {game.playoff_mode && (
                <>
                  <hr
                    style={{
                      borderColor: "#374151",
                      margin: "20px 0",
                    }}
                  />

                  <h3>Playoff Mode</h3>

                  <p>
                    <strong>Playoff Adjustment:</strong>{" "}
                    {game.playoff_adjustment ?? "N/A"}
                  </p>

                  {game.playoff_reasons &&
                    game.playoff_reasons.length > 0 && (
                      <ul style={{ color: "#d1d5db", lineHeight: "1.6" }}>
                        {game.playoff_reasons.map((reason, idx) => (
                          <li key={idx}>{reason}</li>
                        ))}
                      </ul>
                    )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default NBAFirstQuarterPage;
