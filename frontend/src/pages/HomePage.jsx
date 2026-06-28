import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

function HomePage() {
  const [podData, setPodData] = useState(null);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    fetch(`${API_URL}/model/play-of-the-day-v2`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setPodData(data))
      .catch((err) => {
        console.error("Homepage POD fetch error:", err);
        setError("Unable to load model dashboard.");
      });
  }, [API_URL]);

  const overallPlay = podData?.overall_play;
  const topPlays = podData?.top_5 || [];
  const bySport = podData?.by_sport || {};

  const activeSports = [
    { name: "MLB", emoji: "⚾", path: "/mlb-model", play: bySport.MLB },
    { name: "WNBA", emoji: "🏀", path: "/wnba-model", play: bySport.WNBA },
    { name: "Soccer", emoji: "⚽", path: "/soccer-model", play: bySport.Soccer },
    { name: "NBA", emoji: "🏀", path: "/model-board", play: bySport.NBA },
    { name: "NFL", emoji: "🏈", path: "/nfl-model", play: bySport.NFL },
    { name: "NCAAF", emoji: "🏈", path: "/ncaaf-model", play: bySport.NCAAF },
    { name: "NHL", emoji: "🏒", path: "/nhl-model", play: bySport.NHL },
  ];

  return (
    <div style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>THE BETTING MODEL</div>
          <h1 style={heroTitleStyle}>Smarter picks. Cleaner data. Better decisions.</h1>
          <p style={heroTextStyle}>
            A multi-sport betting model built around edge, market intelligence,
            line shopping, sharp signals, and universal play grading.
          </p>

          <div style={heroActionsStyle}>
            <Link style={primaryButtonStyle} to="/auto-pod">
              View Play of the Day
            </Link>
            <Link style={secondaryButtonStyle} to="/model-performance">
              View Analytics
            </Link>
          </div>
        </div>

        <div style={heroCardStyle}>
          <div style={cardLabelStyle}>🔥 Overall Model Play</div>

          {overallPlay ? (
            <>
              <h2 style={pickStyle}>{overallPlay.pick}</h2>
              <p style={gameStyle}>{overallPlay.game}</p>

              <div style={miniGridStyle}>
                <MiniStat label="Sport" value={overallPlay.pod_sport || overallPlay.sport} />
                <MiniStat label="Market" value={overallPlay.market} />
                <MiniStat label="Odds" value={overallPlay.best_odds || overallPlay.odds} />
                <MiniStat label="Units" value={overallPlay.units} />
                <MiniStat label="Final Score" value={overallPlay.final_model_score} />
                <MiniStat label="POD Score" value={overallPlay.universal_pod_score} />
              </div>

              <p style={reasonStyle}>
                {overallPlay.sharp_reason || overallPlay.reason || "Model-qualified play."}
              </p>
            </>
          ) : (
            <p style={mutedStyle}>No qualified overall play is available yet.</p>
          )}
        </div>
      </section>

      {error && <p style={errorStyle}>{error}</p>}

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h2>Active Sports</h2>
          <span style={mutedStyle}>Universal model coverage</span>
        </div>

        <div style={sportsGridStyle}>
          {activeSports.map((sport) => (
            <Link key={sport.name} to={sport.path} style={sportCardStyle}>
              <div style={sportTopStyle}>
                <span style={sportEmojiStyle}>{sport.emoji}</span>
                <strong>{sport.name}</strong>
              </div>

              <p style={sportStatusStyle}>
                {sport.play
                  ? `${sport.play.final_recommendation || sport.play.recommendation} available`
                  : "No qualified play"}
              </p>

              {sport.play && (
                <div style={sportPlayStyle}>
                  <span>{sport.play.pick}</span>
                  <small>{sport.play.market}</small>
                </div>
              )}
            </Link>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h2>Top Model Plays</h2>
          <span style={mutedStyle}>{podData?.candidate_count || 0} candidates today</span>
        </div>

        {topPlays.length === 0 ? (
          <p style={mutedStyle}>No qualified top plays available yet.</p>
        ) : (
          <div style={topPlayGridStyle}>
            {topPlays.slice(0, 5).map((play, index) => (
              <div key={`${play.game}-${play.pick}-${index}`} style={playCardStyle}>
                <div style={rankStyle}>#{index + 1}</div>
                <h3 style={smallPickStyle}>{play.pick}</h3>
                <p style={gameStyle}>{play.game}</p>

                <div style={tagWrapStyle}>
                  <span style={tagStyle}>{play.pod_sport || play.sport || "Model"}</span>
                  <span style={tagStyle}>{play.market}</span>
                  <span style={tagStyle}>{play.final_model_tier || "N/A"}</span>
                </div>

                <div style={miniGridStyle}>
                  <MiniStat label="Odds" value={play.best_odds || play.odds} />
                  <MiniStat label="Edge" value={`${play.edge}%`} />
                  <MiniStat label="Score" value={play.final_model_score} />
                  <MiniStat label="POD" value={play.universal_pod_score} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <div style={featureGridStyle}>
          <Feature title="Market Intelligence" text="Tracks sportsbook disagreement, stale lines, price gaps, and best available odds." />
          <Feature title="Universal Rating" text="Every play receives a final model score, tier, stars, and recommendation." />
          <Feature title="Line Shopping" text="Highlights best sportsbook, worst price, and line-shop value across books." />
          <Feature title="POD Engine" text="Ranks plays across every sport using one universal scoring system." />
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={miniStatStyle}>
      <span>{label}</span>
      <strong>{value ?? "N/A"}</strong>
    </div>
  );
}

function Feature({ title, text }) {
  return (
    <div style={featureCardStyle}>
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

const heroStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
  gap: "28px",
  alignItems: "stretch",
  marginBottom: "34px",
};

const eyebrowStyle = {
  color: "#22c55e",
  fontWeight: "bold",
  letterSpacing: "0.14em",
  fontSize: "13px",
  marginBottom: "14px",
};

const heroTitleStyle = {
  fontSize: "48px",
  lineHeight: "1.05",
  margin: "0 0 18px",
  maxWidth: "780px",
};

const heroTextStyle = {
  color: "#cbd5e1",
  fontSize: "18px",
  lineHeight: "1.7",
  maxWidth: "760px",
};

const heroActionsStyle = {
  display: "flex",
  gap: "14px",
  flexWrap: "wrap",
  marginTop: "26px",
};

const primaryButtonStyle = {
  backgroundColor: "#22c55e",
  color: "black",
  textDecoration: "none",
  padding: "13px 18px",
  borderRadius: "999px",
  fontWeight: "bold",
};

const secondaryButtonStyle = {
  backgroundColor: "#111827",
  color: "white",
  textDecoration: "none",
  padding: "13px 18px",
  borderRadius: "999px",
  border: "1px solid #374151",
  fontWeight: "bold",
};

const heroCardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #22c55e",
  borderRadius: "22px",
  padding: "24px",
  boxShadow: "0 0 30px rgba(34,197,94,0.18)",
};

const cardLabelStyle = {
  display: "inline-block",
  backgroundColor: "#22c55e",
  color: "black",
  padding: "7px 11px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "13px",
  marginBottom: "16px",
};

const pickStyle = {
  fontSize: "30px",
  margin: "0 0 8px",
};

const smallPickStyle = {
  fontSize: "20px",
  margin: "0 0 8px",
};

const gameStyle = {
  color: "#cbd5e1",
  margin: "0 0 14px",
};

const reasonStyle = {
  color: "#d1d5db",
  lineHeight: "1.6",
  marginTop: "16px",
};

const mutedStyle = {
  color: "#94a3b8",
};

const errorStyle = {
  color: "#f87171",
};

const sectionStyle = {
  marginTop: "34px",
};

const sectionHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "center",
  marginBottom: "16px",
};

const sportsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "16px",
};

const sportCardStyle = {
  backgroundColor: "#111827",
  color: "white",
  textDecoration: "none",
  border: "1px solid #374151",
  borderRadius: "18px",
  padding: "18px",
};

const sportTopStyle = {
  display: "flex",
  gap: "10px",
  alignItems: "center",
  fontSize: "18px",
};

const sportEmojiStyle = {
  fontSize: "24px",
};

const sportStatusStyle = {
  color: "#94a3b8",
  marginBottom: "10px",
};

const sportPlayStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  color: "#d1d5db",
};

const topPlayGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "16px",
};

const playCardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "18px",
  padding: "18px",
  position: "relative",
};

const rankStyle = {
  position: "absolute",
  top: "14px",
  right: "14px",
  color: "#22c55e",
  fontWeight: "bold",
};

const miniGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "10px",
};

const miniStatStyle = {
  backgroundColor: "#020617",
  border: "1px solid #334155",
  borderRadius: "12px",
  padding: "10px",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  color: "#94a3b8",
};

const tagWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "14px",
};

const tagStyle = {
  backgroundColor: "#1f2937",
  border: "1px solid #374151",
  borderRadius: "999px",
  padding: "6px 9px",
  fontSize: "12px",
  fontWeight: "bold",
};

const featureGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "16px",
};

const featureCardStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: "18px",
  padding: "20px",
  color: "#d1d5db",
};

export default HomePage;
