import "./TBMPlayCard.css";

function valueOrDash(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function TeamLogo({ name }) {
  const text = String(name || "TBM").slice(0, 3).toUpperCase();

  return (
    <div className="tbm-play-logo">
      {text}
    </div>
  );
}

function TBMBadge({ label, type = "green" }) {
  if (!label) return null;

  return (
    <span className={`tbm-play-badge ${type}`}>
      {label}
    </span>
  );
}

function splitGame(game = "") {
  if (game.includes(" vs ")) {
    const [away, home] = game.split(" vs ");
    return { away, home };
  }

  if (game.includes(" at ")) {
    const [away, home] = game.split(" at ");
    return { away, home };
  }

  return { away: "Away", home: "Home" };
}

export default function TBMPlayCard({ play, featured = false }) {
  const { away, home } = splitGame(play?.game || "");

  const edge = valueOrDash(play?.edge);
  const confidence = valueOrDash(play?.confidence);
  const units = valueOrDash(play?.units);
  const odds = valueOrDash(play?.odds);
  const sportsbook = valueOrDash(play?.sportsbook || play?.best_sportsbook);
  const recommendation = valueOrDash(play?.recommendation || play?.final_recommendation);
  const tier = valueOrDash(play?.final_model_tier || play?.tier || "Model Play");
  const podScore = valueOrDash(play?.auto_pod_score || play?.top_play_score || play?.pod_score);

  const sharpLabel = play?.sharp_signal || play?.sharp_book_signal || "Market";
  const clvLabel = play?.clv_status || play?.live_clv_grade || "CLV";
  const steamLabel = play?.steam_strength || play?.line_movement_signal || "Steam";

  return (
    <article className={featured ? "tbm-play-card featured" : "tbm-play-card"}>
      <div className="tbm-play-card-top">
        <div>
          <span className="tbm-play-sport">{valueOrDash(play?.sport)}</span>
          <h3>{valueOrDash(play?.market)}</h3>
        </div>

        <div className="tbm-play-tier">
          {tier}
        </div>
      </div>

      <div className="tbm-play-matchup">
        <div className="tbm-play-team">
          <TeamLogo name={away} />
          <span>{away}</span>
        </div>

        <div className="tbm-play-vs">VS</div>

        <div className="tbm-play-team">
          <TeamLogo name={home} />
          <span>{home}</span>
        </div>
      </div>

      <div className="tbm-play-main-pick">
        <span>Pick</span>
        <strong>{valueOrDash(play?.pick)}</strong>
        <em>{odds}</em>
      </div>

      <div className="tbm-play-metrics">
        <div>
          <span>Edge</span>
          <strong>{edge}%</strong>
        </div>

        <div>
          <span>Confidence</span>
          <strong>{confidence}%</strong>
        </div>

        <div>
          <span>Units</span>
          <strong>{units}</strong>
        </div>

        <div>
          <span>POD Score</span>
          <strong>{podScore}</strong>
        </div>
      </div>

      <div className="tbm-play-badges">
        <TBMBadge label={sharpLabel} type="green" />
        <TBMBadge label={clvLabel} type="blue" />
        <TBMBadge label={steamLabel} type="purple" />
      </div>

      <div className="tbm-play-footer">
        <span>{sportsbook}</span>
        <strong>{recommendation}</strong>
      </div>
    </article>
  );
}
