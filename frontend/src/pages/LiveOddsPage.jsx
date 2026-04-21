import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function LiveOddsPage() {
  const [games, setGames] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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

    const market = bookmaker.markets.find((market) => market.key === key);

    if (!market || !market.outcomes || market.outcomes.length === 0) {
      return null;
    }

    return market;
  };

  const calculateImpliedProbability = (odds) => {
    const oddsValue = parseFloat(odds);

    if (isNaN(oddsValue) || oddsValue === 0) return "";

    let implied = 0;

    if (oddsValue > 0) {
      implied = 100 / (oddsValue + 100);
    } else {
      implied = Math.abs(oddsValue) / (Math.abs(oddsValue) + 100);
    }

    return (implied * 100).toFixed(1);
  };

  const calculateConfidence = (edgeValue) => {
    const edge = parseFloat(edgeValue);

    if (isNaN(edge)) return 50;
    return Math.min(95, Math.max(50, Number((52 + edge * 2).toFixed(1))));
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

  const saveDirectly = async ({ game, sportsbook, market, pick, odds }) => {
    const impliedProbability = parseFloat(calculateImpliedProbability(odds));

    if (isNaN(impliedProbability)) {
      setMessage("Could not calculate implied probability");
      return;
    }

    let modelProbability = impliedProbability + 3;

    if (market === "Spread") {
      modelProbability = impliedProbability + 2;
    }

    if (market === "Total") {
      modelProbability = 50;
    }

    const edge = Number((modelProbability - impliedProbability).toFixed(1));
    const confidence = calculateConfidence(edge);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/save-pick`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          game,
          pick,
          market,
          sportsbook,
          odds: String(odds),
          confidence,
          stake: "1 Unit",
          model_probability: Number(modelProbability.toFixed(1)),
          implied_probability: Number(impliedProbability.toFixed(1)),
          edge,
          recommendation: edge >= 2 ? "Play" : edge >= 0.5 ? "Lean" : "Pass",
          result: "Pending",
          notes: ""
        })
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        throw new Error("Backend did not return valid JSON");
      }

      if (!response.ok) {
        setMessage(data.detail || data.message || "Failed to save pick");
        return;
      }

      if (data.duplicate) {
        setMessage(`Duplicate skipped: ${pick} (${odds})`);
      } else {
        setMessage(
          `Saved: ${pick} (${odds}) | Model ${modelProbability.toFixed(1)}% | Edge ${edge}% | Confidence ${confidence}%`
        );
      }
    } catch (error) {
      setMessage(error.message || "Error saving pick");
    }
  };

  return (
    <div className="app">
      <h1>Today’s NBA Games</h1>

      {message && <p>{message}</p>}

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
                game.bookmakers.map((bookmaker, bookIndex) => {
                  const moneyline = getMarket(bookmaker, "h2h");
                  const spreads = getMarket(bookmaker, "spreads");
                  const totals = getMarket(bookmaker, "totals");

                  return (
                    <div key={bookIndex} style={{ marginBottom: "20px" }}>
                      <h4>{bookmaker.title}</h4>

                      <p><strong>Moneyline</strong></p>
                      {moneyline ? (
                        moneyline.outcomes.map((outcome, i) => (
                          <div key={`ml-${bookIndex}-${i}`} style={{ marginBottom: "12px" }}>
                            <p>{outcome.name}: {outcome.price}</p>
                            <div className="result-buttons">
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
                                Prefill
                              </button>
                              <button
                                className="save-game-button"
                                onClick={() =>
                                  saveDirectly({
                                    game: `${game.away_team} vs ${game.home_team}`,
                                    sportsbook: bookmaker.title,
                                    market: "Moneyline",
                                    pick: outcome.name,
                                    odds: outcome.price,
                                  })
                                }
                              >
                                Save Now
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p>No moneyline data from this sportsbook</p>
                      )}

                      <p><strong>Spread</strong></p>
                      {spreads ? (
                        spreads.outcomes.map((outcome, i) => (
                          <div key={`spread-${bookIndex}-${i}`} style={{ marginBottom: "12px" }}>
                            <p>{outcome.name}: {outcome.point} ({outcome.price})</p>
                            <div className="result-buttons">
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
                                Prefill
                              </button>
                              <button
                                className="save-game-button"
                                onClick={() =>
                                  saveDirectly({
                                    game: `${game.away_team} vs ${game.home_team}`,
                                    sportsbook: bookmaker.title,
                                    market: "Spread",
                                    pick: `${outcome.name} ${outcome.point > 0 ? "+" : ""}${outcome.point}`,
                                    odds: outcome.price,
                                  })
                                }
                              >
                                Save Now
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p>No spread data from this sportsbook</p>
                      )}

                      <p><strong>Total</strong></p>
                      {totals ? (
                        totals.outcomes.map((outcome, i) => (
                          <div key={`total-${bookIndex}-${i}`} style={{ marginBottom: "12px" }}>
                            <p>{outcome.name}: {outcome.point} ({outcome.price})</p>
                            <div className="result-buttons">
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
                                Prefill
                              </button>
                              <button
                                className="save-game-button"
                                onClick={() =>
                                  saveDirectly({
                                    game: `${game.away_team} vs ${game.home_team}`,
                                    sportsbook: bookmaker.title,
                                    market: "Total",
                                    pick: `${outcome.name} ${outcome.point}`,
                                    odds: outcome.price,
                                  })
                                }
                              >
                                Save Now
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p>No total data from this sportsbook</p>
                      )}

                      {bookIndex < game.bookmakers.length - 1 && <hr />}
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
