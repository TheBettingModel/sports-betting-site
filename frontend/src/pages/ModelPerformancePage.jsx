import { useEffect, useState } from "react";

function ModelPerformancePage() {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/model/performance`)
      .then((res) => res.json())
      .then((json) => {
        if (json.message) {
          setMessage(json.message);
        } else {
          setData(json);
        }
      })
      .catch(() => setMessage("Failed to load performance"));
  }, []);

  const renderSignal = (title, values = {}) => (
    <div style={cardStyle}>
      <h3>{title}</h3>

      {Object.entries(values).map(([name, stats]) => (
        <div key={name} style={rowStyle}>
          <strong>{name}</strong>

          <p>
            {stats.wins}-{stats.losses}
            {" "}
            ({stats.win_rate}%)
          </p>

          <p>
            Units: {stats.units}
          </p>
        </div>
      ))}
    </div>
  );

  if (message) {
    return (
      <div style={pageStyle}>
        <h1>Model Performance</h1>
        <p>{message}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={pageStyle}>
        Loading...
      </div>
    );
  }

  return (
    <div style={pageStyle}>

      <h1>Model Performance Dashboard</h1>

      <div style={summaryStyle}>
        <h2>Overall</h2>

        <p>
          Record:
          {" "}
          {data.summary.wins}-{data.summary.losses}
        </p>

        <p>
          Win Rate:
          {" "}
          {data.summary.win_rate}%
        </p>

        <p>
          Units:
          {" "}
          {data.summary.units}
        </p>
      </div>

      <div style={gridStyle}>

        {renderSignal(
          "Market Performance",
          data.signals.market
        )}

        {renderSignal(
          "Recommendation",
          data.signals.recommendation
        )}

        {renderSignal(
          "Sharp Signals",
          data.signals.sharp_signal
        )}

        {renderSignal(
          "CLV Results",
          data.signals.clv_status
        )}

        {renderSignal(
          "Steam Movement",
          data.signals.steam_strength
        )}

        {renderSignal(
          "Bullpen Risk",
          data.signals.high_leverage_risk
        )}

      </div>
    </div>
  );
}


const pageStyle = {
  backgroundColor: "#020617",
  color: "white",
  minHeight: "100vh",
  padding: "32px",
};


const summaryStyle = {
  backgroundColor: "#111827",
  padding: "24px",
  borderRadius: "16px",
  marginBottom: "30px",
};


const gridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(300px,1fr))",
  gap: "20px",
};


const cardStyle = {
  backgroundColor: "#111827",
  padding: "20px",
  borderRadius: "14px",
};


const rowStyle = {
  borderTop: "1px solid #374151",
  paddingTop: "10px",
  marginTop: "10px",
};


export default ModelPerformancePage;
