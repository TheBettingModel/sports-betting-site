import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function formatOdds(odds) {
  if (odds === null || odds === undefined || odds === "") return "N/A";
  const num = Number(odds);
  if (Number.isNaN(num)) return odds;
  return num > 0 ? `+${num}` : `${num}`;
}

function getScore(play) {
  return Number(
    play?.universal_pod_score ??
      play?.pod_score ??
      play?.auto_pod_score ??
      play?.top_play_score ??
      play?.final_rating ??
      0
  );
}

function getSport(play) {
  return play?.sport || play?.league || play?.model_sport || "Unknown";
}

function getGame(play) {
  return (
    play?.game ||
    play?.matchup ||
    `${play?.away_team || ""} vs ${play?.home_team || ""}`.trim() ||
    "Game unavailable"
  );
}

function getPick(play) {
  return play?.pick || play?.selection || play?.team || "N/A";
}

function getMarket(play) {
  return play?.market || play?.bet_type || "N/A";
}

function getBook(play) {
  return play?.best_sportsbook || play?.sportsbook || play?.book || "Best Available";
}

function getTier(play) {
  return play?.final_model_tier || play?.tier || play?.market_intelligence_grade || "Model Play";
}

function MainPodCard({ play, rank }) {
  if (!play) return null;

  return (
    <div className={`pod-card pod-card-rank-${rank}`}>
      <div className="pod-card-glow" />

      <div className="pod-card-header">
        <div>
          <span className="rank-pill">#{rank}</span>
          <span className="sport-pill">{getSport(play)}</span>
        </div>
        <div className="score-box">
          <span>POD</span>
          <strong>{getScore(play).toFixed(2)}</strong>
        </div>
      </div>

      <h3>{getGame(play)}</h3>

      <div className="primary-pick">
        <span>{getPick(play)}</span>
        <strong>{formatOdds(play?.best_odds ?? play?.odds)}</strong>
      </div>

      <div className="pod-metrics">
        <div>
          <span>Market</span>
          <strong>{getMarket(play)}</strong>
        </div>
        <div>
          <span>Best Book</span>
          <strong>{getBook(play)}</strong>
        </div>
        <div>
          <span>Edge</span>
          <strong>{play?.edge ?? play?.model_edge ?? "N/A"}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{play?.confidence ?? play?.final_confidence ?? "N/A"}</strong>
        </div>
      </div>

      <div className="pod-footer">
        <span>{getTier(play)}</span>
        <strong>{play?.final_recommendation || play?.recommendation || "Recommended"}</strong>
      </div>
    </div>
  );
}

function SportCard({ sport, play }) {
  if (!play) return null;

  return (
    <div className="sport-card">
      <div className="sport-card-top">
        <span>{sport}</span>
        <strong>{getScore(play).toFixed(2)}</strong>
      </div>

      <h4>{getGame(play)}</h4>

      <div className="sport-pick">
        {getPick(play)} <span>{formatOdds(play?.best_odds ?? play?.odds)}</span>
      </div>

      <div className="sport-card-bottom">
        <span>{getMarket(play)}</span>
        <span>{getBook(play)}</span>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [podData, setPodData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/model/play-of-the-day-v2`)
      .then((res) => res.json())
      .then((data) => setPodData(data))
      .catch(() => setError("Unable to load dashboard data."));
  }, []);

  const topThreeOverall = useMemo(() => {
    const plays = Array.isArray(podData?.top_5) ? podData.top_5 : [];
    return plays.slice(0, 3);
  }, [podData]);

  const bestBySport = podData?.by_sport || {};

  const activeSports = Object.values(bestBySport).filter(Boolean).length;
  const topScore = topThreeOverall[0] ? getScore(topThreeOverall[0]).toFixed(2) : "0.00";

  return (
    <div className="homepage-v4">
      <section className="dashboard-hero">
        <div className="hero-copy">
          <span className="dashboard-label">The Betting Model</span>
          <h1>Model Dashboard</h1>
          <p>
            Universal betting intelligence across every active sport — ranked by POD score,
            market strength, line value, sharp book data, and final model recommendation.
          </p>
        </div>

        <div className="hero-panel">
          <div>
            <span>Top POD Score</span>
            <strong>{topScore}</strong>
          </div>
          <div>
            <span>Active Sports</span>
            <strong>{activeSports}</strong>
          </div>
          <div>
            <span>System</span>
            <strong>Universal v3</strong>
          </div>
        </div>
      </section>

      {error && <div className="dashboard-error">{error}</div>}

      <section className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="dashboard-label">Universal POD v3</span>
            <h2>Top 3 Overall Play of the Day</h2>
          </div>
          <p>Cross-sport ranking with duplicate cleanup and heavy favorite protection.</p>
        </div>

        <div className="pod-grid">
          {topThreeOverall.length > 0 ? (
            topThreeOverall.map((play, index) => (
              <MainPodCard key={`${getGame(play)}-${index}`} play={play} rank={index + 1} />
            ))
          ) : (
            <div className="empty-dashboard-card">No overall POD plays available right now.</div>
          )}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="dashboard-label">Balanced Sport Exposure</span>
            <h2>Best Play By Sport</h2>
          </div>
          <p>One top play from each sport so no single sport dominates the dashboard.</p>
        </div>

        <div className="sport-grid">
          {Object.entries(bestBySport).length > 0 ? (
            Object.entries(bestBySport).map(([sport, play]) => (
              <SportCard key={sport} sport={sport} play={play} />
            ))
          ) : (
            <div className="empty-dashboard-card">No sport-by-sport plays available right now.</div>
          )}
        </div>
      </section>

      <section className="dashboard-section intelligence-strip">
        <div>
          <span className="dashboard-label">Dashboard Intelligence</span>
          <h2>Market Command Center</h2>
        </div>

        <div className="intelligence-grid">
          <div>
            <span>Line Shopping</span>
            <strong>Active</strong>
          </div>
          <div>
            <span>Sharp Book Analysis</span>
            <strong>Active</strong>
          </div>
          <div>
            <span>Market Grades</span>
            <strong>Active</strong>
          </div>
          <div>
            <span>Final Tiers</span>
            <strong>Active</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
