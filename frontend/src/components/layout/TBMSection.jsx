import "./TBMSection.css";

export default function TBMSection({
  title,
  children,
  className = "",
}) {
  const sectionClassName = [
    "tbm-section-v2",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={sectionClassName}>
      {title ? (
        <div className="tbm-section-v2-head">
          <div
            className="tbm-section-v2-head__marker"
            aria-hidden="true"
          />

          <h2>{title}</h2>
        </div>
      ) : null}

      <div className="tbm-section-v2-body">
        {children}
      </div>
    </section>
  );
}
