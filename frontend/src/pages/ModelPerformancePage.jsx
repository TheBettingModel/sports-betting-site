import { useEffect, useMemo, useState } from "react";
import { TBMPage } from "../components/ui";
import "./ModelPerformancePage.css";

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

function graded(summary = {}) {
  return (
    numeric(summary.graded) ||
    numeric(summary.wins) + numeric(summary.losses)
  );
}

function roi(summary = {}) {
  if (summary.roi !== undefined && summary.roi !== null) {
    return numeric(summary.roi);
  }

  const count = graded(summary);
  return count ? (numeric(summary.units) / count) * 100 : 0;
}

function Kpi({ label, value, sub, tone = "default" }) {
  return (
    <div className={`performance-v2-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function SignalPanel({ title, data = {} }) {
  const rows = Object.entries(data).filter(
    ([, stats]) => stats && typeof stats === "object"
  );

  return (
    <section className="performance-v2-panel">
      <div className="performance-v2-panel-head">
        <span>Performance Breakdown</span>
        <h2>{title}</h2>
      </div>

      {rows.length ? (
        <div className="performance-v2-table-wrap">
          <table className="performance-v2-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Record</th>
                <th>Win Rate</th>
                <th>Units</th>
              </tr>
            </thead>

            <tbody>
              {rows.map(([name, stats]) => (
                <tr key={name}>
                  <td>{name || "Unclassified"}</td>
                  <td>
                    {numeric(stats.wins)}-{numeric(stats.losses)}
                  </td>
                  <td>{percentage(stats.win_rate)}</td>
                  <td
                    className={
                      numeric(stats.units) >= 0
                        ? "is-positive"
                        : "is-negative"
                    }
                  >
                    {units(stats.units)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="performance-v2-empty">
          No graded data is available yet.
        </div>
      )}
    </section>
  );
}

export default function ModelPerformancePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_URL}/model/performance`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response.json();
      })
      .then((json) => {
        if (json?.error) {
          throw new Error(json.error);
        }

        setData(json);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          console.error("Performance fetch error:", err);
          setError("Failed to load model performance.");
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const summary = useMemo(
    () =>
      data?.summary ||
      data?.actionable_summary ||
      data?.graded_summary ||
      data?.all_graded ||
      {},
    [data]
  );

  const signals = data?.signals || {};
  const resultRoi = roi(summary);

  return (
    <TBMPage className="performance-v2-page">
      <header className="performance-v2-header">
        <div>
          <span>The Betting Model</span>
          <h1>Model Performance</h1>
          <p>
            Live results for actionable plays, markets, sharp signals,
            CLV and model validation.
          </p>
        </div>

        <strong>Live Tracking</strong>
      </header>

      {loading ? (
        <div className="performance-v2-state">
          Loading performance...
        </div>
      ) : null}

      {error ? (
        <div className="performance-v2-state is-error">{error}</div>
      ) : null}

      {!loading && !error ? (
        <>
          <section className="performance-v2-kpi-grid">
            <Kpi
              label="Record"
              value={record(summary)}
              sub={`${graded(summary)} graded plays`}
              tone="green"
            />

            <Kpi
              label="Net Units"
              value={units(summary.units)}
              sub="Actionable model plays"
              tone={numeric(summary.units) >= 0 ? "green" : "red"}
            />

            <Kpi
              label="Win Rate"
              value={percentage(summary.win_rate)}
              sub="Across graded plays"
              tone="blue"
            />

            <Kpi
              label="ROI"
              value={percentage(resultRoi)}
              sub="Return on graded plays"
              tone={resultRoi >= 0 ? "gold" : "red"}
            />
          </section>

          {graded(summary) === 0 ? (
            <div className="performance-v2-notice">
              Performance will populate as saved model plays are graded.
            </div>
          ) : null}

          <div className="performance-v2-panels">
            <SignalPanel
              title="Recommendation Performance"
              data={signals.recommendation}
            />

            <SignalPanel
              title="Market Performance"
              data={signals.market}
            />

            <SignalPanel
              title="Sharp Signal Performance"
              data={signals.sharp_signal}
            />

            <SignalPanel
              title="CLV Performance"
              data={signals.clv_status}
            />

            <SignalPanel
              title="Steam Movement"
              data={signals.steam_strength}
            />

            <SignalPanel
              title="Market Validation"
              data={signals.model_validated_by_market}
            />
          </div>
        </>
      ) : null}
    </TBMPage>
  );
}
