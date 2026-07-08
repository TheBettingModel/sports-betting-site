import TBMTeamLogo from "../logos/TBMTeamLogo";
import "./TBMSportCard.css";

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

function getRecommendation(play) {
  return play?.final_recommendation || play?.recommendation || "Model Play";
}

function getPick(play) {
  return play?.pick || play?.recommendation || "No Pick";
}

export default function TBMSportCard({ name, play, href }) {
  if (!play) return null;

  const { away, home } = splitGame(play.game || "");

  return (
    <a className="tbm-sport-card-v2" href={href}>
      <div className="tbm-sport-card-top-v2">
        <span>{name}</span>
        <strong>{getRecommendation(play)}</strong>
      </div>

      <div className="tbm-sport-card-logos-v2">
        <TBMTeamLogo team={away} sport={name} size={42} />
        <div className="tbm-sport-card-vs-v2">VS</div>
        <TBMTeamLogo team={home} sport={name} size={42} />
      </div>

      <div className="tbm-sport-card-pick-v2">
        <strong>{getPick(play)}</strong>
        <span>{away} @ {home}</span>
      </div>
    </a>
  );
}
