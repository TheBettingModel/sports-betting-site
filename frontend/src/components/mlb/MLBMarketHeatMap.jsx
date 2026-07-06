import { TBMCard } from "../ui";
import "./MLBMarketHeatMap.css";

function countMarket(plays, match) {
  return plays.filter((p) =>
    String(p.market || p.overview_market || "").toLowerCase().includes(match)
  ).length;
}

function avgEdge(plays) {
  const values = plays.map((p) => Number(p.edge)).filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function MarketHeatRow({ label, count, edge, max, tone }) {
  const width = Math.min(100, Math.max(8, (count / Math.max(max, 1)) * 100));

  return (
    <div className="mlb-heat-row">
      <div className="mlb-heat-label">
        <strong>{label}</strong>
        <span>{count} plays</span>
      </div>

      <div className="mlb-heat-bar">
        <i className={tone} style={{ width: `${width}%` }} />
      </div>

      <div className="mlb-heat-edge">
        <strong>{edge.toFixed(2)}%</strong>
        <span>Avg Edge</span>
      </div>
    </div>
  );
}

export default function MLBMarketHeatMap({ fullGame = [], f5 = [], nrfi = [] }) {
  const moneyline = fullGame.filter((p) => String(p.market || "").toLowerCase().includes("moneyline"));
  const runline = fullGame.filter((p) => String(p.market || "").toLowerCase().includes("run"));
  const totals = fullGame.filter((p) => String(p.market || "").toLowerCase().includes("total"));

  const rows = [
    { label: "Moneyline", plays: moneyline, tone: "blue" },
    { label: "Run Line", plays: runline, tone: "green" },
    { label: "Totals", plays: totals, tone: "purple" },
    { label: "First 5", plays: f5, tone: "orange" },
    { label: "NRFI / YRFI", plays: nrfi, tone: "gold" },
  ];

  const max = Math.max(...rows.map((row) => row.plays.length), 1);

  return (
    <TBMCard className="mlb-heat-card">
      <div className="mlb-heat-header">
        <div>
          <span>Market Heat Map</span>
          <h2>Where the MLB board is strongest</h2>
        </div>
        <strong>Live</strong>
      </div>

      <div className="mlb-heat-list">
        {rows.map((row) => (
          <MarketHeatRow
            key={row.label}
            label={row.label}
            count={row.plays.length}
            edge={avgEdge(row.plays)}
            max={max}
            tone={row.tone}
          />
        ))}
      </div>
    </TBMCard>
  );
}
