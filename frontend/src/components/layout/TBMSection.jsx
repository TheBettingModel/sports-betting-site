import "./TBMSection.css";

export default function TBMSection({ title, children, className = "" }) {
  return (
    <section className={`tbm-section-v2 ${className}`}>
      {title ? (
        <div className="tbm-section-v2-head">
          <h2>{title}</h2>
        </div>
      ) : null}

      {children}
    </section>
  );
}
