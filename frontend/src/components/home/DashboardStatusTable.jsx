import "./DashboardStatusTable.css";

function normalizeStatus(status) {
  if (!status) return [];

  if (Array.isArray(status)) return status;

  return Object.entries(status).map(([sport, data]) => ({
    sport,
    ...(typeof data === "object" && data !== null ? data : { status: data }),
  }));
}

function cleanStatus(value) {
  const text = String(value || "Ready");
  if (text.toLowerCase().includes("success")) return "Ready";
  if (text.toLowerCase().includes("error")) return "Offline";
  if (text.toLowerCase().includes("off")) return "Off Season";
  return text;
}

function statusClass(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("offline") || text.includes("error")) return "red";
  if (text.includes("update") || text.includes("loading")) return "gold";
  if (text.includes("off")) return "muted";
  return "green";
}

export default function DashboardStatusTable({ status }) {
  const rows = normalizeStatus(status);

  if (!rows.length) {
    return <div className="dashboard-status-empty">No sport status available.</div>;
  }

  return (
    <div className="dashboard-status-table">
      <div className="dashboard-status-head">
        <span>Sport</span>
        <span>Status</span>
        <span>Games</span>
      </div>

      {rows.map((row, index) => {
        const sport = row.sport || row.name || row.league || `Sport ${index + 1}`;
        const games = row.games ?? row.count ?? row.play_count ?? row.total_games ?? "—";
        const statusText = cleanStatus(row.status || row.refresh_status || row.state);

        return (
          <div className="dashboard-status-row" key={`${sport}-${index}`}>
            <strong>{sport}</strong>
            <span className={`dashboard-status-pill ${statusClass(statusText)}`}>
              {statusText}
            </span>
            <em>{games}</em>
          </div>
        );
      })}
    </div>
  );
}
