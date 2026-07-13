import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TBMPage } from "../components/ui";
import "./AnalyticsV2Page.css";

const API_URL = import.meta.env.VITE_API_URL;
const REFRESH_INTERVAL_MS = 60000;

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatUnits(value) {
  const units = numberValue(value);
  return `${units > 0 ? "+" : ""}${units.toFixed(2)}U`;
}

function formatPercent(value) {
  return `${numberValue(value).toFixed(1)}%`;
}

function formatTimestamp(value) {
  if (!value) {
    return "Not updated";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function buildRecord(summary = {}) {
  const wins = numberValue(summary?.wins);
  const losses = numberValue(summary?.losses);
  const pushes = numberValue(summary?.pushes);

  return pushes > 0
    ? `${wins}-${losses}-${pushes}`
    : `${wins}-${losses}`;
}

function getGradedCount(summary = {}) {
  return (
    numberValue(summary?.graded) ||
    numberValue(summary?.wins) + numberValue(summary?.losses)
  );
}

function normalizeRows(data = {}) {
  return Object.entries(data || {})
    .filter(([, value]) => value && typeof value === "object")
    .sort((a, b) => {
      const gradedDifference =
        getGradedCount(b[1]) - getGradedCount(a[1]);

      if (gradedDifference !== 0) {
        return gradedDifference;
      }

      return numberValue(b[1]?.units) - numberValue(a[1]?.units);
    });
}

function getTone(value, type = "number") {
  const numeric = numberValue(value);

  if (type === "neutral") {
    return "neutral";
  }

  if (numeric > 0) {
    return "positive";
  }

  if (numeric < 0) {
    return "negative";
  }

  return "neutral";
}

function AnalyticsKpi({
  label,
  value,
  detail,
  tone = "neutral",
}) {
  return (
    <div className={`analytics-v2-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function PerformanceTable({
  title,
  eyebrow = "Historical Performance",
  description,
  data,
  compact = false,
}) {
  const rows = normalizeRows(data);

  return (
    <section
      className={`analytics-v2-panel ${
        compact ? "is-compact" : ""
      }`}
    >
      <div className="analytics-v2-panel-header">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>

        {description ? <p>{description}</p> : null}
      </div>

      {rows.length > 0 ? (
        <div className="analytics-v2-table-wrap">
          <table className="analytics-v2-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Record</th>
                <th>Win Rate</th>
                <th>Units</th>
                <th>ROI</th>
                <th>Graded</th>
              </tr>
            </thead>

            <tbody>
              {rows.map(([name, stats]) => {
                const units = numberValue(stats?.units);
                const roi = numberValue(stats?.roi);

                return (
                  <tr key={name}>
                    <td>
                      <strong>{name || "Unclassified"}</strong>
                    </td>

                    <td>{buildRecord(stats)}</td>

                    <td>{formatPercent(stats?.win_rate)}</td>

                    <td
                      className={
                        units >= 0 ? "is-positive" : "is-negative"
                      }
                    >
                      {formatUnits(units)}
                    </td>

                    <td
                      className={
                        roi >= 0 ? "is-positive" : "is-negative"
                      }
                    >
                      {formatPercent(roi)}
                    </td>

                    <td>{getGradedCount(stats)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="analytics-v2-empty">
          No graded performance data is available for this category yet.
        </div>
      )}
    </section>
  );
}

export default function AnalyticsV2Page() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [nextRefreshSeconds, setNextRefreshSeconds] = useState(60);

  const activeControllerRef = useRef(null);
  const refreshDeadlineRef = useRef(
    Date.now() + REFRESH_INTERVAL_MS
  );

  const loadAnalytics = useCallback(async ({ silent = false } = {}) => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    const controller = new AbortController();
    activeControllerRef.current = controller;

    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const response = await fetch(
        `${API_URL}/model/analytics/v2?ts=${Date.now()}`,
        {
          signal: controller.signal,
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();

      if (json?.error) {
        throw new Error(json.error);
      }

      setData(json);
      setLastUpdated(new Date());

      refreshDeadlineRef.current =
        Date.now() + REFRESH_INTERVAL_MS;

      setNextRefreshSeconds(
        Math.round(REFRESH_INTERVAL_MS / 1000)
      );
    } catch (err) {
      if (err?.name === "AbortError") {
        return;
      }

      console.error("Analytics v2 fetch error:", err);
      setError(
        "Analytics could not be refreshed. Existing data remains visible."
      );
    } finally {
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }

      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();

    const refreshTimer = window.setInterval(() => {
      loadAnalytics({ silent: true });
    }, REFRESH_INTERVAL_MS);

    const countdownTimer = window.setInterval(() => {
      const seconds = Math.max(
        0,
        Math.ceil(
          (refreshDeadlineRef.current - Date.now()) / 1000
        )
      );

      setNextRefreshSeconds(seconds);
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadAnalytics({ silent: true });
      }
    };

    const handleWindowFocus = () => {
      loadAnalytics({ silent: true });
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(countdownTimer);

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      window.removeEventListener("focus", handleWindowFocus);

      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
    };
  }, [loadAnalytics]);

  const overallSummary = useMemo(
    () => data?.graded_summary || data?.summary || {},
    [data]
  );

  const actionableSummary = useMemo(
    () => data?.actionable_summary || {},
    [data]
  );

  const allSummary = useMemo(
    () => data?.summary || {},
    [data]
  );

  const overallUnits = numberValue(overallSummary?.units);
  const actionableUnits = numberValue(
    actionableSummary?.units
  );

  const overallRoi = numberValue(overallSummary?.roi);
  const gradedCount = getGradedCount(overallSummary);
  const pendingCount = numberValue(allSummary?.pending);

  const kpis = [
    {
      label: "Overall Record",
      value: buildRecord(overallSummary),
      detail: `${gradedCount} graded model plays`,
      tone: "neutral",
    },
    {
      label: "Net Units",
      value: formatUnits(overallUnits),
      detail: "Across all graded plays",
      tone: getTone(overallUnits),
    },
    {
      label: "Win Rate",
      value: formatPercent(overallSummary?.win_rate),
      detail: "Wins across graded decisions",
      tone: "blue",
    },
    {
      label: "ROI",
      value: formatPercent(overallRoi),
      detail: "Historical graded return",
      tone: getTone(overallRoi),
    },
    {
      label: "Actionable Units",
      value: formatUnits(actionableUnits),
      detail: "Play and Lean recommendations",
      tone: getTone(actionableUnits),
    },
    {
      label: "Pending Plays",
      value: pendingCount,
      detail: "Awaiting final grading",
      tone: "gold",
    },
  ];

  return (
    <TBMPage className="analytics-v2-page">
      <header className="analytics-v2-hero">
        <div className="analytics-v2-hero-copy">
          <span>The Betting Model</span>
          <h1>Analytics Dashboard</h1>
          <p>
            Live historical performance across sports, markets,
            recommendations, model ratings, edge ranges, confidence,
            sportsbooks, sharp signals and closing-line value.
          </p>
        </div>

        <div className="analytics-v2-refresh-panel">
          <div className="analytics-v2-live-status">
            <i aria-hidden="true" />
            {refreshing ? "Refreshing" : "Live Analytics"}
          </div>

          <span>Last updated</span>
          <strong>{formatTimestamp(lastUpdated)}</strong>

          <small>
            Auto-refresh in {nextRefreshSeconds}s
          </small>

          <button
            type="button"
            onClick={() => loadAnalytics({ silent: true })}
            disabled={loading || refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh Now"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="analytics-v2-alert">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="analytics-v2-state">
          Loading historical analytics...
        </div>
      ) : null}

      {!loading && !data && !error ? (
        <div className="analytics-v2-state">
          Analytics data is not currently available.
        </div>
      ) : null}

      {data ? (
        <>
          <section className="analytics-v2-kpi-grid">
            {kpis.map((item) => (
              <AnalyticsKpi key={item.label} {...item} />
            ))}
          </section>

          <section className="analytics-v2-summary-strip">
            <div>
              <span>All Tracked Plays</span>
              <strong>{numberValue(allSummary?.total)}</strong>
              <small>
                Includes pending and graded records
              </small>
            </div>

            <div>
              <span>Graded Plays</span>
              <strong>{gradedCount}</strong>
              <small>
                Used in performance calculations
              </small>
            </div>

            <div>
              <span>Actionable Record</span>
              <strong>{buildRecord(actionableSummary)}</strong>
              <small>
                Play and Lean recommendations
              </small>
            </div>

            <div>
              <span>Analytics Engine</span>
              <strong>
                {data?.model_version || "Historical Analytics V2"}
              </strong>
              <small>Database-backed reporting</small>
            </div>
          </section>

          <div className="analytics-v2-primary-grid">
            <PerformanceTable
              title="Performance by Sport"
              description="Which sports are producing the strongest historical results."
              data={data?.by_sport}
            />

            <PerformanceTable
              title="Performance by Market"
              description="Moneyline, spreads, totals, First 5 and other tracked markets."
              data={data?.by_market}
            />
          </div>

          <div className="analytics-v2-primary-grid">
            <PerformanceTable
              title="Edge Buckets"
              description="Historical performance grouped by projected model edge."
              data={data?.edge_buckets}
            />

            <PerformanceTable
              title="Confidence Buckets"
              description="Results grouped by the model confidence range."
              data={data?.confidence_buckets}
            />
          </div>

          <PerformanceTable
            title="Final Recommendation Performance"
            description="Historical results across the final actionable recommendation."
            data={data?.by_final_recommendation}
          />

          <div className="analytics-v2-primary-grid">
            <PerformanceTable
              title="Final Model Tiers"
              description="Performance by the model's final quality tier."
              data={data?.by_final_model_tier}
              compact
            />

            <PerformanceTable
              title="Market Intelligence Grades"
              description="Results grouped by market intelligence quality."
              data={data?.by_market_intelligence_grade}
              compact
            />
          </div>

          <div className="analytics-v2-primary-grid">
            <PerformanceTable
              title="Sportsbook Performance"
              description="Historical results by tracked sportsbook."
              data={data?.by_sportsbook}
              compact
            />

            <PerformanceTable
              title="Sharp Signal Performance"
              description="Results grouped by sharp-market signal."
              data={data?.by_sharp_signal}
              compact
            />
          </div>

          <div className="analytics-v2-primary-grid">
            <PerformanceTable
              title="CLV Performance"
              description="Historical results grouped by closing-line value status."
              data={data?.by_clv_status}
              compact
            />

            <PerformanceTable
              title="Steam Strength"
              description="Performance grouped by detected steam movement."
              data={data?.by_steam_strength}
              compact
            />
          </div>

          <PerformanceTable
            title="Model Version Performance"
            description="Historical performance by the model version that created each play."
            data={data?.by_model_version}
          />
        </>
      ) : null}
    </TBMPage>
  );
}
