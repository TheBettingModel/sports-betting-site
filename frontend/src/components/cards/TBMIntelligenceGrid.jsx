import "./TBMIntelligenceGrid.css";

function valueOrNA(value) {
  return value === null || value === undefined || value === "" ? "N/A" : value;
}

export default function TBMIntelligenceGrid({ play }) {
  const items = [
    {
      label: "Sharp Money",
      value: valueOrNA(play?.sharp_signal),
    },
    {
      label: "Market",
      value: valueOrNA(play?.market_intelligence_signal || play?.market_timing_signal),
    },
    {
      label: "CLV",
      value: valueOrNA(play?.clv_status || play?.clv_signal),
    },
    {
      label: "Book",
      value: valueOrNA(play?.best_sportsbook || play?.sportsbook),
    },
  ];

  return (
    <div className="tbm-intel-grid">
      {items.map((item) => (
        <div className="tbm-intel-tile" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
