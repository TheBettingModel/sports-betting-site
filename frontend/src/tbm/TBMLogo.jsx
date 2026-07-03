import { getSportIcon, getTeamLogo } from "../utils/logoEngine";

export default function TBMLogo({ team = "", sport = "", size = 42 }) {
  const src = getTeamLogo(team, sport);

  return (
    <div
      className="tbm-logo-shell"
      style={{ width: size, height: size }}
      title={team}
    >
      {src ? (
        <img src={src} alt={team} className="tbm-logo" />
      ) : (
        <span>{getSportIcon(sport)}</span>
      )}
    </div>
  );
}
