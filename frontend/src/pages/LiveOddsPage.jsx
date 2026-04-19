import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function LiveOddsPage() {
  const [games, setGames] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

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

  const goToAddPick = ({ game, sportsbook, market, pick, odds }) => {
    navigate("/add-pick", {
      state: {
        game,
        sportsbook,
        market,
        pick,
        odds: String(odds),
      },
    });
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
          {games.map((game, index) => (
            <div className="pick-card" key={index}>
              <h3>
                {game.away_team} vs {game.home_team}
              </h3>

              <p><strong>Game Time:</strong> {formatDate(game.commence_time)}</p>

              <hr />

              {game.bookmakers && game.bookmakers.length > 0 ? (
                game.bookmakers.slice(0, 3).map((bookmaker, bookIndex) => {
                  const moneyline = getMarket(bookmaker, "h2h");
                  const spreads = getMarket(bookmaker, "spreads");
                  const totals = getMarket(bookmaker, "totals");

                  return (
                    <div key={bookIndex} style={{ marginBottom: "20px" }}>
                      <h4>{bookmaker.title}</h4>

                      <p><strong>Moneyline</strong></p>
                      {moneyline ? (
                        moneyline.outcomes.map((outcome, i) => (
                          <div key={`ml-${bookIndex}-${i}`} style={{ marginBottom: "8px" }}>
                            <p>
                              {outcome.name}: {outcome.price}
                            </p>
                            <button
                              className="save-game-button"
                              onClick={() =>
                                goToAddPick({
                                  game: `${game.away_team} vs ${game.home_team}`,
                                  sportsbook: bookmaker.title,
                                  market: "Moneyline",
                                  pick: outcome.name,
                                  odds: outcome.price,
                                })
                              }
                            >
                              Use This Moneyline
                            </button>
                          </div>
                        ))
                      ) : (
                        <p>No moneyline data</p>
                      )}

                      <p><strong>Spread</strong></p>
                      {spreads ? (
                        spreads.outcomes.map((outcome, i) => (
                          <div key={`spread-${bookIndex}-${i}`} style={{ marginBottom: "8px" }}>
                            <p>
                              {outcome.name}: {outcome.point} ({outcome.price})
                            </p>
                            <button
                              className="save-game-button"
                              onClick={() =>
                                goToAddPick({
                                  game: `${game.away_team} vs ${game.home_team}`,
                                  sportsbook: bookmaker.title,
                                  market: "Spread",
                                  pick: `${outcome.name} ${outcome.point > 0 ? "+" : ""}${outcome.point}`,
                                  odds: outcome.price,
                                })
                              }
                            >
                              Use This Spread
                            </button>
                          </div>
                        ))
                      ) : (
                        <p>No spread data</p>
                      )}

                      <p><strong>Total</strong></p>
                      {totals ? (
                        totals.outcomes.map((outcome, i) => (
                          <div key={`total-${bookIndex}-${i}`} style={{ marginBottom: "8px" }}>
                            <p>
                              {outcome.name}: {outcome.point} ({outcome.price})
                            </p>
                            <button
                              className="save-game-button"
                              onClick={() =>
                                goToAddPick({
                                  game: `${game.away_team} vs ${game.home_team}`,
                                  sportsbook: bookmaker.title,
                                  market: "Total",
                                  pick: `${outcome.name} ${outcome.point}`,
                                  odds: outcome.price,
                                })
                              }
                            >
                              Use This Total
                            </button>
                          </div>
                        ))
                      ) : (
                        <p>No total data</p>
                      )}

                      {bookIndex < game.bookmakers.slice(0, 3).length - 1 && <hr />}
                    </div>
                  );
                })
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
