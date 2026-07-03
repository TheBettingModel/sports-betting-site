import "./TBMHeroPlayCard.css";
import TBMTeamLogo from "../logos/TBMTeamLogo";

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
}

function getScore(play) {
  return Number(
    play?.universal_pod_score ??
    play?.pod_score ??
    play?.final_model_score ??
    play?.top_play_score ??
    0
  );
}

function getSport(play) {
  return play?.pod_sport || play?.sport || play?.league || "TBM";
}

function getBook(play) {
  return play?.best_sportsbook || play?.best_book || play?.sportsbook || "Best Available";
}

function getOdds(play) {
  return play?.best_odds ?? play?.odds;
}

function getRecommendation(play) {
  return play?.final_recommendation || play?.recommendation || "Model Play";
}

function getTier(play) {
  return play?.final_model_tier || play?.universal_pod_tier || play?.market_intelligence_grade || "Premium";
}

function splitGame(game = "") {
  if (game.includes(" vs ")) {
    const [away, home] = game.split(" vs ");
    return { away, home };
  }

  if (game.includes(" at ")) {
    const [away, home] = game.split(" at ");
    return { away, home };
  }

  return { away: "Away", home: "Home" };
}

function TeamLogo({ team, sport }) {
  return <TBMTeamLogo team={team} sport={sport} size={62} />;
}

function HeroMetric({ label, value, accent }) {
  return (
    <div className="tbm-hero-metric">
      <span>{label}</span>
      <strong className={accent ? "accent" : ""}>{value ?? "N/A"}</strong>
    </div>
  );
}

function Badge({ children, tone = "green" }) {
  if (!children) return null;

  return (
    <span className={`tbm-hero-badge ${tone}`}>
      {children}
    </span>
  );
}

export default function TBMHeroPlayCard({ play }) {
  if (!play) {
    return (
      <section className="tbm-hero-card empty">
        <h2>No flagship play available.</h2>
        <p>The model has not generated a Play of the Day yet.</p>
      </section>
    );
  }

  const { away, home } = splitGame(play.game || "");
  const score = getScore(play);
  const reasons =
    play.final_rating_reasons ||
    play.market_intelligence_reasons ||
    play.universal_pod_reasons ||
    [];

  return (
    <section className="tbm-hero-card">
      <div className="tbm-hero-left">
        <div className="tbm-hero-kicker">
          <span>{getSport(play)}</span>
          <strong>Today’s Flagship Play</strong>
        </div>

        <div className="tbm-hero-matchup">
          <div className="tbm-hero-team">
            <TeamLogo team={away} sport={getSport(play)} />
            <span>{away}</span>
          </div>

          <div className="tbm-hero-vs">VS</div>

          <div className="tbm-hero-team">
            <TeamLogo team={home} sport={getSport(play)} />
            <span>{home}</span>
          </div>
        </div>

        <div className="tbm-hero-pick-box">
          <span>Official Pick</span>
          <h1>{play.pick}</h1>
          <div>
            <strong>{formatOdds(getOdds(play))}</strong>
            <em>{play.market || "Market"}</em>
          </div>
        </div>

        <div className="tbm-hero-metrics">
          <HeroMetric label="Edge" value={`${play.edge ?? "N/A"}%`} accent />
          <HeroMetric label="Confidence" value={`${play.confidence ?? "N/A"}%`} accent />
          <HeroMetric label="Units" value={play.units ?? "N/A"} />
          <HeroMetric label="POD Score" value={score ? score.toFixed(2) : "N/A"} accent />
          <HeroMetric label="Book" value={getBook(play)} />
          <HeroMetric label="Tier" value={getTier(play)} />
        </div>

        <div className="tbm-hero-badges">
          <Badge tone="green">{getRecommendation(play)}</Badge>
          <Badge tone="blue">{play.clv_status || play.live_clv_grade || "CLV"}</Badge>
          <Badge tone="purple">{play.sharp_signal || play.sharp_book_signal || "Sharp"}</Badge>
          <Badge tone="gold">{play.market_intelligence_grade || "Market Grade"}</Badge>
        </div>
      </div>

      <aside className="tbm-hero-right">
        <div className="tbm-hero-score-card">
          <span>POD SCORE</span>
          <strong>{score ? score.toFixed(2) : "N/A"}</strong>
          <small>{getTier(play)}</small>
        </div>

        <div className="tbm-hero-why">
          <h3>Why The Model Likes It</h3>

          {Array.isArray(reasons) && reasons.length > 0 ? (
            reasons.slice(0, 4).map((reason, index) => (
              <p key={index}>✓ {reason}</p>
            ))
          ) : (
            <p>{play.reason || play.sharp_reason || "No model reason available."}</p>
          )}
        </div>

        <div className="tbm-hero-signal-grid">
          <div>
            <span>CLV</span>
            <strong>{play.clv_status || "N/A"}</strong>
          </div>
          <div>
            <span>Steam</span>
            <strong>{play.steam_strength || play.line_movement_signal || "N/A"}</strong>
          </div>
          <div>
            <span>Line Value</span>
            <strong>{play.line_shop_value ?? "N/A"}</strong>
          </div>
          <div>
            <span>Book</span>
            <strong>{getBook(play)}</strong>
          </div>
        </div>
      </aside>
    </section>
  );
}
