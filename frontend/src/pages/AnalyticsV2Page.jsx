import { useEffect, useState } from "react";

function AnalyticsV2Page() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    setError("");

    fetch(`${API_URL}/model/analytics/v2`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => {
        console.error("Analytics v2 fetch error:", err);
        setError("Failed to load Analytics Dashboard.");
      });
  }, [API_URL]);

  const summary = data?.graded_summary || data?.summary || {};
  const actionable = data?.actionable_summary || {};

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>Model Analytics</h1>

      <p style={subtitleStyle}>
        Historical performance dashboard powered by graded model history,
        market intelligence, final ratings, CLV, sharp signals, and model versions.
      </p>

      {error ? (
        <p style={{ color: "#f87171" }}>{error}</p>
      ) : !data ? (
        <p>Loading analytics...</p>
      ) : data.error ? (
        <p style={{ color: "#f87171" }}>{data.error}</p>
      ) : (
        <>
          <section style={summaryGridStyle}>
            <MetricCard label="Net Units" value={summary.units ?? 0} />
            <MetricCard label="Win Rate" value={`${summary.win_rate ?? 0}%`} />
            <MetricCard label="ROI" value={`${summary.roi ?? 0}%`} />
            <MetricCard label="Graded Plays" value={summary.graded ?? 0} />
            <MetricCard label="Pending Plays" value={data?.summary?.pending ?? 0} />
            <MetricCard label="Actionable Units" value={actionable.units ?? 0} />
          </section>

          <section style={sectionStyle}>
            <h2>Performance by Sport</h2>
            <PerformanceTable data={data.by_sport} />
          </section>

          <section style={sectionStyle}>
            <h2>Performance by Market</h2>
            <PerformanceTable data={data.by_market} />
          </section>

          <section style={sectionStyle}>
            <h2>Performance by Final Rating</h2>
            <PerformanceTable data={data.by_final_recommendation} />
          </section>

          <section style={sectionStyle}>
            <h2>Performance by Final Tier</h2>
            <PerformanceTable data={data.by_final_model_tier} />
          </section>

          <section style={sectionStyle}>
            <h2>Market Intelligence Grades</h2>
            <PerformanceTable data={data.by_market_intelligence_grade} />
          </section>

          <section style={sectionStyle}>
            <h2>Edge Buckets</h2>
            <PerformanceTable data={data.edge_buckets} />
          </section>

          <section style={sectionStyle}>
            <h2>Confidence Buckets</h2>
            <PerformanceTable data={data.confidence_buckets} />
          </section>

          <section style={sectionStyle}>
            <h2>Sportsbook Performance</h2>
            <PerformanceTable data={data.by_sportsbook} />
          </section>

          <section style={sectionStyle}>
            <h2>Sharp Signal Performance</h2>
            <PerformanceTable data={data.by_sharp_signal} />
          </section>

          <section style={sectionStyle}>
            <h2>CLV Performance</h2>
            <PerformanceTable data={data.by_clv_status} />
          </section>

          <section style={sectionStyle}>
            <h2>Model Version Performance</h2>
            <PerformanceTable data={data.by_model_version} />
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value }) {
  const positive =
    typeof value === "number"
      ? value > 0
      : String(value).startsWith("+") || (!String(value).startsWith("-") && String(value) !== "0");

  return (
    <div style={metricCardStyle}>
      <p style={metricLabelStyle}>{label}</p>
      <h2 style={{ ...metricValueStyle, color: positive ? "#22c55e" : "#f87171" }}>
        {value}
      </h2>
    </div>
  );
}

function PerformanceTable({ data }) {
  if (!data || Object.keys(data).length === 0) {
    return <p style={mutedStyle}>No data available.</p>;
  }

  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Category</th>
            <th style={thStyle}>Graded</th>
            <th style={thStyle}>W-L</th>
            <th style={thStyle}>Win %</th>
            <th style={thStyle}>Units</th>
            <th style={thStyle}>ROI</th>
            <th style={thStyle}>Pending</th>
          </tr>
        </thead>

        <tbody>
          {Object.entries(data).map(([key, value]) => (
            <tr key={key}>
              <td style={tdStyle}>{key}</td>
              <td style={tdStyle}>{value.graded ?? 0}</td>
              <td style={tdStyle}>
                {(value.wins ?? 0)}-{(value.losses ?? 0)}
              </td>
              <td style={tdStyle}>{value.win_rate ?? 0}%</td>
              <td
                style={{
                  ...tdStyle,
                  color: Number(value.units || 0) >= 0 ? "#22c55e" : "#f87171",
                  fontWeight: "bold",
                }}
              >
                {value.units ?? 0}
              </td>
              <td style={tdStyle}>{value.roi ?? 0}%</td>
              <td style={tdStyle}>{value.pending ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const pageStyle = {
  backgroundColor: "#020617",
  color: "white",
  minHeight: "100vh",
  padding: "32px",
};

const titleStyle = {
  fontSize: "42px",
  marginBottom: "10px",
};

const subtitleStyle = {
  color: "#9ca3af",
  maxWidth: "950px",
  lineHeight: "1.6",
  marginBottom: "30px",
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "18px",
  marginBottom: "34px",
};

const metricCardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "20px",
};

const metricLabelStyle = {
  color: "#9ca3af",
  marginBottom: "8px",
  fontWeight: "bold",
};

const metricValueStyle = {
  fontSize: "30px",
  margin: 0,
};

const sectionStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "22px",
  marginBottom: "24px",
};

const tableWrapStyle = {
  overflowX: "auto",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "720px",
};

const thStyle = {
  textAlign: "left",
  padding: "12px",
  color: "#9ca3af",
  borderBottom: "1px solid #374151",
  fontSize: "14px",
};

const tdStyle = {
  padding: "12px",
  borderBottom: "1px solid #1f2937",
};

const mutedStyle = {
  color: "#9ca3af",
};

export default AnalyticsV2Page;
