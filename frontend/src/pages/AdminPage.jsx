import { useState } from "react";

function AdminPage() {
  const [loading, setLoading] = useState("");
  const [refreshResult, setRefreshResult] = useState(null);
  const [gradeResult, setGradeResult] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  const runAction = async (label, url, options = {}) => {
    setLoading(label);
    setError("");

    try {
      const res = await fetch(url, options);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      return data;
    } catch (err) {
      setError(err.message || "Action failed");
      return null;
    } finally {
      setLoading("");
    }
  };

  const refreshMLB = async () => {
    const data = await runAction(
      "Refreshing MLB",
      `${API_URL}/refresh/mlb`,
      { method: "POST" }
    );

    if (data) setRefreshResult(data);
  };

  const gradeMLB = async () => {
    const data = await runAction(
      "Grading MLB",
      `${API_URL}/grade/mlb/history`,
      { method: "POST" }
    );

    if (data) setGradeResult(data);
  };

  const loadPerformance = async () => {
    const data = await runAction(
      "Loading Performance",
      `${API_URL}/model/performance`
    );

    if (data) setPerformance(data);
  };

  return (
    <div style={pageStyle}>
      <h1>Admin Control Panel</h1>

      <p style={subtitleStyle}>
        Refresh models, grade results, and check database performance status.
      </p>

      {error && (
        <div style={errorStyle}>
          {error}
        </div>
      )}

      <div style={buttonGridStyle}>
        <button style={buttonStyle} onClick={refreshMLB} disabled={!!loading}>
          🔄 Refresh MLB
        </button>

        <button style={buttonStyle} onClick={gradeMLB} disabled={!!loading}>
          📊 Grade MLB History
        </button>

        <button style={buttonStyle} onClick={loadPerformance} disabled={!!loading}>
          🧠 Check Performance
        </button>
      </div>

      {loading && (
        <p style={{ color: "#facc15", marginTop: "20px" }}>
          {loading}...
        </p>
      )}

      <div style={gridStyle}>
        <ResultCard title="Refresh Result" data={refreshResult} />
        <ResultCard title="Grade Result" data={gradeResult} />
        <PerformanceCard data={performance} />
      </div>
    </div>
  );
}

function ResultCard({ title, data }) {
  return (
    <div style={cardStyle}>
      <h2>{title}</h2>

      {!data ? (
        <p style={mutedStyle}>No action run yet.</p>
      ) : (
        <pre style={preStyle}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function PerformanceCard({ data }) {
  return (
    <div style={cardStyle}>
      <h2>Performance Status</h2>

      {!data ? (
        <p style={mutedStyle}>No performance check yet.</p>
      ) : data.message ? (
        <p>{data.message}</p>
      ) : (
        <>
          <p>
            <strong>Actionable:</strong>{" "}
            {data.summary?.wins}-{data.summary?.losses}
          </p>
          <p>
            <strong>Win Rate:</strong>{" "}
            {data.summary?.win_rate}%
          </p>
          <p>
            <strong>Units:</strong>{" "}
            {data.summary?.units}
          </p>
          <p>
            <strong>Pass Tracking:</strong>{" "}
            {data.pass_tracking?.wins}-{data.pass_tracking?.losses}
          </p>
          <p>
            <strong>All Graded:</strong>{" "}
            {data.all_graded?.wins}-{data.all_graded?.losses}
          </p>
        </>
      )}
    </div>
  );
}

const pageStyle = {
  backgroundColor: "#020617",
  color: "white",
  minHeight: "100vh",
  padding: "32px",
};

const subtitleStyle = {
  color: "#9ca3af",
  marginBottom: "24px",
};

const buttonGridStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "14px",
  marginBottom: "28px",
};

const buttonStyle = {
  backgroundColor: "#22c55e",
  color: "black",
  border: "none",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "20px",
};

const cardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "20px",
};

const mutedStyle = {
  color: "#9ca3af",
};

const errorStyle = {
  backgroundColor: "#7f1d1d",
  padding: "12px",
  borderRadius: "10px",
  marginBottom: "18px",
};

const preStyle = {
  backgroundColor: "#020617",
  padding: "14px",
  borderRadius: "10px",
  overflowX: "auto",
  whiteSpace: "pre-wrap",
};

export default AdminPage;
