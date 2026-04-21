import { useEffect, useMemo, useState } from "react";

function ModelBoardPage() {
  const [games, setGames] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/model/nba/today`)
      .then((response) => response.json())
      .then((data) => {
        if (data.plays) {
          setGames(data.plays);
        } else {
          setError("Failed to load model board");
        }
      })
      .catch(() => {
        setError("Failed to load model board");
      });
  }, []);

  const filteredGames = useMemo(() => {
    if (filter === "All") return games;
    return games.filter((game) => game.recommendation === filter);
  }, [games, filter]);

  const playGames = useMemo(() => {
    return games.filter((game) => game.recommendation === "Play");
  }, [games]);

  const topPlayKeys = useMemo(() => {
    const topThree = playGames.slice(0, 3);

    return new Set(
      topThree.map((game) => `${game.game}-${game.pick}-${game.market}`)
    );
  }, [playGames]);

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

  const saveToPicks = async (game) => {
    const recommendedUnits = getRecommendedUnits(game.edge);

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
        units: recommendedUnits,
        model_probability: game.model_probability,
        implied_probability: game.implied_probability,
        edge: game.edge,
        recommendation: game.recommendation,
        commence_time: game.commence_time
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to save pick");
    }

    if (data.duplicate) {
      throw new Error("Duplicate pick already exists");
    }

    return data;
  };

  const handleSaveAllPlays = async () => {
    if (playGames.length === 0) {
      setMessage("No plays available to save.");
      return;
    }

    let savedCount = 0;
    let duplicateCount = 0;

    for (const game of playGames) {
      try {
        await saveToPicks(game);
        savedCount += 1;
      } catch (error) {
        if (error.message === "Duplicate pick already exists") {
          duplicateCount += 1;
        }
      }
    }

    setMessage(
      `Saved ${savedCount} plays.` +
        (duplicateCount > 0 ? ` ${duplicateCount} duplicates skipped.` : "")
    );
  };

  const handleSaveOne = async (game) => {
    try {
      await saveToPicks(game);
      setMessage(`Saved: ${game.pick} | ${game.market} | ${game.edge}`);
    } catch (error) {
      setMessage(error.message || "Error saving pick");
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

      <div style={{ marginBottom: "20px" }}>
        <button className="save-game-button" onClick={handleSaveAllPlays}>
          Save All Plays
        </button>
      </div>

      {message && <p>{message}</p>}

      {error ? (
        <p>{error}</p>
      ) : filteredGames.length === 0 ? (
        <p>No {filter.toLowerCase()} available.</p>
      ) : (
        <div className="picks-grid">
          {filteredGames.map((game, index) => (
            <div
              className={`pick-card ${isTopPlay(game) ? "top-play-card" : ""}`}
              key={index}
            >
              {isTopPlay(game) && <div className="top-play-badge">Top Play</div>}

              <h3>{game.game}</h3>
              <p><strong>Pick:</strong> {game.pick}</p>
              <p><strong>Market:</strong> {game.market}</p>
              <p><strong>Sportsbook:</strong> {game.sportsbook}</p>
              <p><strong>Odds:</strong> {game.odds}</p>
              <p><strong>Implied Probability:</strong> {game.implied_probability}%</p>
              <p><strong>Model Probability:</strong> {game.model_probability}%</p>
              <p><strong>Edge:</strong> {game.edge}%</p>
              <p><strong>Recommended Units:</strong> {getRecommendedUnits(game.edge)}</p>
              <p><strong>Confidence:</strong> {game.confidence}%</p>
              <p><strong>Recommendation:</strong> {game.recommendation}</p>

              <button
                className="save-game-button"
                onClick={() => handleSaveOne(game)}
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
