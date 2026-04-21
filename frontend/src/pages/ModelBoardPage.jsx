import { useEffect, useMemo, useState } from "react";

function ModelBoardPage() {
  const [games, setGames] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("All");
  const [saving, setSaving] = useState(false);

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

  const dedupedGames = useMemo(() => {
    const bestByPick = {};

    for (const game of games) {
      const key = `${game.game}__${game.market}__${game.pick}`;
      const currentEdge = parseFloat(game.edge) || 0;
      const existingEdge = parseFloat(bestByPick[key]?.edge) || 0;

      if (!bestByPick[key] || currentEdge > existingEdge) {
        bestByPick[key] = game;
      }
    }

    return Object.values(bestByPick).sort((a, b) => {
      const edgeA = parseFloat(a.edge) || 0;
      const edgeB = parseFloat(b.edge) || 0;
      return edgeB - edgeA;
    });
  }, [games]);

  const filteredGames = useMemo(() => {
    if (filter === "All") return dedupedGames;
    return dedupedGames.filter((game) => game.recommendation === filter);
  }, [dedupedGames, filter]);

  const playGames = useMemo(() => {
    return dedupedGames.filter((game) => game.recommendation === "Play");
  }, [dedupedGames]);

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

    const payload = {
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
      result: "Pending"
    };

    const response = await fetch(`${import.meta.env.VITE_API_URL}/save-pick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      throw new Error("Backend did not return valid JSON");
    }

    if (!response.ok) {
      throw new Error(data.detail || data.message || "Failed to save pick");
    }

    return data;
  };

  const handleSaveAllPlays = async () => {
    if (playGames.length === 0) {
      setMessage("No plays available to save.");
      return;
    }

    setSaving(true);
    setMessage("Saving plays...");

    let savedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;

    for (const game of playGames) {
      try {
        const data = await saveToPicks(game);

        if (data.duplicate) {
          duplicateCount += 1;
        } else {
          savedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
      }
    }

    setSaving(false);
    setMessage(
      `Saved ${savedCount} plays` +
        (duplicateCount > 0 ? ` | ${duplicateCount} duplicates skipped` : "") +
        (failedCount > 0 ? ` | ${failedCount} failed` : "")
    );
  };

  const handleSaveOne = async (game) => {
    setMessage(`Saving ${game.pick}...`);

    try {
      const data = await saveToPicks(game);

      if (data.duplicate) {
        setMessage(`Duplicate skipped: ${game.pick}`);
      } else {
        setMessage(`Saved: ${game.pick} | ${game.market} | ${game.edge}%`);
      }
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
        <button
          className="save-game-button"
          onClick={handleSaveAllPlays}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save All Plays"}
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
