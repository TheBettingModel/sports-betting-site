import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
}

function getScore(play) {
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

function getRec(play) {
  return play?.final_recommendation || play?.recommendation || "N/A";
}

function getTier(play) {
  return play?.final_model_tier || play?.universal_pod_tier || play?.market_intelligence_grade || "N/A";
}

function Metric({ label, value, highlight = false }) {
  return (
    <div className="home-metric">
      <span>{label}</span>
      <strong className={highlight ? "home-highlight" : ""}>{value ?? "N/A"}</strong>
    </div>
  );
}

function ReasonList({ play }) {
  const reasons =
    play?.final_rating_reasons ||
    play?.universal_pod_reasons ||
    play?.market_intelligence_reasons ||
    [];

  if (!Array.isArray(reasons) || reasons.length === 0) {
    return (
      <div className="home-reason-list">
        <div>✓ Model edge and market data support this play.</div>
        <div>✓ Sportsbook comparison is active.</div>
        <div>✓ Sharp signal and POD score are included.</div>
      </div>
    );
  }

  return (
    <div className="home-reason-list">
      {reasons.slice(0, 6).map((reason, index) => (
        <div key={index}>✓ {reason}</div>
      ))}
    </div>
  );
}

function FeaturedPlay({ play }) {
  if (!play) {
    return <div className="home-empty">No Play of the Day available right now.</div>;
  }

  return (
    <section className="home-feature-shell">
      <div className="home-feature-main">
        <div className="home-chip-row">
          <span className="home-chip green">Today’s Overall POD</span>
          <span className="home-chip blue">{getSport(play)}</span>
          <span className="home-chip gold">{getRec(play)}</span>
        </div>

        <h2>{play.game}</h2>

        <div className="home-feature-pick">
          <div>
            <span>Model Pick</span>
            <strong>{play.pick}</strong>
          </div>
          <div>
            <span>Best Odds</span>
            <strong>{formatOdds(getOdds(play))}</strong>
          </div>
          <div>
            <span>Best Sportsbook</span>
            <strong>{getBook(play)}</strong>
          </div>
        </div>

        <ReasonList play={play} />
      </div>

      <aside className="home-feature-side">
        <div className="home-score-ring">
          <span>POD Score</span>
          <strong>{getScore(play).toFixed(2)}</strong>
          <small>{getTier(play)}</small>
        </div>

        <div className="home-side-grid">
          <Metric label="Edge" value={play.edge} highlight />
          <Metric label="Confidence" value={play.confidence} highlight />
          <Metric label="Units" value={play.units} />
          <Metric label="Stars" value={play.final_stars ? `${play.final_stars}/5` : "N/A"} />
        </div>
      </aside>
    </section>
  );
}

function TopThreeTable({ plays }) {
  if (!plays.length) {
    return <div className="home-empty">No ranked POD plays available.</div>;
  }

  return (
    <div className="home-table-wrap">
      <table className="home-table">
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
            <th>Rec</th>
          </tr>
        </thead>
        <tbody>
          {plays.map((play, index) => (
            <tr key={`${play.game}-${play.pick}-${index}`}>
              <td><span className="home-rank">#{index + 1}</span></td>
              <td>{getSport(play)}</td>
              <td className="home-game">{play.game}</td>
              <td className="home-pick">{play.pick}</td>
              <td>{play.market || "N/A"}</td>
              <td>{getBook(play)}</td>
              <td className="home-positive">{formatOdds(getOdds(play))}</td>
              <td>{play.edge ?? "N/A"}</td>
              <td>{play.confidence ?? "N/A"}</td>
              <td className="home-positive">{getScore(play).toFixed(2)}</td>
              <td>{getRec(play)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SportCard({ sport, play }) {
  if (!play) return null;

  return (
    <div className="home-sport-card">
      <div className="home-sport-top">
        <span>{sport}</span>
        <strong>{getScore(play).toFixed(2)}</strong>
      </div>

      <h3>{play.game}</h3>

      <div className="home-sport-pick">
        <span>{play.pick}</span>
        <strong>{formatOdds(getOdds(play))}</strong>
      </div>

      <div className="home-sport-stats">
        <Metric label="Market" value={play.market} />
        <Metric label="Book" value={getBook(play)} />
        <Metric label="Edge" value={play.edge} highlight />
        <Metric label="Grade" value={getTier(play)} highlight />
      </div>
    </div>
  );
}

function MarketPulse({ play }) {
  return (
    <section className="home-section">
      <div className="home-section-title">
        <div>
          <span className="home-eyebrow">Market Intelligence</span>
          <h2>Dashboard Pulse</h2>
        </div>
        <p>Sharp signals, CLV, steam, market grade, and line-shopping value from the top-ranked play.</p>
      </div>

      <div className="home-pulse-grid">
        <Metric label="Sharp Signal" value={play?.sharp_signal || "N/A"} highlight />
        <Metric label="Sharp Book" value={play?.sharp_book_signal || "N/A"} />
        <Metric label="Market Grade" value={play?.market_intelligence_grade || "N/A"} highlight />
        <Metric label="CLV Status" value={play?.clv_status || "N/A"} />
        <Metric label="Steam Strength" value={play?.steam_strength || "N/A"} />
        <Metric label="Line Shop Value" value={play?.line_shop_value ?? "N/A"} highlight />
        <Metric label="Best Book" value={play ? getBook(play) : "N/A"} />
        <Metric label="Worst Odds" value={formatOdds(play?.worst_odds)} />
      </div>
    </section>
  );
}

export default function HomePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/model/play-of-the-day-v2`)
      .then((res) => res.json())
      .then(setData)
      .catch(() => setError("Unable to load dashboard data."));
  }, []);

  const topThree = useMemo(() => {
    return Array.isArray(data?.top_5) ? data.top_5.slice(0, 3) : [];
  }, [data]);

  const overallPlay = data?.overall_play || topThree[0] || null;
  const bySport = data?.by_sport || {};
  const sportEntries = Object.entries(bySport).filter(([, play]) => play);

  return (
    <main className="home-dashboard-pro">
      <section className="home-hero-pro">
        <div>
          <span className="home-eyebrow">The Betting Model</span>
          <h1>Model Dashboard</h1>
          <p>
            Universal model board for Play of the Day rankings, best play by sport, sportsbook comparison,
            sharp market signals, line value, confidence, edge, CLV, and final betting recommendations.
          </p>
        </div>

        <div className="home-hero-metrics">
          <Metric label="Top POD Score" value={overallPlay ? getScore(overallPlay).toFixed(2) : "0.00"} highlight />
          <Metric label="Active Sports" value={sportEntries.length} />
          <Metric label="Top Recommendation" value={overallPlay ? getRec(overallPlay) : "N/A"} highlight />
          <Metric label="Best Sportsbook" value={overallPlay ? getBook(overallPlay) : "N/A"} />
        </div>
      </section>

      {error && <div className="home-error">{error}</div>}

      <FeaturedPlay play={overallPlay} />

      <section className="home-section">
        <div className="home-section-title">
          <div>
            <span className="home-eyebrow">Universal POD v3</span>
            <h2>Top 3 Overall Play of the Day</h2>
          </div>
          <p>Ranked by universal POD score with duplicate cleanup and heavy-favorite protection.</p>
        </div>

        <TopThreeTable plays={topThree} />
      </section>

      <section className="home-section">
        <div className="home-section-title">
          <div>
            <span className="home-eyebrow">Sport Boards</span>
            <h2>Best Play By Sport</h2>
          </div>
          <p>One best model play per sport to avoid one league dominating the dashboard.</p>
        </div>

        <div className="home-sport-grid">
          {sportEntries.length ? (
            sportEntries.map(([sport, play]) => (
              <SportCard key={sport} sport={sport} play={play} />
            ))
          ) : (
            <div className="home-empty">No sport-by-sport plays available.</div>
          )}
        </div>
      </section>

      <MarketPulse play={overallPlay} />
    </main>
  );
}
