import { useEffect, useState } from "react";

function SavedPicksPage() {
  const [picks, setPicks] = useState([]);

  const calculateNetUnits = () => {
    return picks.reduce((total, pick) => {
      const unitValue = parseFloat(pick.units);
      const oddsValue = parseFloat(pick.odds);

      if (isNaN(unitValue) || isNaN(oddsValue)) return total;

      if (pick.result === "Win") {
        if (oddsValue > 0) {
          return total + unitValue * (oddsValue / 100);
        } else {
          return total + unitValue * (100 / Math.abs(oddsValue));
        }
      }

      if (pick.result === "Loss") {
        return total - unitValue;
      }

      return total;
    }, 0);
  };

  const calculateWinRate = () => {
    const wins = picks.filter((p) => p.result === "Win").length;
    const losses = picks.filter((p) => p.result === "Loss").length;

    const total = wins + losses;

    if (total === 0) return "0%";

    return `${((wins / total) * 100).toFixed(1)}%`;
  };

  const fetchSavedPicks = () => {
    fetch(`${import.meta.env.VITE_API_URL}/saved-picks`)
      .then((response) => response.json())
      .then((data) => setPicks(data.saved_picks || []))
      .catch((error) => console.error("Error fetching saved picks:", error));
  };

  useEffect(() => {
    fetchSavedPicks();
  }, []);

  const handleDelete = async (pickId) => {
    await fetch(`${import.meta.env.VITE_API_URL}/saved-picks`), {
      method: "DELETE"
    });

    fetchSavedPicks();
  };

  const handleUpdateResult = async (pickId, result) => {
    await fetch(`http://127.0.0.1:8000/update-result/${pickId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ result })
    });

    fetchSavedPicks();
  };

  const getConfidenceClass = (confidence) => {
    if (confidence === "A") return "grade-a";
    if (confidence === "B+" || confidence === "B") return "grade-b";
    if (confidence === "C") return "grade-c";
    return "grade-d";
  };

  const getEdgeClass = (edge) => {
    const edgeValue = parseFloat(edge);

    if (edgeValue >= 7) return "edge-high";
    if (edgeValue >= 5) return "edge-medium";
    if (edgeValue >= 3) return "edge-low";
    return "edge-very-low";
  };

  return (
    <div className="app">
      <h1>Saved Picks</h1>

      <div className="summary-bar">
        <div className="summary-card">
          <h3>Wins</h3>
          <p>{picks.filter((pick) => pick.result === "Win").length}</p>
        </div>

        <div className="summary-card">
          <h3>Losses</h3>
          <p>{picks.filter((pick) => pick.result === "Loss").length}</p>
        </div>

        <div className="summary-card">
          <h3>Pushes</h3>
          <p>{picks.filter((pick) => pick.result === "Push").length}</p>
        </div>

        <div className="summary-card">
          <h3>Net Units</h3>
          <p>{calculateNetUnits().toFixed(2)}</p>
        </div>

        <div className="summary-card">
          <h3>Win Rate</h3>
          <p>{calculateWinRate()}</p>
        </div>
      </div>

      {picks.length === 0 ? (
        <p>No saved picks yet.</p>
      ) : (
        <div className="picks-grid">
          {picks.map((pick) => (
            <div className="pick-card" key={pick.id}>
              <h3>{pick.game}</h3>
              <p><strong>Pick:</strong> {pick.pick}</p>
              <p><strong>Market:</strong> {pick.market}</p>
              <p><strong>Sportsbook:</strong> {pick.sportsbook}</p>
              <p><strong>Odds:</strong> {pick.odds}</p>

              <p>
                <strong>Confidence:</strong>{" "}
                <span className={getConfidenceClass(pick.confidence)}>
                  {pick.confidence}
                </span>
              </p>

              <p><strong>Units:</strong> {pick.units}</p>
              <p><strong>Model Probability:</strong> {pick.model_probability}</p>
              <p><strong>Implied Probability:</strong> {pick.implied_probability}</p>

              <p>
                <strong>Edge:</strong>{" "}
                <span className={getEdgeClass(pick.edge)}>
                  {pick.edge}
                </span>
              </p>

              <p><strong>Result:</strong> {pick.result}</p>

              <div className="result-buttons">
                <button onClick={() => handleUpdateResult(pick.id, "Win")}>
                  Win
                </button>
                <button onClick={() => handleUpdateResult(pick.id, "Loss")}>
                  Loss
                </button>
                <button onClick={() => handleUpdateResult(pick.id, "Push")}>
                  Push
                </button>
              </div>

              <button
                className="delete-button"
                onClick={() => handleDelete(pick.id)}
              >
                Delete Pick
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SavedPicksPage;

