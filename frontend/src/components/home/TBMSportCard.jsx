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

function getPick(play) {
  return play?.pick || play?.recommendation || "No Pick";
}

function getRecommendation(play) {
  return play?.final_recommendation || play?.recommendation || "Model Play";
}

export default function TBMSportCard({ name, play, href }) {
  if (!play) return null;

  const { away, home } = splitGame(play.game || "");

  return (
    <a className="tbm-sport-card-v3" href={href}>
      <div className="tbm-sport-card-v3-head">
        <span>{name}</span>
        <strong>{getRecommendation(play)}</strong>
      </div>

      <div className="tbm-sport-card-v3-teams">
        <div>
          <TBMTeamLogo team={away} sport={name} size={38} />
          <span>{away}</span>
        </div>

        <em>@</em>

        <div>
          <TBMTeamLogo team={home} sport={name} size={38} />
          <span>{home}</span>
        </div>
      </div>

      <div className="tbm-sport-card-v3-pick">
        {getPick(play)}
      </div>
    </a>
  );
}
