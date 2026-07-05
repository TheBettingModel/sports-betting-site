import "./TBMMetric.css";

export default function TBMMetric({ label, value, sub, accent = false }) {
  return (
    <div className="tbm-ui-metric">
      <span>{label}</span>
      <strong className={accent ? "accent" : ""}>{value ?? "N/A"}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}
