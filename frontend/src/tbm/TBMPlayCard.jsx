import { splitGameTeams } from "../utils/logoEngine";
import TBMBadge from "./TBMBadge";
import TBMLogo from "./TBMLogo";
import TBMMetric from "./TBMMetric";

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
}

function signalTone(signal = "") {
  const s = String(signal).toLowerCase();
  if (s.includes("sharp")) return "green";
  if (s.includes("clv")) return "blue";
  if (s.includes("steam")) return "purple";
  if (s.includes("risk") || s.includes("negative")) return "red";
  return "dark";
}

export default function TBMPlayCard({ play, label = "", featured = false }) {
  if (!play) return null;

  const sport = play.sport || play.pod_sport || "Unknown";
  const [away, home] = splitGameTeams(play.game);
  const recommendation = play.final_recommendation || play.recommendation || "Model";
  const tier = play.final_model_tier || play.tier || play.universal_pod_tier || "N/A";
  const odds = play.best_odds ?? play.odds;

  return (
    <article className={`tbm-card tbm-card-hover tbm-play-card ${featured ? "tbm-card-featured" : ""}`}>
      <div className="tbm-play-top">
        <div className="tbm-logo-matchup">
          <TBMLogo team={away} sport={sport} />
          <span className="tbm-vs">vs</span>
          <TBMLogo team={home} sport={sport} />
        </div>

        <div style={{ textAlign: "right" }}>
          {label && <div className="tbm-card-label">{label}</div>}
          <TBMBadge tone={recommendation.includes("Elite") || recommendation.includes("Play") ? "green" : "dark"}>
            {recommendation}
          </TBMBadge>
        </div>
      </div>

      <div className="tbm-pick-row">
        <div>
          <h3 className="tbm-pick-title">{play.pick || "N/A"}</h3>
          <p className="tbm-game-text">{play.game || "N/A"}</p>
        </div>
        <div className="tbm-odds">{formatOdds(odds)}</div>
      </div>

      <div className="tbm-metrics">
        <TBMMetric label="Edge" value={`${play.edge ?? "N/A"}%`} accent />
        <TBMMetric label="Conf" value={play.confidence ?? "N/A"} accent />
        <TBMMetric label="Units" value={play.units ?? "N/A"} />
        <TBMMetric label="POD" value={Number(play.universal_pod_score || 0).toFixed(1)} accent />
      </div>

      <div className="tbm-signals">
        <TBMBadge tone="gold">{tier}</TBMBadge>
        <TBMBadge tone={signalTone(play.sharp_signal)}>{play.sharp_signal || "Sharp N/A"}</TBMBadge>
        {play.clv_status && <TBMBadge tone="blue">{play.clv_status}</TBMBadge>}
        {play.line_shop_value ? <TBMBadge tone="purple">Best Line +{play.line_shop_value}</TBMBadge> : null}
        <TBMBadge>{play.best_sportsbook || play.sportsbook || "Book N/A"}</TBMBadge>
      </div>
    </article>
  );
}
