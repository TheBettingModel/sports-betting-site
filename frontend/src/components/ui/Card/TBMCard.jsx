import "./TBMCard.css";

export default function TBMCard({ children, className = "", glow = false }) {
  return (
    <div className={`tbm-ui-card ${glow ? "glow" : ""} ${className}`}>
      {children}
    </div>
  );
}
