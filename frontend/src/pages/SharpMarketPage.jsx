import { useEffect, useMemo, useState } from "react";

function SharpMarketPage() {
  const [plays, setPlays] = useState([]);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    fetch(`${API_URL}/model/mlb/today`)
      .then((res) => res.json())
      .then((data) => {
        if (data.plays) {
          setPlays(data.plays);
        } else {
          setError("Failed to load Sharp Market.");
        }
      })
      .catch(() => {
        setError("Failed to load Sharp Market.");
      });
  }, [API_URL]);

  const sharpPlays = useMemo(() => {
    return plays.filter((play) => play.sharp_signal === "Sharp Play");
  }, [plays]);

  const valueWatch = useMemo(() => {
    return plays.filter((play) => play.sharp_signal === "Value Watch");
  }, [plays]);

  const marketCaution = useMemo(() => {
    return plays.filter((play) => play.sharp_signal === "Market Caution");
  }, [plays]);

  const plusMoney = useMemo(() => {
    return plays.filter((play) => Number(play.odds) > 0);
  }, [plays]);

  const badgeStyle = {
    backgroundColor: "#1f2937",
    border: "1px solid #374151",
    color: "white",
    padding: "8px 12px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: "600",
  };

  const renderCard = (play) => {
    return (
      <div
        key={`${play.game}-${play.pick}-${play.market}`}
        style={{
          backgroundColor: "#0f172a",
          border: "1px solid #374151",
          borderRadius: "16px",
          padding: "22px",
          marginBottom: "18px",
        }}
      >
        <p style={{ color: "#9ca3af", fontSize: "14px" }}>
          {play.market} • {play.sportsbook}
        </p>

        <h2 style={{ marginBottom: "6px" }}>{play.pick}</h2>

        <h3 style={{ color: "#d1d5db", marginBottom: "16px" }}>
          {play.game}
        </h3>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <span style={badgeStyle}>Odds: {play.odds}</span>
          <span style={badgeStyle}>Edge: {play.edge}%</span>
          <span style={badgeStyle}>Confidence: {play.confidence}%</span>
          <span style={badgeStyle}>Price: {play.price_profile || "N/A"}</span>
          <span style={badgeStyle}>Market: {play.market_strength || "N/A"}</span>
        </div>

        <div
          style={{
            backgroundColor: "#111827",
            border: "1px solid #374151",
            borderRadius: "12px",
            padding: "14px",
          }}
        >
          <strong>{play.sharp_signal || "No Signal"}</strong>
          <p style={{ color: "#d1d5db", lineHeight: "1.7" }}>
            Score: {play.sharp_score ?? "N/A"} —{" "}
            {play.sharp_reason || "No market signal available."}
          </p>
        </div>
      </div>
    );
  };

  const renderSection = (title, subtitle, sectionPlays) => (
    <section style={{ marginBottom: "42px" }}>
      <h2 style={{ fontSize: "28px", marginBottom: "6px" }}>{title}</h2>
      <p style={{ color: "#9ca3af", marginBottom: "18px" }}>{subtitle}</p>

      {sectionPlays.length === 0 ? (
        <p style={{ color: "#9ca3af" }}>No plays in this section.</p>
      ) : (
        sectionPlays.map(renderCard)
      )}
    </section>
  );

  return (
    <div
      style={{
        backgroundColor: "#020617",
        minHeight: "100vh",
        color: "white",
        padding: "30px",
      }}
    >
      <h1 style={{ fontSize: "42px", marginBottom: "10px" }}>
        Sharp Market
      </h1>

      <p
        style={{
          color: "#9ca3af",
          maxWidth: "900px",
          lineHeight: "1.7",
          marginBottom: "35px",
        }}
      >
        Market intelligence dashboard identifying sharp plays, value watch
        spots, plus-money opportunities, and market caution signals using the
        model edge engine.
      </p>

      {error ? (
        <p>{error}</p>
      ) : (
        <>
          {renderSection(
            "Sharp Plays",
            "Strongest market signals based on model edge, price profile, and recommendation strength.",
            sharpPlays
          )}

          {renderSection(
            "Value Watch",
            "Playable market signals that may be worth monitoring before locking in.",
            valueWatch
          )}

          {renderSection(
            "Best Plus-Money Spots",
            "Underdog or plus-price opportunities with model support.",
            plusMoney
          )}

          {renderSection(
            "Market Caution",
            "Signals where pricing or model strength is not favorable.",
            marketCaution
          )}
        </>
      )}
    </div>
  );
}

export default SharpMarketPage;
