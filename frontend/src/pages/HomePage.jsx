import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

function HomePage() {
  const [podData, setPodData] = useState(null);
  const [cacheData, setCacheData] = useState(null);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/model/play-of-the-day-v2`).then((res) => {
        if (!res.ok) throw new Error(`POD HTTP ${res.status}`);
        return res.json();
      }),
      fetch(`${API_URL}/debug/pod-cache`).then((res) => {
        if (!res.ok) return null;
        return res.json();
      }),
    ])
      .then(([pod, cache]) => {
        setPodData(pod);
        setCacheData(cache);
      })
      .catch((err) => {
        console.error("Homepage dashboard fetch error:", err);
        setError("Unable to load model dashboard.");
      });
  }, [API_URL]);

  const overallPlay = podData?.overall_play;
  const topPlays = podData?.top_5 || [];
  const bySport = podData?.by_sport || {};
  const candidateCount = podData?.candidate_count || 0;

  const sportCards = useMemo(
    () => [
      {
        name: "MLB",
        emoji: "⚾",
        path: "/mlb-model",
        cacheKey: "mlb_model",
        extraCacheKeys: ["mlb_f5_model", "mlb_nrfi_model"],
        play: bySport.MLB,
      },
      {
        name: "WNBA",
        emoji: "🏀",
        path: "/wnba-model",
        cacheKey: "wnba_model",
        play: bySport.WNBA,
      },
      {
        name: "Soccer",
        emoji: "⚽",
        path: "/soccer-model",
        cacheKey: "soccer_model",
        play: bySport.Soccer,
      },
      {
        name: "NBA",
        emoji: "🏀",
        path: "/model-board",
        cacheKey: "nba_model",
        play: bySport.NBA,
      },
      {
        name: "NFL",
        emoji: "🏈",
        path: "/nfl-model",
        cacheKey: "nfl_model",
        play: bySport.NFL,
      },
      {
        name: "NCAAF",
        emoji: "🏈",
        path: "/ncaaf-model",
        cacheKey: "ncaaf_model",
        play: bySport.NCAAF,
      },
      {
        name: "NHL",
        emoji: "🏒",
        path: "/nhl-model",
        cacheKey: "nhl_model",
        play: bySport.NHL,
      },
    ],
    [bySport]
  );

  const totalCachedPlays = sportCards.reduce((sum, sport) => {
    const base = Number(cacheData?.[sport.cacheKey]?.count || 0);
    const extras = (sport.extraCacheKeys || []).reduce(
      (extraSum, key) => extraSum + Number(cacheData?.[key]?.count || 0),
      0
    );
    return sum + base + extras;
  }, 0);

  return (
    <div style={pageStyle}>
      <section style={heroGridStyle}>
        <div style={heroLeftStyle}>
          <div style={eyebrowStyle}>THE BETTING MODEL</div>
          <h1 style={titleStyle}>The model board built for serious bettors.</h1>
          <p style={heroTextStyle}>
            Multi-sport betting intelligence powered by edge detection, sportsbook
            comparison, market intelligence, final ratings, and a universal Play of
            the Day engine.
          </p>

          <div style={heroButtonWrapStyle}>
            <Link to="/auto-pod" style={primaryButtonStyle}>
              View Play of the Day
            </Link>
            <Link to="/admin" style={secondaryButtonStyle}>
              Refresh Models
            </Link>
            <Link to="/model-performance" style={secondaryButtonStyle}>
              Analytics
            </Link>
          </div>

          <div style={metricStripStyle}>
            <Metric label="Qualified Plays" value={candidateCount} />
            <Metric label="Cached Plays" value={totalCachedPlays} />
            <Metric label="Active Sports" value={sportCards.filter((s) => getSportCount(s, cacheData) > 0).length} />
          </div>
        </div>

        <FeaturedPod play={overallPlay} />
      </section>

      {error && <p style={errorStyle}>{error}</p>}

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Today's Top Plays</h2>
            <p style={sectionSubtitleStyle}>
              Price-safe, deduped, universal model rankings.
            </p>
          </div>
          <Link to="/auto-pod" style={smallLinkStyle}>
            Full POD Board →
          </Link>
        </div>

        {topPlays.length === 0 ? (
          <EmptyCard text="No qualified plays available yet. Refresh models from Admin." />
        ) : (
          <div style={topPlayGridStyle}>
            {topPlays.slice(0, 5).map((play, index) => (
              <TopPlayCard key={`${play.game}-${play.pick}-${index}`} play={play} rank={index + 1} />
            ))}
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Sport Model Status</h2>
            <p style={sectionSubtitleStyle}>
              Each sport feeds the same universal backend pipeline.
            </p>
          </div>
        </div>

        <div style={sportGridStyle}>
          {sportCards.map((sport) => (
            <SportCard
              key={sport.name}
              sport={sport}
              count={getSportCount(sport, cacheData)}
            />
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={featureGridStyle}>
          <FeatureCard
            title="Universal POD Engine"
            text="Ranks every sport using one price-safe, deduped scoring system."
          />
          <FeatureCard
            title="Market Intelligence"
            text="Grades line disagreement, stale prices, sharp signals, and line shopping value."
          />
          <FeatureCard
            title="Final Rating System"
            text="Every play receives a model score, tier, stars, and final recommendation."
          />
          <FeatureCard
            title="Built To Scale"
            text="NCAA Basketball and UFC can plug into the same backend pipeline next."
          />
        </div>
      </section>
    </div>
  );
}

function getSportCount(sport, cacheData) {
  if (!cacheData) return 0;

  const base = Number(cacheData?.[sport.cacheKey]?.count || 0);
  const extras = (sport.extraCacheKeys || []).reduce(
    (sum, key) => sum + Number(cacheData?.[key]?.count || 0),
    0
  );

  return base + extras;
}

function FeaturedPod({ play }) {
  if (!play) {
    return (
      <div style={featuredCardStyle}>
        <div style={cardLabelStyle}>🔥 Overall POD</div>
        <h2>No Qualified Play</h2>
        <p style={mutedStyle}>Refresh models to generate today's board.</p>
      </div>
    );
  }

  return (
    <div style={featuredCardStyle}>
      <div style={cardLabelStyle}>🔥 Overall POD</div>

      <div style={podSportRowStyle}>
        <span style={pillStyle}>{play.pod_sport || play.sport || "Model"}</span>
        <span style={pillStyle}>{play.market || "Market"}</span>
        <span style={greenPillStyle}>{play.final_recommendation || play.recommendation}</span>
      </div>

      <h2 style={featuredPickStyle}>{play.pick}</h2>
      <p style={gameTextStyle}>{play.game}</p>

      <div style={miniGridStyle}>
        <MiniStat label="Best Odds" value={play.best_odds || play.odds} />
        <MiniStat label="Units" value={play.units} />
        <MiniStat label="Edge" value={formatPercent(play.edge)} />
        <MiniStat label="Final Score" value={play.final_model_score} />
        <MiniStat label="POD Score" value={play.universal_pod_score} />
        <MiniStat label="Best Book" value={play.best_sportsbook || play.sportsbook} />
      </div>

      <p style={reasonStyle}>
        {play.sharp_reason || play.reason || "Model-qualified play."}
      </p>
    </div>
  );
}

function TopPlayCard({ play, rank }) {
  return (
    <div style={playCardStyle}>
      <div style={rankBadgeStyle}>#{rank}</div>

      <div style={podSportRowStyle}>
        <span style={pillStyle}>{play.pod_sport || play.sport || "Model"}</span>
        <span style={pillStyle}>{play.market}</span>
      </div>

      <h3 style={playPickStyle}>{play.pick}</h3>
      <p style={gameTextStyle}>{play.game}</p>

      <div style={miniGridStyle}>
        <MiniStat label="Odds" value={play.best_odds || play.odds} />
        <MiniStat label="Edge" value={formatPercent(play.edge)} />
        <MiniStat label="Tier" value={play.final_model_tier} />
        <MiniStat label="Score" value={play.final_model_score} />
      </div>
    </div>
  );
}

function SportCard({ sport, count }) {
  const play = sport.play;

  return (
    <Link to={sport.path} style={sportCardStyle}>
      <div style={sportTopRowStyle}>
        <span style={sportEmojiStyle}>{sport.emoji}</span>
        <div>
          <h3 style={sportTitleStyle}>{sport.name}</h3>
          <p style={sportMetaStyle}>{count} cached plays</p>
        </div>
      </div>

      {play ? (
        <div style={sportPlayBoxStyle}>
          <strong>{play.pick}</strong>
          <span>{play.market}</span>
          <span>{play.final_recommendation || play.recommendation}</span>
        </div>
      ) : (
        <p style={mutedStyle}>No qualified play currently.</p>
      )}
    </Link>
  );
}

function Metric({ label, value }) {
  return (
    <div style={metricStyle}>
      <span>{label}</span>
      <strong>{value ?? "N/A"}</strong>
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

function FeatureCard({ title, text }) {
  return (
    <div style={featureCardStyle}>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function EmptyCard({ text }) {
  return <div style={emptyCardStyle}>{text}</div>;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  return `${value}%`;
}

const pageStyle = {
  background: "radial-gradient(circle at top left, #0f172a 0, #020617 42%)",
  color: "white",
  minHeight: "100vh",
  padding: "32px",
};

const heroGridStyle = {
  display: "grid",
  gridTemplateColumns: "1.15fr 0.85fr",
  gap: "28px",
  alignItems: "stretch",
};

const heroLeftStyle = {
  backgroundColor: "rgba(15, 23, 42, 0.72)",
  border: "1px solid #1f2937",
  borderRadius: "26px",
  padding: "32px",
};

const eyebrowStyle = {
  color: "#22c55e",
  fontWeight: "bold",
  letterSpacing: "0.16em",
  fontSize: "13px",
  marginBottom: "16px",
};

const titleStyle = {
  fontSize: "52px",
  lineHeight: "1.02",
  margin: "0 0 18px",
  maxWidth: "850px",
};

const heroTextStyle = {
  color: "#cbd5e1",
  fontSize: "18px",
  lineHeight: "1.7",
  maxWidth: "850px",
};

const heroButtonWrapStyle = {
  display: "flex",
  gap: "12px",
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

const metricStripStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "12px",
  marginTop: "28px",
};

const metricStyle = {
  backgroundColor: "#020617",
  border: "1px solid #334155",
  borderRadius: "16px",
  padding: "14px",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  color: "#94a3b8",
};

const featuredCardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #22c55e",
  borderRadius: "26px",
  padding: "26px",
  boxShadow: "0 0 34px rgba(34, 197, 94, 0.18)",
};

const cardLabelStyle = {
  display: "inline-block",
  backgroundColor: "#22c55e",
  color: "black",
  padding: "7px 11px",
  borderRadius: "999px",
  fontWeight: "bold",
  marginBottom: "16px",
};

const featuredPickStyle = {
  fontSize: "32px",
  margin: "14px 0 8px",
};

const gameTextStyle = {
  color: "#cbd5e1",
  margin: "0 0 14px",
};

const sectionStyle = {
  marginTop: "36px",
};

const sectionHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "end",
  gap: "16px",
  marginBottom: "16px",
};

const sectionTitleStyle = {
  margin: 0,
};

const sectionSubtitleStyle = {
  color: "#94a3b8",
  margin: "6px 0 0",
};

const smallLinkStyle = {
  color: "#22c55e",
  textDecoration: "none",
  fontWeight: "bold",
};

const topPlayGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "16px",
};

const playCardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "20px",
  padding: "20px",
  position: "relative",
};

const rankBadgeStyle = {
  position: "absolute",
  top: "16px",
  right: "16px",
  color: "#22c55e",
  fontWeight: "bold",
};

const podSportRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "12px",
};

const pillStyle = {
  backgroundColor: "#1f2937",
  border: "1px solid #374151",
  borderRadius: "999px",
  padding: "6px 9px",
  fontSize: "12px",
  fontWeight: "bold",
};

const greenPillStyle = {
  ...pillStyle,
  backgroundColor: "#22c55e",
  color: "black",
  border: "1px solid #22c55e",
};

const playPickStyle = {
  fontSize: "22px",
  margin: "0 0 8px",
};

const miniGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "10px",
};

const miniStatStyle = {
  backgroundColor: "#020617",
  border: "1px solid #334155",
  borderRadius: "13px",
  padding: "10px",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  color: "#94a3b8",
  minWidth: 0,
};

const reasonStyle = {
  color: "#d1d5db",
  lineHeight: "1.6",
  marginTop: "16px",
};

const sportGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: "16px",
};

const sportCardStyle = {
  backgroundColor: "#111827",
  color: "white",
  textDecoration: "none",
  border: "1px solid #374151",
  borderRadius: "20px",
  padding: "18px",
};

const sportTopRowStyle = {
  display: "flex",
  gap: "12px",
  alignItems: "center",
};

const sportEmojiStyle = {
  fontSize: "28px",
};

const sportTitleStyle = {
  margin: 0,
};

const sportMetaStyle = {
  color: "#94a3b8",
  margin: "4px 0 0",
};

const sportPlayBoxStyle = {
  marginTop: "14px",
  backgroundColor: "#020617",
  border: "1px solid #334155",
  borderRadius: "14px",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  color: "#d1d5db",
};

const featureGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "16px",
};

const featureCardStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: "20px",
  padding: "20px",
  color: "#d1d5db",
};

const emptyCardStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "20px",
  padding: "24px",
  color: "#94a3b8",
};

const mutedStyle = {
  color: "#94a3b8",
};

const errorStyle = {
  color: "#f87171",
};

export default HomePage;
