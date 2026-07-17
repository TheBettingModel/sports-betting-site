import "./TBMPageHeader.css";

export default function TBMPageHeader({
  eyebrow = "The Betting Model",
  title,
  badge = "Live Model",
}) {
  return (
    <header className="tbm-page-header-v2">
      <div className="tbm-page-header-v2__copy">
        {eyebrow ? (
          <p className="tbm-page-header-v2__eyebrow">{eyebrow}</p>
        ) : null}

        <h1 className="tbm-page-header-v2__title">{title}</h1>
      </div>

      {badge ? (
        <div className="tbm-page-header-v2__status" aria-label={badge}>
          <span
            className="tbm-page-header-v2__status-dot"
            aria-hidden="true"
          />

          <span className="tbm-page-header-v2__status-label">
            {badge}
          </span>
        </div>
      ) : null}
    </header>
  );
}
