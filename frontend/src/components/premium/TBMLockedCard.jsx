import "./TBMLockedCard.css";

export default function TBMLockedCard({
  title = "Premium Pick",
  subtitle = "Unlock Full Card",
  cta = "Become a Member",
}) {
  return (
    <div className="tbm-locked-card">
      <div className="tbm-locked-icon">🔒</div>
      <strong>{title}</strong>
      <span>{subtitle}</span>
      <button type="button">{cta}</button>
    </div>
  );
}
