import { TBMCard } from "../ui";
import "./MLBLineMovementTracker.css";

function fmtOdds(v) {
  if (v === null || v === undefined || v === "") return "N/A";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return n > 0 ? `+${n}` : `${n}`;
}

function movementRows(plays = []) {
  return [...plays]
    .filter((p) => p.opening_odds || p.open_odds || p.current_odds || p.line_movement_signal)
    .slice(0, 7);
}

export default function MLBLineMovementTracker({ plays = [] }) {
  const rows = movementRows(plays);

  return (
    <TBMCard className="mlb-line-card">
      <div className="mlb-line-header">
        <div>
          <span>Line Movement Tracker</span>
          <h2>Opening line vs current market</h2>
        </div>
        <strong>Live</strong>
      </div>

      <div className="mlb-line-list">
        {rows.length > 0 ? (
          rows.map((play, index) => {
            const open = play.opening_odds ?? play.open_odds;
            const current = play.current_odds ?? play.best_odds ?? play.odds;

            return (
              <div className="mlb-line-row" key={`${play.game}-${play.pick}-${index}`}>
                <div className="mlb-line-game">
                  <strong>{play.pick || play.game}</strong>
                  <span>{play.game}</span>
                </div>

                <div className="mlb-line-move">
                  <span>{fmtOdds(open)}</span>
                  <i />
                  <strong>{fmtOdds(current)}</strong>
                </div>

                <em>{play.line_movement_signal || play.market_timing_signal || "Movement Watch"}</em>
              </div>
            );
          })
        ) : (
          <div className="mlb-line-empty">No line movement data available yet.</div>
        )}
      </div>
    </TBMCard>
  );
}
