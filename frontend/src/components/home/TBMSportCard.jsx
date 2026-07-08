import TBMTeamLogo from "../logos/TBMTeamLogo";
import "./TBMSportCard.css";

function splitGame(game = "") {
  const clean = String(game || "").trim();

  if (clean.includes(" vs ")) {
    const [away, home] = clean.split(" vs ");
    return { away, home };
  }

  if (clean.includes(" at ")) {
    const [away, home] = clean.split(" at ");
    return { away, home };
  }

  if (clean.includes(" @ ")) {
    const [away, home] = clean.split(" @ ");
    return { away, home };
  }

  return { away: "Away", home: "Home" };
}

function getPick(play) {
  return play?.pick || play?.selection || play?.recommendation || "No Pick";
}

export default function TBMSportCard({ name, play, href = "#" }) {
  if (!play) return null;

  const { away, home } = splitGame(play.game || "");

  return (
    <a className="tbm-sport-card-v3" href={href}>
      <div className="tbm-sport-card-v3-head">
        <span>{name}</span>
      </div>

      <div className="tbm-sport-card-v3-teams">
        <div>
          <TBMTeamLogo team={away} sport={name} size={38} />
        </div>

        <em>VS</em>

        <div>
          <TBMTeamLogo team={home} sport={name} size={38} />
        </div>
      </div>

      <div className="tbm-sport-card-v3-pick">{getPick(play)}</div>
    </a>
  );
}
