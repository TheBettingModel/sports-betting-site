import "./TBMHeroPlayCard.css";
import TBMSportsbookBadge from "../logos/TBMSportsbookBadge";
import TBMTeamLogo from "../logos/TBMTeamLogo";

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";

  const num = Number(value);

  if (Number.isNaN(num)) {
    return String(value);
  }

  return num > 0 ? `+${num}` : `${num}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  const text = String(value);

  return text.includes("%") ? text : `${text}%`;
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
  return (
    play?.pod_sport ||
    play?.sport ||
    play?.league ||
    "TBM"
  );
}

function getBook(play) {
  return (
    play?.best_sportsbook ||
    play?.best_book ||
    play?.sportsbook ||
    "Best Available"
  );
}

function getOdds(play) {
  return play?.best_odds ?? play?.odds;
}

function getRecommendation(play) {
  return (
    play?.final_recommendation ||
    play?.recommendation ||
    "Model Play"
  );
}

function getTier(play) {
  return (
    play?.final_model_tier ||
    play?.universal_pod_tier ||
    play?.market_intelligence_grade ||
    "Premium"
  );
}

function splitGame(game = "") {
  const normalized = String(game || "").trim();

  for (const separator of [" vs ", " at ", " @ ", " vs. "]) {
    if (normalized.includes(separator)) {
      const [away, home] = normalized.split(separator);

      return {
        away: away?.trim() || "Away",
        home: home?.trim() || "Home",
      };
    }
  }

  return {
    away: "Away",
    home: normalized || "Home",
  };
}

function HeroMetric({
  label,
  value,
  accent = false,
}) {
  return (
    <div className="tbm-hero-metric">
      <span>{label}</span>

      <strong className={accent ? "accent" : ""}>
        {value ?? "N/A"}
      </strong>
    </div>
  );
}

function SignalBadge({
  children,
  tone = "neutral",
}) {
  if (!children) return null;

  return (
    <span className={`tbm-hero-badge ${tone}`}>
      {children}
    </span>
  );
}

export default function TBMHeroPlayCard({
  play,
  label = "Today’s Flagship Play",
}) {
  if (!play) {
    return (
      <section className="tbm-hero-card tbm-hero-card--empty">
        <span className="tbm-hero-empty-kicker">
          Model Status
        </span>

        <h2>No flagship play available.</h2>

        <p>
          The model has not generated a qualified play yet.
        </p>
      </section>
    );
  }

  const sport = getSport(play);
  const { away, home } = splitGame(play.game || "");
  const score = getScore(play);

  const reasons =
    play.final_rating_reasons ||
    play.market_intelligence_reasons ||
    play.universal_pod_reasons ||
    [];

  const primaryReason =
    (
      Array.isArray(reasons) && reasons.length > 0
        ? reasons[0]
        : null
    ) ||
    play.reason ||
    play.sharp_reason ||
    "Qualified by the current model and market filters.";

  return (
    <section className="tbm-hero-card">
      <div
        className="tbm-hero-card__accent"
        aria-hidden="true"
      />

      <div className="tbm-hero-card__main">
        <div className="tbm-hero-kicker">
          <span>{sport}</span>
          <strong>{label}</strong>
        </div>

        <div className="tbm-hero-matchup">
          <div className="tbm-hero-team">
            <TBMTeamLogo
              team={away}
              sport={sport}
              size={56}
            />

            <span>{away}</span>
          </div>

          <div className="tbm-hero-vs">
            VS
          </div>

          <div className="tbm-hero-team">
            <TBMTeamLogo
              team={home}
              sport={sport}
              size={56}
            />

            <span>{home}</span>
          </div>
        </div>

        <div className="tbm-hero-pick-line">
          <div className="tbm-hero-pick-copy">
            <span>Official Pick</span>

            <h1>
              {play.pick || "Model Play"}
            </h1>

            <small>
              {play.market || "Best Available Market"}
            </small>
          </div>

          <div className="tbm-hero-price">
            <span>Best Price</span>

            <strong>
              {formatOdds(getOdds(play))}
            </strong>

            <TBMSportsbookBadge
              book={getBook(play)}
            />
          </div>
        </div>

        <div className="tbm-hero-metrics">
          <HeroMetric
            label="Edge"
            value={formatPercent(play.edge)}
            accent
          />

          <HeroMetric
            label="Confidence"
            value={formatPercent(play.confidence)}
            accent
          />

          <HeroMetric
            label="Units"
            value={play.units ?? "N/A"}
          />

          <HeroMetric
            label="POD Score"
            value={score ? score.toFixed(2) : "N/A"}
            accent
          />
        </div>
      </div>

      <aside className="tbm-hero-card__aside">
        <div className="tbm-hero-score-card">
          <span>Model Rating</span>

          <strong>
            {score ? score.toFixed(2) : "N/A"}
          </strong>

          <small>
            {getTier(play)}
          </small>
        </div>

        <div className="tbm-hero-summary">
          <span>Model Read</span>

          <p>{primaryReason}</p>
        </div>

        <div className="tbm-hero-badges">
          <SignalBadge tone="green">
            {getRecommendation(play)}
          </SignalBadge>

          <SignalBadge tone="blue">
            {play.clv_status ||
              play.live_clv_grade ||
              "CLV"}
          </SignalBadge>

          <SignalBadge tone="neutral">
            {play.sharp_signal ||
              play.sharp_book_signal ||
              "Market"}
          </SignalBadge>
        </div>
      </aside>
    </section>
  );
}
