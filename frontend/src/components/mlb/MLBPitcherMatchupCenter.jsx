import { TBMCard } from "../ui";
import "./MLBPitcherMatchupCenter.css";

function value(v, fallback = "N/A") {
  return v === null || v === undefined || v === "" ? fallback : v;
}

function topPitcherEdges(plays = []) {
  return [...plays]
    .sort((a, b) => {
      const bScore = Number(b.pitcher_rating_diff || b.pitcher_rating || b.combined_pitcher_rating || 0);
      const aScore = Number(a.pitcher_rating_diff || a.pitcher_rating || a.combined_pitcher_rating || 0);
      return bScore - aScore;
    })
    .slice(0, 4);
}

export default function MLBPitcherMatchupCenter({ plays = [] }) {
  const edges = topPitcherEdges(plays);

  return (
    <TBMCard className="mlb-pitcher-center">
      <div className="mlb-pitcher-title">
        <span>Pitcher Matchup Center</span>
        <h2>Top starter advantages today</h2>
      </div>

      <div className="mlb-pitcher-list">
        {edges.length > 0 ? (
          edges.map((play, index) => (
            <div className="mlb-pitcher-row" key={`${play.game}-${play.pick}-${index}`}>
              <div className="mlb-pitcher-rank">{index + 1}</div>

              <div className="mlb-pitcher-info">
                <strong>{value(play.starting_pitcher || play.away_starter || play.home_starter)}</strong>
                <span>{value(play.game)}</span>
              </div>

              <div className="mlb-pitcher-metrics">
                <div>
                  <span>Rating</span>
                  <strong>{value(play.pitcher_rating || play.combined_pitcher_rating)}</strong>
                </div>
                <div>
                  <span>Diff</span>
                  <strong>{value(play.pitcher_rating_diff)}</strong>
                </div>
                <div>
                  <span>Edge</span>
                  <strong>{value(play.edge)}%</strong>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="mlb-pitcher-empty">No pitcher matchup data available.</div>
        )}
      </div>
    </TBMCard>
  );
}
