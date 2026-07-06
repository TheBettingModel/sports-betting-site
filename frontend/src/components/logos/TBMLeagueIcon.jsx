import "./TBMLeagueIcon.css";

const leagueLabels = {
  dashboard: "D",
  pod: "POD",
  analytics: "AN",
  admin: "SET",
  mlb: "MLB",
  nba: "NBA",
  nfl: "NFL",
  nhl: "NHL",
  wnba: "W",
  soccer: "SOC",
  ncaaf: "CFB",
  ncaamb: "CBB",
  ufc: "UFC",
};

export default function TBMLeagueIcon({ type = "dashboard" }) {
  const key = String(type || "dashboard").toLowerCase();
  const label = leagueLabels[key] || "TBM";

  return (
    <span className={`tbm-league-icon ${key}`}>
      {label}
    </span>
  );
}
