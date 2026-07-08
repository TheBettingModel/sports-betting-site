import { useEffect, useState } from "react";
import "./DashboardPerformanceSnapshot.css";

const API_URL = import.meta.env.VITE_API_URL;

function value(v, fallback = "Tracking") {
  return v === null || v === undefined || v === "" ? fallback : v;
}

export default function DashboardPerformanceSnapshot() {
  const [performance, setPerformance] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/model/performance`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setPerformance(data))
      .catch(() => setPerformance(null));
  }, []);

  const record =
    performance?.record ||
    performance?.overall_record ||
    performance?.season_record ||
    "Tracking";

  const units =
    performance?.units ||
    performance?.net_units ||
    performance?.season_units ||
    "Tracking";

  const winRate =
    performance?.win_rate ||
    performance?.overall_win_rate ||
    "Tracking";

  const roi =
    performance?.roi ||
    performance?.overall_roi ||
    "Tracking";

  return (
    <section className="dashboard-performance-card">
      <div className="dashboard-performance-header">
        <div>
          <span>Performance</span>
          <h2>Model Snapshot</h2>
        </div>
        <strong>Live Tracking</strong>
      </div>

      <div className="dashboard-performance-grid">
        <div>
          <span>Record</span>
          <strong>{value(record)}</strong>
        </div>

        <div>
          <span>Units</span>
          <strong>{value(units)}</strong>
        </div>

        <div>
          <span>Win Rate</span>
          <strong>{value(winRate)}</strong>
        </div>

        <div>
          <span>ROI</span>
          <strong>{value(roi)}</strong>
        </div>
      </div>
    </section>
  );
}
