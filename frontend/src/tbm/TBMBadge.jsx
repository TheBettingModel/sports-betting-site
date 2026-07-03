export default function TBMBadge({ children, tone = "dark" }) {
  const toneClass = {
    green: "tbm-badge-green",
    blue: "tbm-badge-blue",
    purple: "tbm-badge-purple",
    gold: "tbm-badge-gold",
    red: "tbm-badge-red",
    dark: "",
  }[tone] || "";

  return <span className={`tbm-badge ${toneClass}`}>{children}</span>;
}
