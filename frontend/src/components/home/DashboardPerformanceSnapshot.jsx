import { useEffect, useMemo, useState } from "react";
import "./DashboardPerformanceSnapshot.css";

const API_URL = import.meta.env.VITE_API_URL;

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function record(summary = {}) {
  const wins = numeric(summary.wins);
  const losses = numeric(summary.losses);
  const pushes = numeric(summary.pushes);

  return pushes ? `${wins}-${losses}-${pushes}` : `${wins}-${losses}`;
}

function units(value) {
  const amount = numeric(value);
  return `${amount > 0 ? "+" : ""}${amount.toFixed(2)}U`;
}

function percentage(value) {
  return `${numeric(value).toFixed(1)}%`;
}

function calculateRoi(summary = {}) {
  if (summary.roi !== undefined && summary.roi !== null) {
    return numeric(summary.roi);
  }

  const graded =
    numeric(summary.graded) ||
    numeric(summary.wins) + numeric(summary.losses);

  return graded ? (numeric(summary.units) / graded) * 100 : 0;
}

export default function DashboardPerformanceSnapshot() {
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);

    fetch(`${API_URL}/model/performance`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response.json();
      })
      .then((data) => {
        setPerformance(data);
        setError("");
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          console.error("Performance snapshot error:", err);
          setError("Performance unavailable");
        }
      })
      .finally(() => {
        window.clearTimeout(timer);
        setLoading(false);
      });

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const summary = useMemo(
    () =>
      performance?.summary ||
      performance?.actionable_summary ||
      performance?.graded_summary ||
      performance?.all_graded ||
      {},
    [performance]
  );

  const graded =
    numeric(summary.graded) ||
    numeric(summary.wins) + numeric(summary.losses);

  const roi = calculateRoi(summary);

  return (
    <section className="dashboard-performance-card">
      <div className="dashboard-performance-header">
        <div>
          <span>Performance</span>
          <h2>Model Snapshot</h2>
        </div>

        <a href="/model-performance">
          {loading ? "Updating" : "View Dashboard"}
        </a>
      </div>

      {error ? (
        <div className="dashboard-performance-message">
          {error}
        </div>
      ) : (
        <>
          <div className="dashboard-performance-grid">
            <div>
              <span>Record</span>
              <strong>{loading ? "—" : record(summary)}</strong>
            </div>

            <div>
              <span>Units</span>
              <strong
                className={
                  numeric(summary.units) >= 0
                    ? "is-positive"
                    : "is-negative"
                }
              >
                {loading ? "—" : units(summary.units)}
              </strong>
            </div>

            <div>
              <span>Win Rate</span>
              <strong>
                {loading ? "—" : percentage(summary.win_rate)}
              </strong>
            </div>

            <div>
              <span>ROI</span>
              <strong
                className={roi >= 0 ? "is-positive" : "is-negative"}
              >
                {loading ? "—" : percentage(roi)}
              </strong>
            </div>
          </div>

          {!loading && graded === 0 ? (
            <p className="dashboard-performance-note">
              Performance will populate as saved model plays are graded.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
