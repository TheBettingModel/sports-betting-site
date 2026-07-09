import { Link } from "react-router-dom";
import "./TBMModelStatusCard.css";

function sportEmoji(name) {
  return {
    MLB: "⚾",
    NBA: "🏀",
    NFL: "🏈",
    NHL: "🏒",
    WNBA: "🏀",
    NCAAF: "🏈",
    NCAAMB: "🏀",
    Soccer: "⚽",
    UFC: "🥊",
  }[name] || "📊";
}

export default function TBMModelStatusCard({
  name,
  count = 0,
  status = "Live",
  href = "#",
}) {
  const live = Number(count) > 0;

  return (
    <Link className="tbm-model-status-card" to={href}>
      <div className="tbm-model-status-top">
        <span>{sportEmoji(name)}</span>
        <strong>{name}</strong>
      </div>

      <div className="tbm-model-status-count">
        {live ? `${count} Plays Ready` : "No Games"}
      </div>

      <div className="tbm-model-status-bottom">
        <em className={live ? "live" : ""}>{live ? status : "Offline"}</em>
        <span>Open →</span>
      </div>
    </Link>
  );
}
