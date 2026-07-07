import { TBMCard } from "../ui";
import "./MLBSharpMoneyMeter.css";

function score(play) {
  return Number(play?.sharp_score || play?.sharp_book_score || 0);
}

function getSharpPlays(plays = []) {
  return [...plays]
    .filter((p) =>
      String(p.sharp_signal || p.sharp_book_signal || "").toLowerCase().includes("sharp") ||
      score(p) > 0
    )
    .sort((a, b) => score(b) - score(a))
    .slice(0, 5);
}

export default function MLBSharpMoneyMeter({ plays = [] }) {
  const sharpPlays = getSharpPlays(plays);
  const meter = Math.min(100, Math.max(8, sharpPlays.length * 18));

  return (
    <TBMCard className="mlb-sharp-card">
      <div className="mlb-sharp-header">
        <div>
          <span>Sharp Money Meter</span>
          <h2>Respected market activity</h2>
        </div>
        <strong>{sharpPlays.length} Signals</strong>
      </div>

      <div className="mlb-sharp-meter">
        <div className="mlb-sharp-track">
          <i style={{ width: `${meter}%` }} />
        </div>
        <div className="mlb-sharp-scale">
          <span>Low</span>
          <span>Moderate</span>
          <span>Heavy</span>
        </div>
      </div>

      <div className="mlb-sharp-list">
        {sharpPlays.length > 0 ? (
          sharpPlays.map((play, index) => (
            <div className="mlb-sharp-row" key={`${play.game}-${play.pick}-${index}`}>
              <div>
                <strong>{play.pick || play.game}</strong>
                <span>{play.game}</span>
              </div>
              <em>{play.sharp_signal || play.sharp_book_signal || "Sharp Watch"}</em>
            </div>
          ))
        ) : (
          <div className="mlb-sharp-empty">No major sharp money signals yet.</div>
        )}
      </div>
    </TBMCard>
  );
}
