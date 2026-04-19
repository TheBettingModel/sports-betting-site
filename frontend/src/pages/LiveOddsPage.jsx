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

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const getMarket = (bookmaker, key) => {
    if (!bookmaker || !bookmaker.markets) return null;
    return bookmaker.markets.find((market) => market.key === key);
  };

  return (
    <div className="app">
      <h1>Today’s NBA Games</h1>

      {error ? (
        <p>{error}</p>
      ) : games.length === 0 ? (
        <p>Loading odds...</p>
      ) : (
        <div className="picks-grid">
          {games.map((game, index) => {
            const bookmaker = game.bookmakers?.[0];
            const moneyline = getMarket(bookmaker, "h2h");
            const spreads = getMarket(bookmaker, "spreads");
            const totals = getMarket(bookmaker, "totals");

            return (
              <div className="pick-card" key={index}>
                <h3>
                  {game.away_team} vs {game.home_team}
                </h3>

                <p><strong>Game Time:</strong> {formatDate(game.commence_time)}</p>
                <p><strong>Sportsbook:</strong> {bookmaker?.title || "N/A"}</p>

                <hr />

                <h4>Moneyline</h4>
                {moneyline ? (
                  moneyline.outcomes.map((outcome, i) => (
                    <p key={`ml-${i}`}>
                      {outcome.name}: {outcome.price}
                    </p>
                  ))
                ) : (
                  <p>No moneyline data</p>
                )}

                <h4>Spread</h4>
                {spreads ? (
                  spreads.outcomes.map((outcome, i) => (
                    <p key={`spread-${i}`}>
                      {outcome.name}: {outcome.point} ({outcome.price})
                    </p>
                  ))
                ) : (
                  <p>No spread data</p>
                )}

                <h4>Total</h4>
                {totals ? (
                  totals.outcomes.map((outcome, i) => (
                    <p key={`total-${i}`}>
                      {outcome.name}: {outcome.point} ({outcome.price})
                    </p>
                  ))
                ) : (
                  <p>No total data</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default LiveOddsPage;
