import "./TBMBadge.css";

export default function TBMBadge({ children, tone = "green" }) {
  if (!children) return null;

  return (
    <span className={`tbm-ui-badge ${tone}`}>
      {children}
    </span>
  );
}
