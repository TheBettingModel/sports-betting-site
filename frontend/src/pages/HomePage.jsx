import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function formatOdds(odds) {
  if (odds === null || odds === undefined || odds === "") return "N/A";
  const num = Number(odds);
  if (Number.isNaN(num)) return odds;
  return num > 0 ? `+${num}` : `${num}`;
}

function getScore(play) {
  return (
    play?.universal_pod_score ??
    play?.pod_score ??
    play?.auto_pod_score ??
    play?.top_play_score ??
    0
  );
}

function getSport(play) {
  return play?.sport || play?.league || play?.model_sport || "Unknown";
}

function getGame(play) {
  return play?.game || play?.matchup || `${play?.away_team || ""} vs ${play?.home_team || ""}`.trim();
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

function PlayCard({ play, rank }) {
  if (!play) return null;

  return (
    <div className="home-card">
      <div className="card-top-row">
        <span className="rank-badge">#{rank}</span>
        <span className="sport-badge">{getSport(play)}</span>
      </div>

      <h3>{getGame(play)}</h3>

      <div className="pick-line">
        {getPick(play)} <span>{formatOdds(play?.best_odds ?? play?.odds)}</span>
      </div>

      <div className="card-grid">
        <div>
          <p>Market</p>
          <strong>{getMarket(play)}</strong>
        </div>
        <div>
          <p>Book</p>
          <strong>{getBook(play)}</strong>
        </div>
        <div>
          <p>POD Score</p>
          <strong>{Number(getScore(play)).toFixed(2)}</strong>
        </div>
        <div>
          <p>Tier</p>
          <strong>{play?.final_model_tier || play?.tier || "N/A"}</strong>
        </div>
      </div>

      <div className="recommendation">
        {play?.final_recommendation || play?.recommendation || "Model Play"}
      </div>
    </div>
  );
}

function SportBestCard({ sport, play }) {
  if (!play) return null;

  return (
    <div className="sport-best-card">
      <div className="sport-best-header">
        <span>{sport}</span>
        <strong>{Number(getScore(play)).toFixed(2)}</strong>
      </div>

      <h4>{getGame(play)}</h4>

      <p>
        {getPick(play)} · {getMarket(play)} · {formatOdds(play?.best_odds ?? play?.odds)}
      </p>

      <small>{getBook(play)}</small>
    </div>
  );
}

export default function HomePage() {
  const [podData, setPodData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/model/play-of-the-day-v2`)
      .then((res) => res.json())
      .then((data) => {
        setPodData(data);
      })
      .catch(() => {
        setError("Unable to load dashboard data.");
      });
  }, []);

  const topThreeOverall = Array.isArray(podData?.top_5)
    ? podData.top_5.slice(0, 3)
    : [];

  const bestBySport = podData?.by_sport || {};

  return (
    <div className="homepage">
      <section className="hero-section">
        <div>
          <p className="eyebrow">The Betting Model</p>
          <h1>Sports Betting Dashboard</h1>
          <p>
            Universal model intelligence across every active sport. Built for line shopping,
            sharp market tracking, POD ranking, and long-term betting discipline.
          </p>
        </div>
      </section>

      {error && <div className="error-box">{error}</div>}

      <section className="section-block">
        <div className="section-header">
          <div>
            <p className="eyebrow">Universal POD v3</p>
            <h2>Top 3 Overall Play of the Day</h2>
          </div>
          <p>Ranked by universal POD score across all sports.</p>
        </div>

        <div className="top-three-grid">
          {topThreeOverall.length > 0 ? (
            topThreeOverall.map((play, index) => (
              <PlayCard key={`${getGame(play)}-${index}`} play={play} rank={index + 1} />
            ))
          ) : (
            <div className="empty-card">No overall POD plays available right now.</div>
          )}
        </div>
      </section>

      <section className="section-block">
        <div className="section-header">
          <div>
            <p className="eyebrow">Sport Breakdown</p>
            <h2>Best Play By Sport</h2>
          </div>
          <p>One best model play per sport so MLB does not dominate the homepage.</p>
        </div>

        <div className="sport-best-grid">
          {Object.entries(bestBySport).length > 0 ? (
            Object.entries(bestBySport).map(([sport, play]) => (
              <SportBestCard key={sport} sport={sport} play={play} />
            ))
          ) : (
            <div className="empty-card">No sport-by-sport plays available right now.</div>
          )}
        </div>
      </section>
    </div>
  );
}
