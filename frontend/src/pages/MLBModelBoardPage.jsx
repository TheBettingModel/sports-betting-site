import { useEffect, useState } from "react";

function MLBModelBoardPage() {
  const [plays, setPlays] = useState([]);
  const [loading, setLoading] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    fetch(`${API_URL}/model/mlb/today`)
      .then((res) => res.json())
      .then((data) => {
        setPlays(data.plays || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const savePick = async (play) => {
    try {
      const response = await fetch(`${API_URL}/save-pick`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(play)
      });

      const data = await response.json();

      if (data.duplicate) {
        alert("Pick already saved");
      } else {
        alert("Pick saved successfully");
      }
    } catch (error) {
      console.error(error);
      alert("Error saving pick");
    }
  };

  if (loading) {
    return <h2>Loading MLB Model...</h2>;
  }

  return (
    <div>
      {plays.map((play, index) => (
        <div
          key={index}
          style={{
            border: "1px solid white",
            padding: "15px",
            marginBottom: "15px"
          }}
        >
          <h3>{play.game}</h3>
          <p><strong>Pick:</strong> {play.pick}</p>
          <p><strong>Market:</strong> {play.market}</p>
          <p><strong>Sportsbook:</strong> {play.sportsbook}</p>
          <p><strong>Odds:</strong> {play.odds}</p>
          <p><strong>Implied Probability:</strong> {play.implied_probability}%</p>
          <p><strong>Model Probability:</strong> {play.model_probability}%</p>
          <p><strong>Edge:</strong> {play.edge}%</p>
          <p><strong>Confidence:</strong> {play.confidence}</p>
          <p><strong>Units:</strong> {play.units}</p>
          <p><strong>Recommendation:</strong> {play.recommendation}</p>
          <p><strong>Reason:</strong> {play.reason}</p>

          <button onClick={() => savePick(play)}>
            Save Pick
          </button>
        </div>
      ))}
    </div>
  );
}

export default MLBModelBoardPage;
