import "./TBMLayout.css";

export function TBMPage({ children, className = "" }) {
  return <main className={`tbm-ui-page ${className}`}>{children}</main>;
}

export function TBMPageHeader({ eyebrow, title, subtitle, action }) {
  return (
    <header className="tbm-ui-page-header">
      <div>
        {eyebrow && <span>{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>

      {action && <div className="tbm-ui-page-action">{action}</div>}
    </header>
  );
}

export function TBMGrid({ children, columns = 2, className = "" }) {
  return (
    <div className={`tbm-ui-grid columns-${columns} ${className}`}>
      {children}
    </div>
  );
}

export function TBMMainGrid({ children, className = "" }) {
  return <div className={`tbm-ui-main-grid ${className}`}>{children}</div>;
}

export function TBMCardGrid({ children, className = "" }) {
  return <div className={`tbm-ui-card-grid ${className}`}>{children}</div>;
}
