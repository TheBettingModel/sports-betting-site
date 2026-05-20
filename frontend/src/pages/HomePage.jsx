import { Link } from "react-router-dom";

function HomePage() {
  const cardStyle = {
    backgroundColor: "#111827",
    border: "1px solid #374151",
    borderRadius: "14px",
    padding: "24px",
    marginBottom: "20px",
  };

  const buttonStyle = {
    display: "inline-block",
    marginTop: "12px",
    padding: "12px 18px",
    backgroundColor: "#e10600",
    color: "white",
    textDecoration: "none",
    borderRadius: "8px",
    fontWeight: "bold",
  };

  return (
    <div style={{ padding: "40px", color: "white" }}>
      <section style={{ maxWidth: "900px", marginBottom: "40px" }}>
        <h1 style={{ fontSize: "42px", marginBottom: "12px" }}>
          The Betting Model
        </h1>

        <p style={{ fontSize: "20px", color: "#d1d5db", lineHeight: "1.6" }}>
          A sports betting intelligence platform built to identify value across
          major markets using live odds, market pricing, player data, pitching
          matchups, weather, confidence scores, and model-driven edge detection.
        </p>

        <p style={{ color: "#9ca3af", lineHeight: "1.6" }}>
          Our goal is simple: provide sharper insight, cleaner betting context,
          and transparent model reasoning before the market moves.
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "20px",
          maxWidth: "1100px",
        }}
      >
      

        <div style={cardStyle}>
          <h2>NBA Model</h2>
          <p style={{ color: "#d1d5db", lineHeight: "1.6" }}>
            View NBA model projections with pricing logic, confidence scoring,
            playoff adjustments, and best available model plays.
          </p>
          <Link style={buttonStyle} to="/model-board">
            View NBA Model
          </Link>
        </div>

        <div style={cardStyle}>
          <h2>MLB Model</h2>
          <p style={{ color: "#d1d5db", lineHeight: "1.6" }}>
            View MLB model insights powered by pitcher ratings, bullpen fatigue,
            ballpark factors, weather environment, and market edge.
          </p>
          <Link style={buttonStyle} to="/mlb-model">
            View MLB Model
          </Link>
        </div>
      </section>

      <section
        style={{
          marginTop: "40px",
          maxWidth: "900px",
          padding: "20px",
          borderTop: "1px solid #374151",
          color: "#9ca3af",
          fontSize: "14px",
          lineHeight: "1.6",
        }}
      >
        <p>
          The Betting Model is built for research, education, and sports betting
          analysis. No model can guarantee results. Always bet responsibly and
          within your limits.
        </p>
      </section>
    </div>
  );
}

export default HomePage;
