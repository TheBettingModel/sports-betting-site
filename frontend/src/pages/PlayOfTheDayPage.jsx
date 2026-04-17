import { useEffect, useState } from "react";

function PlayOfTheDayPage() {
  const [pick, setPick] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/play-of-the-day")
      .then((response) => response.json())
      .then((data) => {
        if (data.play_of_the_day) {
          setPick(data.play_of_the_day);
        } else {
          setError(data.message || "No play of the day found.");
        }
      })
      .catch(() => setError("Could not load play of the day."));
  }, []);

  return (
    <div className="app">
      <h1>Play of the Day</h1>

      {error ? (
        <p>{error}</p>
      ) : !pick ? (
        <p>Loading play of the day...</p>
      ) : (
        <div className="pod-card">
          <h3>{pick.game}</h3>
          <p><strong>Pick:</strong> {pick.pick}</p>
          <p><strong>Market:</strong> {pick.market}</p>
          <p><strong>Sportsbook:</strong> {pick.sportsbook}</p>
          <p><strong>Odds:</strong> {pick.odds}</p>
          <p><strong>Confidence:</strong> {pick.confidence}</p>
          <p><strong>Units:</strong> {pick.units}</p>
          <p><strong>Model Probability:</strong> {pick.model_probability}</p>
          <p><strong>Implied Probability:</strong> {pick.implied_probability}</p>
          <p><strong>Edge:</strong> {pick.edge}</p>
          <p><strong>Result:</strong> {pick.result}</p>
        </div>
      )}
    </div>
  );
}

export default PlayOfTheDayPage;
