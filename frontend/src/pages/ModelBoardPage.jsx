import { useEffect, useMemo, useState } from "react";

function ModelBoardPage() {
  const [games, setGames] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("Play");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/model/nba/today`)
      .then((response) => response.json())
      .then((data) => {
        if (data.games) {
          setGames(data.games);
        } else {
          setError("Failed to load model board");
        }
      })
      .catch(() => {
        setError("Failed to load model board");
      });
  }, []);

  const getConfidenceClass = (confidence) => {
    if (confidence === "A") return "grade-a";
    if (confidence === "B+" || confidence === "B") return "grade-b";
    if (confidence === "C") return "grade-c";
    return "grade-d";
  };

  const filteredGames = useMemo(() => {
    if (filter === "All") return games;
    return games.filter((game) => game.recommendation === filter);
  }, [games, filter]);

  const saveToPicks = async (game) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/save-pick`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          game: game.game,
          pick: game.pick,
          market: game.market,
          sportsbook: game.sportsbook,
          odds: String(game.odds),
          confidence: game.confidence,
          units: "1 Unit",
          model_probability: game.model_probability,
          implied_probability: game.implied_probability,
          edge: game.edge
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`Saved: ${game.pick} | ${game.market} | ${game.edge}`);
      } else {
        setMessage(data.message || "Failed to save pick");
      }
    } catch (error) {
      setMessage("Error saving pick");
    }
  };

  return (
    <div className="app">
      <h1>NBA Model Board</h1>

      <div className="result-buttons" style={{ marginBottom: "20px" }}>
        <button onClick={() => setFilter("Play")}>Plays</button>
        <button onClick={() => setFilter("Lean")}>Leans</button>
        <button onClick={() => setFilter("Pass")}>Passes</button>
        <button onClick={() => setFilter("All")}>All</button>
      </div>

      {message && <p>{message}</p>}

      {error ? (
        <p>{error}</p>
      ) : filteredGames.length === 0 ? (
        <p>No {filter.toLowerCase()} available.</p>
      ) : (
        <div className="picks-grid">
          {filteredGames.map((game, index) => (
            <div className="pick-card" key={index}>
              <h3>{game.game}</h3>
              <p><strong>Pick:</strong> {game.pick}</p>
              <p><strong>Market:</strong> {game.market}</p>
              <p><strong>Sportsbook:</strong> {game.sportsbook}</p>
              <p><strong>Odds:</strong> {game.odds}</p>
              <p><strong>Implied Probability:</strong> {game.implied_probability}</p>
              <p><strong>Model Probability:</strong> {game.model_probability}</p>
              <p><strong>Edge:</strong> {game.edge}</p>
              <p>
                <strong>Confidence:</strong>{" "}
                <span className={getConfidenceClass(game.confidence)}>
                  {game.confidence}
                </span>
              </p>
              <p><strong>Recommendation:</strong> {game.recommendation}</p>

              <button
                className="save-game-button"
                onClick={() => saveToPicks(game)}
              >
                Save to Picks
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ModelBoardPage;
