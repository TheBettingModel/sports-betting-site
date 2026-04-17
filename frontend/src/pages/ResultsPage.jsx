import { useEffect, useState } from "react";

function ResultsPage() {
  const [results, setResults] = useState([]);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/results")
      .then((response) => response.json())
      .then((data) => setResults(data.results))
      .catch((error) => console.error("Error fetching results:", error));
  }, []);

  return (
    <div className="app">
      <h1>Results</h1>

      {results.length === 0 ? (
        <p>Loading results...</p>
      ) : (
        <div className="picks-grid">
          {results.map((result, index) => (
            <div className="pick-card" key={index}>
              <h3>{result.game}</h3>
              <p><strong>Date:</strong> {result.date}</p>
              <p><strong>Pick:</strong> {result.pick}</p>
              <p><strong>Result:</strong> {result.result}</p>
              <p><strong>Units:</strong> {result.units_won}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ResultsPage;
