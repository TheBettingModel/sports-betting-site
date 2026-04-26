import { useEffect, useState } from "react";

function ModelPerformancePage() {
  const [performance, setPerformance] = useState({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/model/performance`)
      .then((response) => response.json())
      .then((data) => {
        if (data.message) {
          setMessage(data.message);
        } else {
          setPerformance(data);
        }
      })
      .catch(() => {
        setMessage("Failed to load model performance");
      });
  }, []);

  return (
    <div className="app">
      <h1>Model Performance</h1>

      {message ? (
        <p>{message}</p>
      ) : Object.keys(performance).length === 0 ? (
        <p>No performance data yet.</p>
      ) : (
        <div className="picks-grid">
          {Object.entries(performance).map(([bucket, stats]) => (
            <div className="pick-card" key={bucket}>
              <h3>{bucket}% Model Probability</h3>
              <p><strong>Plays:</strong> {stats.plays}</p>
              <p><strong>Win Rate:</strong> {stats.win_rate}%</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ModelPerformancePage;
