import { TBMCard } from "../ui";
import "./MLBSlateCommandBar.css";

function value(v, fallback = "N/A") {
  return v === null || v === undefined || v === "" ? fallback : v;
}

function avg(plays, key) {
  const values = plays.map((p) => Number(p?.[key])).filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function bestEdge(plays) {
  return [...plays].sort((a, b) => (Number(b.edge) || 0) - (Number(a.edge) || 0))[0];
}

export default function MLBSlateCommandBar({ plays = [], f5Count = 0, nrfiCount = 0 }) {
  const top = bestEdge(plays);

  return (
    <TBMCard className="mlb-slate-command">
      <div className="mlb-slate-command-left">
        <span>Live Slate Command Center</span>
        <strong>{plays.length} MLB Opportunities</strong>
        <small>Full game, run line, totals, first five, and NRFI/YRFI markets</small>
      </div>

      <div className="mlb-slate-command-grid">
        <div>
          <span>Best Edge</span>
          <strong>{value(top?.edge)}%</strong>
        </div>

        <div>
          <span>Avg Confidence</span>
          <strong>{avg(plays, "confidence").toFixed(0)}%</strong>
        </div>

        <div>
          <span>F5 Plays</span>
          <strong>{f5Count}</strong>
        </div>

        <div>
          <span>NRFI/YRFI</span>
          <strong>{nrfiCount}</strong>
        </div>

        <div>
          <span>Top Book</span>
          <strong>{value(top?.best_sportsbook || top?.sportsbook)}</strong>
        </div>
      </div>
    </TBMCard>
  );
}
