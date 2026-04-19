import { useEffect, useState } from "react";

function LiveOddsPage() {
  const [games, setGames] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/get-nba-odds`)
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setGames(data);
        } else {
          setError("Failed to load odds");
        }
      })
      .catch(() => {
        setError("Failed to load odds");
      });
  }, []);

  return (
    <div className="app">
      <h1>Live NBA Odds</h1>

      {error ? (
        <p>{error}</p>
      ) : games.length === 0 ? (
        <p>Loading odds...</p>
      ) : (
        <div className="picks-grid">
          {games.map((game, index) => (
            <div className="pick-card" key={index}>
              <h3>{game.away_team} vs {game.home_team}</h3>
              <p><strong>Commence Time:</strong> {game.commence_time}</p>

              {game.bookmakers && game.bookmakers.length > 0 ? (
                <div>
                  <p><strong>Sportsbook:</strong> {game.bookmakers[0].title}</p>

                  {game.bookmakers[0].markets.map((market, marketIndex) => (
                    <div key={marketIndex}>
                      <p><strong>Market:</strong> {market.key}</p>
                      {market.outcomes.map((outcome, outcomeIndex) => (
                        <p key={outcomeIndex}>
                          {outcome.name}: {outcome.price}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <p>No sportsbook data available</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default LiveOddsPage;
