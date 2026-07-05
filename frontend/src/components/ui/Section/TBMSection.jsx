import "./TBMSection.css";

export default function TBMSection({ title, subtitle, action, children }) {
  return (
    <section className="tbm-ui-section">
      <div className="tbm-ui-section-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action && <div className="tbm-ui-section-action">{action}</div>}
      </div>

      {children}
    </section>
  );
}
