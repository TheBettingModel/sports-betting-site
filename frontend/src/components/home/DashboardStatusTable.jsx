import "./DashboardStatusTable.css";

const SPORTS = ["MLB", "NBA", "NFL", "NHL", "WNBA", "Soccer", "NCAAF", "NCAAMB", "UFC"];

function getActiveSports(status) {
  if (!status) return [];

  if (Array.isArray(status.active_sports)) return status.active_sports.map(String);

  if (status.platform && Array.isArray(status.platform.active_sports)) {
    return status.platform.active_sports.map(String);
  }

  if (Array.isArray(status.sports)) {
    return status.sports
      .filter((sport) => sport.active || sport.status === "success" || sport.status === "active")
      .map((sport) => String(sport.sport || sport.name || sport.league));
  }

  return [];
}

export default function DashboardStatusTable({ status }) {
  const activeSports = getActiveSports(status).map((sport) => sport.toLowerCase());

  return (
    <div className="dashboard-status-simple">
      {SPORTS.map((sport) => {
        const active = activeSports.includes(sport.toLowerCase());

        return (
          <div className="dashboard-status-simple-row" key={sport}>
            <strong>{sport}</strong>
            <span className={active ? "active" : "inactive"}>
              {active ? "Active" : "Not Active"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
