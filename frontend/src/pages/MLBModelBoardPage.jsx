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
        console.error("MLB model error:", err);
        setLoading(false);
      });
  }, [API_URL]);

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
        alert("Pick already saved.");
      } else {
        alert("Pick saved successfully.");
      }
    } catch (error) {
      console.error(error);
      alert("Error saving pick.");
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", color: "white" }}>
        <h2>Loading MLB Model...</h2>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", color: "white" }}>
      <h1>MLB Model Board</h1>

      {plays.length === 0 ? (
        <p>No MLB plays available today.</p>
      ) : (
        plays.map((play, index) => (
          <div
            key={index}
            style={{
              border: "1px solid #374151",
              borderRadius: "10px",
              padding: "20px",
              marginBottom: "20px",
              backgroundColor: "#111827"
            }}
          >
            <h2>{play.game}</h2>

            <h3>
              {play.recommendation}: {play.pick}
            </h3>

            <p>
              <strong>Market:</strong> {play.market}
            </p>

            <p>
              <strong>Sportsbook:</strong> {play.sportsbook}
            </p>

            <p>
              <strong>Odds:</strong> {play.odds}
            </p>

            <p>
              <strong>Units:</strong> {play.units}u
            </p>

            <hr />

            <h3>Model Edge</h3>

            <p>
              <strong>Implied Probability:</strong>{" "}
              {play.implied_probability}%
            </p>

            <p>
              <strong>Model Probability:</strong>{" "}
              {play.model_probability}%
            </p>

            <p>
              <strong>Edge:</strong> {play.edge}%
            </p>

            <p>
              <strong>Confidence:</strong> {play.confidence}
            </p>

            <p>
              <strong>Market Adjustment:</strong>{" "}
              {play.market_adjustment ?? "N/A"}
            </p>

            <hr />

            <h3>Starting Pitcher</h3>

            <p>
              <strong>Pitcher:</strong>{" "}
              {play.starting_pitcher || "TBD"}
            </p>

            <p>
              <strong>ERA:</strong> {play.pitcher_era}
            </p>

            <p>
              <strong>WHIP:</strong> {play.pitcher_whip}
            </p>

            <p>
              <strong>Pitcher Rating:</strong>{" "}
              {play.pitcher_rating}
            </p>

            <p>
              <strong>Opponent:</strong>{" "}
              {play.opponent || "N/A"}
            </p>

            <p>
              <strong>Opponent Pitcher Rating:</strong>{" "}
              {play.opponent_pitcher_rating ?? "N/A"}
            </p>

            <p>
              <strong>Pitcher Rating Differential:</strong>{" "}
              {play.pitcher_rating_diff ?? "N/A"}
            </p>

            <p>
              <strong>Pitcher Diff Adjustment:</strong>{" "}
              {play.pitcher_diff_adjustment ?? "N/A"}
            </p>

            <hr />

            <h3>Bullpen</h3>

            <p>
              <strong>Bullpen Status:</strong>{" "}
              {play.bullpen_status}
            </p>

            <p>
              <strong>Bullpen Fatigue:</strong>{" "}
              {play.bullpen_fatigue}
            </p>

            <p>
              <strong>Bullpen ERA:</strong>{" "}
              {play.bullpen_era}
            </p>

            <hr />

            <h3>Reason</h3>

            <p>{play.reason}</p>

            <p>
              <strong>Model Version:</strong>{" "}
              {play.model_version}
            </p>

            <button
              onClick={() => savePick(play)}
              style={{
                marginTop: "10px",
                padding: "10px 15px",
                backgroundColor: "#22c55e",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "bold"
              }}
            >
              Save Pick
            </button>
          </div>
        ))
      )}
    </div>
  );
}

export default MLBModelBoardPage;

