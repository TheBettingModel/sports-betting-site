import { getTeamLogoUrl } from "../../utils/teamLogoEngine";
import "./TBMTeamLogo.css";

export default function TBMTeamLogo({ team, sport, size = 62 }) {
  const logoUrl = getTeamLogoUrl(team, sport);
  const fallback = String(team || "TBM").slice(0, 3).toUpperCase();

  return (
    <div
      className="tbm-real-logo-shell"
      style={{ width: size, height: size }}
      title={team}
    >
      {logoUrl ? (
        <img src={logoUrl} alt={`${team} logo`} />
      ) : (
        <span>{fallback}</span>
      )}
    </div>
  );
}
