import { useEffect, useState } from "react";

function ModelBoardPage() {
  const [games, setGames] = useState([]);
  const [error, setError] = useState("");

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
    if (confidence === "B+") return "grade-b";
    if (confidence === "B") return "grade-b";
    if (confidence === "C") return "grade-c";
    return "grade-d";
  };

  return (
    <div className="app">
      <h1>NBA Model Board</h1>

      {error ? (
        <p>{error}</p>
      ) : games.length === 0 ? (
        <p>Loading model board...</p>
      ) : (
        <div className="picks-grid">
          {games.map((game, index) => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ModelBoardPage;
