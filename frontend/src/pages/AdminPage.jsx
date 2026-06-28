import { useState } from "react";

function AdminPage() {
  const [loading, setLoading] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  const refreshItems = [
    { label: "Refresh All", endpoint: "/refresh/all", emoji: "🚀", featured: true },
    { label: "MLB", endpoint: "/refresh/mlb", emoji: "⚾" },
    { label: "NBA", endpoint: "/refresh/nba", emoji: "🏀" },
    { label: "WNBA", endpoint: "/refresh/wnba", emoji: "🏀" },
    { label: "NFL", endpoint: "/refresh/nfl", emoji: "🏈" },
    { label: "NCAAF", endpoint: "/refresh/ncaaf", emoji: "🏈" },
    { label: "NHL", endpoint: "/refresh/nhl", emoji: "🏒" },
    { label: "Soccer", endpoint: "/refresh/soccer", emoji: "⚽" },
  ];

  const runRefresh = async (item) => {
    setLoading(item.label);
    setError("");
    setResults(null);

    try {
      const res = await fetch(`${API_URL}${item.endpoint}`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      setResults({
        label: item.label,
        data,
      });
    } catch (err) {
      console.error("Refresh error:", err);
      setError(`Failed to run ${item.label}.`);
    } finally {
      setLoading("");
    }
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>ADMIN CONTROL CENTER</div>
          <h1>Model Refresh Dashboard</h1>
          <p style={subtitleStyle}>
            Refresh all sport models, rebuild caches, update Play of the Day inputs,
            and prepare the analytics pipeline.
          </p>
        </div>
      </div>

      <section style={panelStyle}>
        <h2>Refresh Controls</h2>

        <div style={gridStyle}>
          {refreshItems.map((item) => (
            <button
              key={item.label}
              onClick={() => runRefresh(item)}
              disabled={Boolean(loading)}
              style={item.featured ? featuredButtonStyle : buttonStyle}
            >
              <span style={emojiStyle}>{item.emoji}</span>
              <span>{loading === item.label ? "Running..." : item.label}</span>
            </button>
          ))}
        </div>
      </section>

      {error && <p style={errorStyle}>{error}</p>}

      {results && (
        <section style={resultPanelStyle}>
          <div style={resultHeaderStyle}>
            <h2>{results.label} Results</h2>
            <span style={successBadgeStyle}>Complete</span>
          </div>

          <pre style={preStyle}>{JSON.stringify(results.data, null, 2)}</pre>
        </section>
      )}

      <section style={infoGridStyle}>
        <InfoCard
          title="Current Workflow"
          text="Use Refresh All before checking Play of the Day or model pages."
        />
        <InfoCard
          title="Next Automation"
          text="We can schedule /refresh/all so the models update automatically without opening Admin."
        />
        <InfoCard
          title="Future Grading"
          text="The next backend step is automatic result grading and analytics refresh."
        />
      </section>
    </div>
  );
}

function InfoCard({ title, text }) {
  return (
    <div style={infoCardStyle}>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

const pageStyle = {
  backgroundColor: "#020617",
  color: "white",
  minHeight: "100vh",
  padding: "32px",
};

const headerStyle = {
  marginBottom: "28px",
};

const eyebrowStyle = {
  color: "#22c55e",
  fontWeight: "bold",
  letterSpacing: "0.14em",
  fontSize: "13px",
  marginBottom: "10px",
};

const subtitleStyle = {
  color: "#9ca3af",
  maxWidth: "820px",
  lineHeight: "1.6",
};

const panelStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "20px",
  padding: "24px",
  marginBottom: "24px",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
  marginTop: "18px",
};

const buttonStyle = {
  backgroundColor: "#1f2937",
  color: "white",
  border: "1px solid #374151",
  borderRadius: "16px",
  padding: "18px",
  cursor: "pointer",
  fontWeight: "bold",
  fontSize: "16px",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "10px",
};

const featuredButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#22c55e",
  color: "black",
  border: "1px solid #22c55e",
};

const emojiStyle = {
  fontSize: "22px",
};

const errorStyle = {
  color: "#f87171",
};

const resultPanelStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "20px",
  padding: "24px",
  marginBottom: "24px",
};

const resultHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
};

const successBadgeStyle = {
  backgroundColor: "#22c55e",
  color: "black",
  padding: "7px 11px",
  borderRadius: "999px",
  fontWeight: "bold",
};

const preStyle = {
  backgroundColor: "#020617",
  border: "1px solid #374151",
  borderRadius: "14px",
  padding: "16px",
  overflowX: "auto",
  color: "#d1d5db",
  maxHeight: "520px",
};

const infoGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "16px",
};

const infoCardStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: "18px",
  padding: "20px",
  color: "#d1d5db",
};

export default AdminPage;
