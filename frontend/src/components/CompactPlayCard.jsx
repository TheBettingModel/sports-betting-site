import { getSportIcon, getTeamLogo, splitGameTeams } from "../utils/logoEngine";

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
}

function Logo({ team, sport }) {
  const src = getTeamLogo(team, sport);

  return (
    <div className="tbm-logo-shell">
      {src ? (
        <img src={src} alt={team} className="tbm-logo" />
      ) : (
        <span>{getSportIcon(sport)}</span>
      )}
    </div>
  );
}

export default function CompactPlayCard({ play, label = "", featured = false }) {
  if (!play) return null;

  const sport = play.sport || play.pod_sport || "Unknown";
  const [away, home] = splitGameTeams(play.game);
  const recommendation = play.final_recommendation || play.recommendation || "Model Play";
  const odds = play.best_odds ?? play.odds;

  return (
    <div className={`tbm-compact-card ${featured ? "tbm-featured-card" : ""}`}>
      <div className="tbm-card-top">
        <div className="tbm-matchup-logos">
          <Logo team={away} sport={sport} />
          <span className="tbm-vs">vs</span>
          <Logo team={home} sport={sport} />
        </div>

        <div className="tbm-card-score">
          <span>POD</span>
          <strong>{Number(play.universal_pod_score || 0).toFixed(1)}</strong>
        </div>
      </div>

      {label && <div className="tbm-card-label">{label}</div>}

      <div className="tbm-card-main">
        <div>
          <h3>{play.pick || "N/A"}</h3>
          <p>{play.game || "N/A"}</p>
        </div>

        <div className="tbm-odds-box">
          <span>{play.market || "N/A"}</span>
          <strong>{formatOdds(odds)}</strong>
        </div>
      </div>

      <div className="tbm-metric-strip">
        <span>Edge <strong>{play.edge ?? "N/A"}%</strong></span>
        <span>Conf <strong>{play.confidence ?? "N/A"}</strong></span>
        <span>Units <strong>{play.units ?? "N/A"}</strong></span>
        <span>Book <strong>{play.best_sportsbook || play.sportsbook || "N/A"}</strong></span>
      </div>

      <div className="tbm-signal-strip">
        <span className="tbm-rec-pill">{recommendation}</span>
        <span>{play.final_model_tier || play.tier || "Tier N/A"}</span>
        <span>{play.sharp_signal || "Sharp N/A"}</span>
        <span>{play.market_intelligence_grade || "Grade N/A"}</span>
      </div>
    </div>
  );
}
