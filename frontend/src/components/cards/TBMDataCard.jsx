import "./TBMDataCard.css";

export default function TBMDataCard({
  label,
  value,
  sub = "",
  tone = "default",
}) {
  return (
    <div className={`tbm-data-card tbm-data-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <em>{sub}</em> : null}
    </div>
  );
}
