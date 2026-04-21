import { useEffect, useState } from "react";

function HomePage() {
  const [data, setData] = useState({
    record: "0-0",
    units: "0.00",
    play_of_the_day: null,
    other_picks: []
  });
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/picks`)
      .then((res) => res.json())
      .then((picks) => {
        if (!Array.isArray(picks)) {
          setError("Failed to load data");
          return;
        }

        const pendingPicks = picks.filter(
          (pick) => String(pick.result || "").trim() === "Pending"
        );

        const sortedPicks = [...pendingPicks].sort((a, b) => {
          const aEdge = parseFloat(String(a.edge || "").replace("%", "")) || 0;
          const bEdge = parseFloat(String(b.edge || "").replace("%", "")) || 0;
          return bEdge - aEdge;
        });

        const wins = picks.filter((pick) => pick.result === "Win").length;
        const losses = picks.filter((pick) => pick.result === "Loss").length;

        const netUnits = picks.reduce((total, pick) => {
          const unitValue = parseFloat(
            String(pick.units || "").replace(" Units", "").replace(" Unit", "")
          );
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

        const playOfTheDay = sortedPicks.length > 0 ? sortedPicks[0] : null;
        const otherPicks = sortedPicks.slice(1);

        setData({
          record: `${wins}-${losses}`,
          units: netUnits.toFixed(2),
          play_of_the_day: playOfTheDay,
          other_picks: otherPicks
        });
      })
      .catch(() => {
        setError("Failed to load data");
      });
  }, []);

  if (error) {
    return (
      <div className="app">
        <h1>{error}</h1>
      </div>
    );
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
          <p><strong>Market:</strong> {data.play_of_the_day.market}</p>
          <p><strong>Sportsbook:</strong> {data.play_of_the_day.sportsbook}</p>
          <p><strong>Confidence:</strong> {data.play_of_the_day.confidence}</p>
          <p><strong>Units:</strong> {data.play_of_the_day.units}</p>
          <p><strong>Edge:</strong> {data.play_of_the_day.edge}</p>
        </div>
      ) : (
        <p>No play available</p>
      )}

      <h2>Other Picks</h2>

      {data.other_picks.length > 0 ? (
        <div className="picks-grid">
          {data.other_picks.map((pick, index) => (
            <div className="pick-card" key={index}>
              <h3>{pick.game}</h3>
              <p><strong>Pick:</strong> {pick.pick}</p>
              <p><strong>Market:</strong> {pick.market}</p>
              <p><strong>Sportsbook:</strong> {pick.sportsbook}</p>
              <p><strong>Confidence:</strong> {pick.confidence}</p>
              <p><strong>Units:</strong> {pick.units}</p>
              <p><strong>Edge:</strong> {pick.edge}</p>
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
