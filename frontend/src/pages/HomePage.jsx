import { useEffect, useState } from "react";

function HomePage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/picks/today")
      .then((response) => response.json())
      .then((json) => setData(json))
      .catch((error) => console.error("Error fetching data:", error));
  }, []);

  if (!data) {
    return (
      <div className="app">
        <h1>Sports Betting Analysis</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Sports Betting Analysis</h1>

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
      <div className="pod-card">
        <h3>{data.play_of_the_day.game}</h3>
        <p><strong>Pick:</strong> {data.play_of_the_day.pick}</p>
        <p><strong>Confidence:</strong> {data.play_of_the_day.confidence}</p>
        <p><strong>Units:</strong> {data.play_of_the_day.units}</p>
        <p><strong>Game Time:</strong> {data.play_of_the_day.time}</p>
        <p><strong>Reason:</strong> {data.play_of_the_day.reason}</p>
      </div>

      <h2>Other Picks</h2>
      <div className="picks-grid">
        {data.other_picks.map((pick, index) => (
          <div className="pick-card" key={index}>
            <h3>{pick.game}</h3>
            <p><strong>Pick:</strong> {pick.pick}</p>
            <p><strong>Confidence:</strong> {pick.confidence}</p>
            <p><strong>Units:</strong> {pick.units}</p>
            <p><strong>Game Time:</strong> {pick.time}</p>
            <p><strong>Reason:</strong> {pick.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default HomePage;
