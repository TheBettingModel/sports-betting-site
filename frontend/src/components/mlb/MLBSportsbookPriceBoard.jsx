import { TBMCard } from "../ui";
import TBMSportsbookBadge from "../logos/TBMSportsbookBadge";
import "./MLBSportsbookPriceBoard.css";

function value(v, fallback = "N/A") {
  return v === null || v === undefined || v === "" ? fallback : v;
}

function fmtOdds(v) {
  if (v === null || v === undefined || v === "") return "N/A";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return n > 0 ? `+${n}` : `${n}`;
}

function bestPricePlays(plays = []) {
  return [...plays]
    .filter((p) => p.best_sportsbook || p.best_odds || p.line_shop_value)
    .sort((a, b) => (Number(b.line_shop_value) || 0) - (Number(a.line_shop_value) || 0))
    .slice(0, 6);
}

export default function MLBSportsbookPriceBoard({ plays = [] }) {
  const rows = bestPricePlays(plays);

  return (
    <TBMCard className="mlb-price-card">
      <div className="mlb-price-header">
        <div>
          <span>Sportsbook Price Board</span>
          <h2>Best available lines</h2>
        </div>
        <strong>Shop Lines</strong>
      </div>

      <div className="mlb-price-table">
        <div className="mlb-price-head">
          <span>Pick</span>
          <span>Best Book</span>
          <span>Best Odds</span>
          <span>Worst Odds</span>
          <span>Value</span>
        </div>

        {rows.length > 0 ? (
          rows.map((play, index) => (
            <div className="mlb-price-row" key={`${play.game}-${play.pick}-${index}`}>
              <div>
                <strong>{value(play.pick)}</strong>
                <span>{value(play.game)}</span>
              </div>

              <TBMSportsbookBadge book={play.best_sportsbook || play.sportsbook} />

              <em className="best">{fmtOdds(play.best_odds || play.odds)}</em>
              <em>{fmtOdds(play.worst_odds)}</em>
              <small>{value(play.line_shop_value)}</small>
            </div>
          ))
        ) : (
          <div className="mlb-price-empty">No sportsbook comparison data available.</div>
        )}
      </div>
    </TBMCard>
  );
}
