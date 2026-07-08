import "./DashboardStatusTable.css";

function normalizeStatus(status) {
  if (!status) return [];

  if (Array.isArray(status)) return status;

  return Object.entries(status).map(([sport, data]) => ({
    sport,
    ...(typeof data === "object" && data !== null ? data : { status: data }),
  }));
}

function isActive(row) {
  const text = String(row.status || row.refresh_status || row.state || "").toLowerCase();
  const games = Number(row.games ?? row.count ?? row.play_count ?? row.total_games ?? 0);

  if (text.includes("error") || text.includes("offline") || text.includes("off")) return false;
  if (games > 0) return true;
  if (text.includes("success") || text.includes("ready") || text.includes("active")) return true;

  return false;
}

export default function DashboardStatusTable({ status }) {
  const rows = normalizeStatus(status);

  if (!rows.length) {
    return <div className="dashboard-status-empty">No sport status available.</div>;
  }

  return (
    <div className="dashboard-status-simple">
      {rows.map((row, index) => {
        const sport = row.sport || row.name || row.league || `Sport ${index + 1}`;
        const active = isActive(row);

        return (
          <div className="dashboard-status-simple-row" key={`${sport}-${index}`}>
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
