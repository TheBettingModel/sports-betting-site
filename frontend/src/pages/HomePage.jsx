import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
}

function getPodScore(play) {
  return Number(play?.universal_pod_score ?? play?.top_play_score ?? play?.final_model_score ?? 0);
}

function getSport(play) {
  return play?.pod_sport || play?.sport || play?.league || "Unknown";
}

function getBook(play) {
  return play?.best_sportsbook || play?.best_book || play?.sportsbook || "N/A";
}

function getOdds(play) {
  return play?.best_odds ?? play?.odds;
}

function getTier(play) {
  return play?.final_model_tier || play?.universal_pod_tier || play?.market_intelligence_grade || "N/A";
}

function getRecommendation(play) {
  return play?.final_recommendation || play?.recommendation || "N/A";
}

function Metric({ label, value, strong = false }) {
  return (
    <div className="tbm-metric">
      <span>{label}</span>
      <strong className={strong ? "tbm-metric-strong" : ""}>{value ?? "N/A"}</strong>
    </div>
  );
}

function FeaturedPlay({ play }) {
  if (!play) {
    return <div className="tbm-empty">No overall play available right now.</div>;
  }

  return (
    <section className="tbm-featured-play">
      <div className="tbm-featured-left">
        <div className="tbm-kicker-row">
          <span className="tbm-kicker">Today’s Overall POD</span>
          <span className="tbm-sport-chip">{getSport(play)}</span>
          <span className="tbm-tier-chip">{getRecommendation(play)}</span>
        </div>

        <h2>{play.game}</h2>

        <div className="tbm-pick-main">
          <div>
            <span>Model Pick</span>
            <strong>{play.pick}</strong>
          </div>
          <div>
            <span>Best Price</span>
            <strong>{formatOdds(getOdds(play))}</strong>
          </div>
          <div>
            <span>Sportsbook</span>
            <strong>{getBook(play)}</strong>
          </div>
        </div>

        <div className="tbm-reason-box">
          {play.sharp_reason ||
            play.sportsbook_note ||
            play.reason ||
            "Model edge, market intelligence, and sportsbook comparison available."}
        </div>
      </div>

      <div className="tbm-featured-score">
        <span>Universal POD Score</span>
        <strong>{getPodScore(play).toFixed(2)}</strong>
        <small>{getTier(play)}</small>
      </div>
    </section>
  );
}

function TopThreeTable({ plays }) {
  if (!plays.length) {
    return <div className="tbm-empty">No ranked POD plays available right now.</div>;
  }

  return (
    <div className="tbm-table-wrap">
      <table className="tbm-board-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Sport</th>
            <th>Game</th>
            <th>Pick</th>
            <th>Market</th>
            <th>Book</th>
            <th>Odds</th>
            <th>Edge</th>
            <th>Conf</th>
            <th>POD</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>
          {plays.map((play, index) => (
            <tr key={`${play.game}-${play.pick}-${index}`}>
              <td>
                <span className="tbm-rank">#{index + 1}</span>
              </td>
              <td>{getSport(play)}</td>
              <td className="tbm-game-cell">{play.game}</td>
              <td className="tbm-pick-cell">{play.pick}</td>
              <td>{play.market || "N/A"}</td>
              <td>{getBook(play)}</td>
              <td className="tbm-odds-cell">{formatOdds(getOdds(play))}</td>
              <td>{play.edge ?? "N/A"}</td>
              <td>{play.confidence ?? "N/A"}</td>
              <td className="tbm-score-cell">{getPodScore(play).toFixed(2)}</td>
              <td>{getRecommendation(play)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SportBestCard({ sport, play }) {
  if (!play) return null;

  return (
    <div className="tbm-sport-card">
      <div className="tbm-sport-card-top">
        <span>{sport}</span>
        <strong>{getPodScore(play).toFixed(2)}</strong>
      </div>

      <h3>{play.game}</h3>

      <div className="tbm-sport-pick">
        <span>{play.pick}</span>
        <strong>{formatOdds(getOdds(play))}</strong>
      </div>

      <div className="tbm-sport-metrics">
        <Metric label="Market" value={play.market} />
        <Metric label="Book" value={getBook(play)} />
        <Metric label="Edge" value={play.edge} />
        <Metric label="Grade" value={getTier(play)} strong />
      </div>
    </div>
  );
}

export default function HomePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/model/play-of-the-day-v2`)
      .then((res) => res.json())
      .then((payload) => setData(payload))
      .catch(() => setError("Unable to load dashboard data."));
  }, []);

  const topThree = useMemo(() => {
    return Array.isArray(data?.top_5) ? data.top_5.slice(0, 3) : [];
  }, [data]);

  const overallPlay = data?.overall_play || topThree[0] || null;
  const bySport = data?.by_sport || {};
  const sportEntries = Object.entries(bySport).filter(([, play]) => play);

  return (
    <main className="tbm-dashboard-page">
      <section className="tbm-dashboard-header">
        <div>
          <span className="tbm-kicker">The Betting Model</span>
          <h1>Model Dashboard</h1>
          <p>
            Universal POD rankings, best play by sport, sportsbook comparison, sharp signals,
            line-shopping value, final model tiers, and market intelligence in one command center.
          </p>
        </div>

        <div className="tbm-dashboard-stats">
          <Metric label="Top POD" value={overallPlay ? getPodScore(overallPlay).toFixed(2) : "0.00"} strong />
          <Metric label="Active Sports" value={sportEntries.length} />
          <Metric label="Best Book" value={overallPlay ? getBook(overallPlay) : "N/A"} />
          <Metric label="Top Grade" value={overallPlay ? getRecommendation(overallPlay) : "N/A"} strong />
        </div>
      </section>

      {error && <div className="tbm-error">{error}</div>}

      <FeaturedPlay play={overallPlay} />

      <section className="tbm-section">
        <div className="tbm-section-title">
          <div>
            <span className="tbm-kicker">Universal POD v3</span>
            <h2>Top 3 Overall Play of the Day</h2>
          </div>
          <p>Ranked by universal POD score with duplicate cleanup and heavy-favorite protection.</p>
        </div>

        <TopThreeTable plays={topThree} />
      </section>

      <section className="tbm-section">
        <div className="tbm-section-title">
          <div>
            <span className="tbm-kicker">Sport Boards</span>
            <h2>Best Play By Sport</h2>
          </div>
          <p>One top play per sport for balanced exposure across the full model board.</p>
        </div>

        <div className="tbm-sport-grid">
          {sportEntries.length ? (
            sportEntries.map(([sport, play]) => (
              <SportBestCard key={sport} sport={sport} play={play} />
            ))
          ) : (
            <div className="tbm-empty">No sport-by-sport plays available right now.</div>
          )}
        </div>
      </section>

      <section className="tbm-section tbm-market-strip">
        <div className="tbm-section-title">
          <div>
            <span className="tbm-kicker">Market Intelligence</span>
            <h2>Dashboard Pulse</h2>
          </div>
        </div>

        <div className="tbm-pulse-grid">
          <Metric label="Sharp Signal" value={overallPlay?.sharp_signal || "N/A"} strong />
          <Metric label="Sharp Book" value={overallPlay?.sharp_book_signal || "N/A"} />
          <Metric label="Line Value" value={overallPlay?.line_shop_value ?? "N/A"} strong />
          <Metric label="CLV Status" value={overallPlay?.clv_status || "N/A"} />
          <Metric label="Market Grade" value={overallPlay?.market_intelligence_grade || "N/A"} strong />
          <Metric label="Steam" value={overallPlay?.steam_strength || "N/A"} />
        </div>
      </section>
    </main>
  );
}
