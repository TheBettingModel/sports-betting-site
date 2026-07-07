import { TBMCard } from "../ui";
import "./MLBWeatherParkCenter.css";

function value(v, fallback = "N/A") {
  return v === null || v === undefined || v === "" ? fallback : v;
}

function weatherPlays(plays = []) {
  return [...plays]
    .filter((p) => p.weather_risk || p.ballpark || p.run_factor || p.hr_factor)
    .sort((a, b) => (Number(b.edge) || 0) - (Number(a.edge) || 0))
    .slice(0, 5);
}

export default function MLBWeatherParkCenter({ plays = [] }) {
  const rows = weatherPlays(plays);

  return (
    <TBMCard className="mlb-weather-card">
      <div className="mlb-weather-header">
        <div>
          <span>Weather & Park Center</span>
          <h2>Run environment impact</h2>
        </div>
        <strong>{rows.length} Games</strong>
      </div>

      <div className="mlb-weather-table">
        <div className="mlb-weather-head">
          <span>Game</span>
          <span>Park</span>
          <span>Run Factor</span>
          <span>HR Factor</span>
          <span>Risk</span>
        </div>

        {rows.length > 0 ? (
          rows.map((play, index) => (
            <div className="mlb-weather-row" key={`${play.game}-${index}`}>
              <strong>{value(play.game)}</strong>
              <span>{value(play.ballpark)}</span>
              <em>{value(play.run_factor)}</em>
              <em>{value(play.hr_factor)}</em>
              <small>{value(play.weather_risk)}</small>
            </div>
          ))
        ) : (
          <div className="mlb-weather-empty">No weather or park data available.</div>
        )}
      </div>
    </TBMCard>
  );
}
