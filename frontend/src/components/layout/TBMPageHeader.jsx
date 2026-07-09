import "./TBMPageHeader.css";

export default function TBMPageHeader({
  eyebrow = "The Betting Model",
  title,
  badge = "Live Model",
}) {
  return (
    <section className="tbm-page-header-v2">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {badge ? <span>{badge}</span> : null}
    </section>
  );
}
