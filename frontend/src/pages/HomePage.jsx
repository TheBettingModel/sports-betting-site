import { useEffect, useState } from "react";

function HomePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/picks/today`)
      .then((res) => res.json())
      .then((data) => {
        setData(data);
      })
      .catch(() => {
        setError("Failed to load data");
      });
  }, []);

  if (error) {
    return <div className="app"><h1>{error}</h1></div>;
  }

  if (!data) {
    return <div className="app"><h1>Loading...</h1></div>;
  }

  return (
    <div className="app">
      <h1>Today’s Picks</h1>

      <div className="summary-bar">
        <div className="summary-card">
          <h3>Record</h3>
          <p>{data.record}</p>
        </div>

        <div className="summary-card">
          <h3>Units</h3>
          <p>{data.units}</p>
        </div>
      </div>

      <h2>Play of the Day</h2>

      {data.play_of_the_day ? (
        <div className="pod-card">
          <h3>{data.play_of_the_day.game}</h3>
          <p><strong>Pick:</strong> {data.play_of_the_day.pick}</p>
          <p><strong>Confidence:</strong> {data.play_of_the_day.confidence}</p>
          <p><strong>Units:</strong> {data.play_of_the_day.units}</p>
        </div>
      ) : (
        <p>No play available</p>
      )}

      <h2>Other Picks</h2>

      {data.other_picks && data.other_picks.length > 0 ? (
        <div className="picks-grid">
          {data.other_picks.map((pick, index) => (
            <div className="pick-card" key={index}>
              <h3>{pick.game}</h3>
              <p><strong>Pick:</strong> {pick.pick}</p>
              <p><strong>Confidence:</strong> {pick.confidence}</p>
              <p><strong>Units:</strong> {pick.units}</p>
            </div>
          ))}
        </div>
      ) : (
        <p>No other picks</p>
      )}
    </div>
  );
}

export default HomePage;
