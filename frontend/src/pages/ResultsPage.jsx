import { useEffect, useState } from "react";

function ResultsPage() {
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/results`)
      .then((response) => response.json())
      .then((data) => {
        setResults(data.results || []);
      })
      .catch(() => {
        setError("Failed to load results");
      });
  }, []);

  const getResultClass = (result) => {
    if (result === "Win") return "edge-high";
    if (result === "Loss") return "edge-very-low";
    if (result === "Push") return "edge-medium";
    return "";
  };

  if (error) {
    return (
      <div className="app">
        <h1>{error}</h1>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Results</h1>

      {results.length === 0 ? (
        <p>No results available.</p>
      ) : (
        <div className="picks-grid">
          {results.map((result, index) => (
            <div className="pick-card" key={index}>
              <h3>{result.game}</h3>
              <p><strong>Pick:</strong> {result.pick}</p>
              <p><strong>Market:</strong> {result.market || "N/A"}</p>
              <p><strong>Sportsbook:</strong> {result.sportsbook || "N/A"}</p>
              <p><strong>Odds:</strong> {result.odds || "N/A"}</p>
              <p><strong>Units:</strong> {result.units_won}</p>
              <p>
                <strong>Result:</strong>{" "}
                <span className={getResultClass(result.result)}>
                  {result.result}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ResultsPage;
