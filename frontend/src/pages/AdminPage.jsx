import { useState } from "react";

function AdminPage() {
  const [loading, setLoading] = useState("");
  const [mlbRefreshResult, setMlbRefreshResult] = useState(null);
  const [nbaRefreshResult, setNbaRefreshResult] = useState(null);
  const [mlbGradeResult, setMlbGradeResult] = useState(null);
  const [nbaGradeResult, setNbaGradeResult] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  const runAction = async (label, url, setter, options = {}) => {
    setLoading(label);
    setError("");

    try {
      const res = await fetch(url, options);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setter(data);
    } catch (err) {
      setError(err.message || "Action failed");
    } finally {
      setLoading("");
    }
  };

  return (
    <div style={pageStyle}>
      <h1>Admin Control Panel</h1>

      <p style={subtitleStyle}>
        Internal controls for refreshing models, grading history, and checking performance.
      </p>

      {error && <div style={errorStyle}>{error}</div>}

      <section style={sectionStyle}>
        <h2>Model Refresh</h2>

        <div style={buttonGridStyle}>
          <button
            style={buttonStyle}
            onClick={() =>
              runAction(
                "Refreshing MLB",
                `${API_URL}/refresh/mlb`,
                setMlbRefreshResult,
                { method: "POST" }
              )
            }
            disabled={!!loading}
          >
            ⚾ Refresh MLB
          </button>

          <button
            style={buttonStyle}
            onClick={() =>
              runAction(
                "Refreshing NBA",
                `${API_URL}/refresh/nba`,
                setNbaRefreshResult,
                { method: "POST" }
              )
            }
            disabled={!!loading}
          >
            🏀 Refresh NBA
          </button>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2>Historical Grading</h2>

        <div style={buttonGridStyle}>
          <button
            style={buttonStyle}
            onClick={() =>
              runAction(
                "Grading MLB",
                `${API_URL}/grade/mlb/history`,
                setMlbGradeResult,
                { method: "POST" }
              )
            }
            disabled={!!loading}
          >
            📊 Grade MLB
          </button>

          <button
            style={buttonStyle}
            onClick={() =>
              runAction(
                "Grading NBA",
                `${API_URL}/grade/nba/history`,
                setNbaGradeResult,
                { method: "POST" }
              )
            }
            disabled={!!loading}
          >
            📊 Grade NBA
          </button>

          <button
            style={secondaryButtonStyle}
            onClick={() =>
              runAction(
                "Loading Performance",
                `${API_URL}/model/performance`,
                setPerformance
              )
            }
            disabled={!!loading}
          >
            🧠 Check Performance
          </button>
        </div>
      </section>

      {loading && (
        <p style={{ color: "#facc15", marginTop: "20px" }}>
          {loading}...
        </p>
      )}

      <div style={gridStyle}>
        <ResultCard title="MLB Refresh" data={mlbRefreshResult} />
        <ResultCard title="NBA Refresh" data={nbaRefreshResult} />
        <ResultCard title="MLB Grading" data={mlbGradeResult} />
        <ResultCard title="NBA Grading" data={nbaGradeResult} />
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
        <pre style={preStyle}>{JSON.stringify(data, null, 2)}</pre>
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
            <strong>Win Rate:</strong> {data.summary?.win_rate}%
          </p>
          <p>
            <strong>Units:</strong> {data.summary?.units}
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

const sectionStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: "16px",
  padding: "20px",
  marginBottom: "22px",
};

const buttonGridStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "14px",
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

const secondaryButtonStyle = {
  backgroundColor: "#38bdf8",
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
  maxHeight: "320px",
};

export default AdminPage;