export default function TBMSection({ eyebrow, title, subtitle, children }) {
  return (
    <section className="tbm-section">
      <div className="tbm-section-header">
        <div>
          {eyebrow && <div className="tbm-eyebrow">{eyebrow}</div>}
          {title && <h2 className="tbm-title">{title}</h2>}
          {subtitle && <p className="tbm-subtitle">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
