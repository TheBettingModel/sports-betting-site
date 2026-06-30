import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
}

function fmt(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "N/A";
  return `${value}${suffix}`;
}

function podScore(play) {
  return Number(play?.universal_pod_score ?? play?.top_play_score ?? play?.final_model_score ?? 0);
}

function sport(play) {
  return play?.pod_sport || play?.sport || play?.league || "Unknown";
}

function bestBook(play) {
  return play?.best_sportsbook || play?.best_book || play?.sportsbook || "N/A";
}

function bestOdds(play) {
  return play?.best_odds ?? play?.odds;
}

function recommendation(play) {
  return play?.final_recommendation || play?.recommendation || "N/A";
}

function tier(play) {
  return play?.final_model_tier || play?.universal_pod_tier || play?.market_intelligence_grade || "N/A";
}

function Tile({ label, value, tone = "" }) {
  return (
    <div className={`pro-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value ?? "N/A"}</strong>
    </div>
  );
}

function StatusPill({ children, tone = "green" }) {
  return <span className={`pro-pill ${tone}`}>{children}</span>;
}

function FeaturedPOD({ play }) {
  if (!play) return <div className="pro-empty">No Play of the Day available right now.</div>;

  const reasons =
    play.final_rating_reasons ||
    play.market_intelligence_reasons ||
    play.universal_pod_reasons ||
    [];

  return (
    <section className="pro-feature">
      <div className="pro-feature-left">
        <div className="pro-chip-row">
          <StatusPill>Overall POD</StatusPill>
          <StatusPill tone="blue">{sport(play)}</StatusPill>
          <StatusPill tone="gold">{recommendation(play)}</StatusPill>
          <StatusPill tone="dark">{tier(play)}</StatusPill>
        </div>

        <h2>{play.game}</h2>

        <div className="pro-bet-ticket">
          <div>
            <span>Model Pick</span>
            <strong>{play.pick}</strong>
          </div>
          <div>
            <span>Best Price</span>
            <strong>{formatOdds(bestOdds(play))}</strong>
          </div>
          <div>
            <span>Sportsbook</span>
            <strong>{bestBook(play)}</strong>
          </div>
        </div>

        <div className="pro-key-grid">
          <Tile label="Edge" value={fmt(play.edge, "%")} tone="positive" />
          <Tile label="Confidence" value={fmt(play.confidence, "%")} tone="positive" />
          <Tile label="Model Score" value={play.final_model_score} />
          <Tile label="Market Grade" value={play.market_intelligence_grade} />
          <Tile label="Sharp Signal" value={play.sharp_signal} tone="positive" />
          <Tile label="Line Value" value={play.line_shop_value} tone="positive" />
        </div>
      </div>

      <aside className="pro-feature-right">
        <div className="pro-score-card">
          <span>Universal POD Score</span>
          <strong>{podScore(play).toFixed(2)}</strong>
          <small>{play.universal_pod_tier || "POD Candidate"}</small>
        </div>

        <div className="pro-why-card">
          <span>Why The Model Likes It</span>
          {(Array.isArray(reasons) && reasons.length ? reasons.slice(0, 5) : [
            "Positive model edge.",
            "Sportsbook comparison active.",
            "Market intelligence included.",
          ]).map((reason, index) => (
            <p key={index}>✓ {reason}</p>
          ))}
        </div>
      </aside>
    </section>
  );
}

function BoardTable({ plays }) {
  if (!plays.length) return <div className="pro-empty">No ranked plays available.</div>;

  return (
    <div className="pro-table-shell">
      <table className="pro-table">
        <thead>
          <tr>
            <th>#</th>
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
              <td><span className="pro-rank">#{index + 1}</span></td>
              <td><span className="pro-sport-tag">{sport(play)}</span></td>
              <td className="pro-game">{play.game}</td>
              <td className="pro-pick">{play.pick}</td>
              <td>{play.market || "N/A"}</td>
              <td>{bestBook(play)}</td>
              <td className="pro-money">{formatOdds(bestOdds(play))}</td>
              <td>{fmt(play.edge, "%")}</td>
              <td>{fmt(play.confidence, "%")}</td>
              <td className="pro-money">{podScore(play).toFixed(2)}</td>
              <td>{recommendation(play)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SportCard({ name, play }) {
  if (!play) return null;

  return (
    <article className="pro-sport-card">
      <div className="pro-sport-header">
        <span>{name}</span>
        <strong>{podScore(play).toFixed(2)}</strong>
      </div>

      <h3>{play.game}</h3>

      <div className="pro-sport-ticket">
        <span>{play.pick}</span>
        <strong>{formatOdds(bestOdds(play))}</strong>
      </div>

      <div className="pro-sport-metrics">
        <Tile label="Book" value={bestBook(play)} />
        <Tile label="Edge" value={fmt(play.edge, "%")} tone="positive" />
        <Tile label="Conf" value={fmt(play.confidence, "%")} />
        <Tile label="Grade" value={tier(play)} tone="positive" />
      </div>
    </article>
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

  const overall = data?.overall_play || topThree[0] || null;
  const bySport = Object.entries(data?.by_sport || {}).filter(([, play]) => play);

  return (
    <main className="pro-home">
      <section className="pro-topbar">
        <div>
          <span className="pro-overline">The Betting Model</span>
          <h1>Sports Betting Analytics Dashboard</h1>
          <p>
            Professional model board for POD rankings, sharp market intelligence,
            sportsbook comparison, line shopping, CLV, edge, confidence, and final betting grades.
          </p>
        </div>

        <div className="pro-status-grid">
          <Tile label="Top POD" value={overall ? podScore(overall).toFixed(2) : "0.00"} tone="positive" />
          <Tile label="Active Sports" value={bySport.length} />
          <Tile label="Top Rec" value={overall ? recommendation(overall) : "N/A"} tone="positive" />
          <Tile label="Best Book" value={overall ? bestBook(overall) : "N/A"} />
        </div>
      </section>

      {error && <div className="pro-error">{error}</div>}

      <FeaturedPOD play={overall} />

      <section className="pro-section">
        <div className="pro-section-title">
          <div>
            <span className="pro-overline">Universal POD v3</span>
            <h2>Top 3 Overall Plays</h2>
          </div>
          <p>Ranked by universal POD score with duplicate cleanup and price guardrails.</p>
        </div>
        <BoardTable plays={topThree} />
      </section>

      <section className="pro-section">
        <div className="pro-section-title">
          <div>
            <span className="pro-overline">Sport Boards</span>
            <h2>Best Play By Sport</h2>
          </div>
          <p>Balanced exposure across every active model so one sport cannot dominate the dashboard.</p>
        </div>

        <div className="pro-sports-grid">
          {bySport.length ? (
            bySport.map(([name, play]) => <SportCard key={name} name={name} play={play} />)
          ) : (
            <div className="pro-empty">No sport-by-sport plays available.</div>
          )}
        </div>
      </section>

      <section className="pro-section">
        <div className="pro-section-title">
          <div>
            <span className="pro-overline">Market Pulse</span>
            <h2>Sharp & Line Value</h2>
          </div>
          <p>Live intelligence from the current top-ranked play.</p>
        </div>

        <div className="pro-pulse-grid">
          <Tile label="Sharp Signal" value={overall?.sharp_signal} tone="positive" />
          <Tile label="Sharp Book" value={overall?.sharp_book_signal} />
          <Tile label="CLV Status" value={overall?.clv_status} />
          <Tile label="Steam" value={overall?.steam_strength} />
          <Tile label="Market Grade" value={overall?.market_intelligence_grade} tone="positive" />
          <Tile label="Line Shop Value" value={overall?.line_shop_value} tone="positive" />
          <Tile label="Best Odds" value={formatOdds(overall?.best_odds)} tone="positive" />
          <Tile label="Worst Odds" value={formatOdds(overall?.worst_odds)} />
        </div>
      </section>
    </main>
  );
}
