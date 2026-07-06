import TBMTeamLogo from "../logos/TBMTeamLogo";
import TBMSportsbookBadge from "../logos/TBMSportsbookBadge";
import "./TBMSportCard.css";

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
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

function getScore(play) {
  return Number(
    play?.universal_pod_score ??
    play?.pod_score ??
    play?.final_model_score ??
    play?.top_play_score ??
    0
  );
}

function getOdds(play) {
  return play?.best_odds ?? play?.odds;
}

function getBook(play) {
  return play?.best_sportsbook || play?.best_book || play?.sportsbook || "Best Available";
}

function getRecommendation(play) {
  return play?.final_recommendation || play?.recommendation || "Model Play";
}

export default function TBMSportCard({ name, play, href }) {
  if (!play) return null;

  const { away, home } = splitGame(play.game || "");

  return (
    <a className="tbm-sport-card-v2" href={href}>
      <div className="tbm-sport-card-top-v2">
        <span>{name}</span>
        <strong>{getScore(play).toFixed(1)}</strong>
      </div>

      <div className="tbm-sport-card-logos-v2">
        <TBMTeamLogo team={away} sport={name} size={46} />
        <div className="tbm-sport-card-vs-v2">VS</div>
        <TBMTeamLogo team={home} sport={name} size={46} />
      </div>

      <div className="tbm-sport-card-pick-v2">
        <strong>{play.pick}</strong>
        <span>{play.game}</span>
      </div>

      <div className="tbm-sport-card-metrics-v2">
        <div>
          <span>Odds</span>
          <strong>{formatOdds(getOdds(play))}</strong>
        </div>
        <div>
          <span>Edge</span>
          <strong>{play.edge ?? "N/A"}%</strong>
        </div>
        <div>
          <span>Conf</span>
          <strong>{play.confidence ?? "N/A"}%</strong>
        </div>
      </div>

      <div className="tbm-sport-card-footer-v2">
        <span>{play.market || "Market"}</span>
        <TBMSportsbookBadge book={getBook(play)} />
      </div>
    </a>
  );
}
