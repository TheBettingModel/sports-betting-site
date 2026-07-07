import { TBMCard } from "../ui";
import "./MLBPerformanceMiniDashboard.css";

export default function MLBPerformanceMiniDashboard() {
  const items = [
    { label: "Season Units", value: "Tracked Soon", sub: "Model ledger" },
    { label: "Win Rate", value: "Tracked Soon", sub: "By MLB market" },
    { label: "ROI", value: "Tracked Soon", sub: "All MLB plays" },
    { label: "CLV Hit Rate", value: "Tracked Soon", sub: "Closing value" },
  ];

  return (
    <TBMCard className="mlb-performance-mini">
      <div className="mlb-performance-header">
        <div>
          <span>Performance Center</span>
          <h2>MLB model transparency</h2>
        </div>
        <strong>Coming Soon</strong>
      </div>

      <div className="mlb-performance-grid">
        {items.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.sub}</small>
          </div>
        ))}
      </div>
    </TBMCard>
  );
}
