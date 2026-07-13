import { Link } from "react-router-dom";
import TBMTeamLogo from "../logos/TBMTeamLogo";
import "./TBMSportCard.css";

function cleanText(value, fallback = "N/A") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function splitGame(game = "") {
  const clean = String(game || "").trim();

  const separators = [" vs ", " at ", " @ "];

  for (const separator of separators) {
    if (clean.includes(separator)) {
      const [away, home] = clean.split(separator);

      return {
        away: cleanText(away, "Away"),
        home: cleanText(home, "Home"),
      };
    }
  }

  return {
    away: clean || "Away",
    home: "Home",
  };
}

function getPick(play) {
  return cleanText(
    play?.pick ||
      play?.selection ||
      play?.bet ||
      play?.recommendation,
    "No Pick"
  );
}

function getMarket(play) {
  return cleanText(
    play?.market ||
      play?.market_type ||
      play?.bet_type,
    "Model Play"
  );
}

function getBook(play) {
  return cleanText(
    play?.best_sportsbook ||
      play?.best_book ||
      play?.sportsbook ||
      play?.book,
    "Best Available"
  );
}

function getOdds(play) {
  const raw =
    play?.best_odds ??
    play?.odds ??
    play?.american_odds ??
    play?.price;

  if (raw === null || raw === undefined || raw === "") {
    return "";
  }

  const numeric = Number(raw);

  if (!Number.isFinite(numeric)) {
    return String(raw);
  }

  return numeric > 0 ? `+${numeric}` : `${numeric}`;
}

function getEdge(play) {
  const edge = Number(play?.edge);

  if (!Number.isFinite(edge)) {
    return "N/A";
  }

  return `${edge.toFixed(2)}%`;
}

function getRecommendation(play) {
  const value = cleanText(
    play?.final_recommendation ||
      play?.recommendation ||
      play?.tier,
    "Model Play"
  );

  return value;
}

function getRecommendationTone(recommendation = "") {
  const value = String(recommendation).toLowerCase();

  if (
    value.includes("elite") ||
    value.includes("best bet") ||
    value.includes("top play")
  ) {
    return "elite";
  }

  if (
    value.includes("play") ||
    value.includes("strong")
  ) {
    return "play";
  }

  if (value.includes("lean")) {
    return "lean";
  }

  if (value.includes("pass")) {
    return "pass";
  }

  return "default";
}

export default function TBMSportCard({
  name,
  play,
  href = "#",
}) {
  if (!play) {
    return null;
  }

  const sport = cleanText(name || play?.sport, "Sport");
  const { away, home } = splitGame(
    play?.game ||
      play?.matchup ||
      play?.event_name ||
      ""
  );

  const pick = getPick(play);
  const market = getMarket(play);
  const edge = getEdge(play);
  const book = getBook(play);
  const odds = getOdds(play);
  const recommendation = getRecommendation(play);
  const recommendationTone = getRecommendationTone(recommendation);

  const bestPrice = odds ? `${book} ${odds}` : book;

  return (
    <Link
      className="tbm-sport-card-v3"
      to={href}
      aria-label={`${sport}: ${away} versus ${home}, pick ${pick}`}
    >
      <div className="tbm-sport-card-v3-head">
        <span className="tbm-sport-card-v3-sport">
          {sport}
        </span>

        <span
          className={`tbm-sport-card-v3-recommendation tone-${recommendationTone}`}
        >
          {recommendation}
        </span>
      </div>

      <div className="tbm-sport-card-v3-teams">
        <div className="tbm-sport-card-v3-team">
          <TBMTeamLogo
            team={away}
            sport={sport}
            size={42}
          />

          <span title={away}>{away}</span>
        </div>

        <em>VS</em>

        <div className="tbm-sport-card-v3-team">
          <TBMTeamLogo
            team={home}
            sport={sport}
            size={42}
          />

          <span title={home}>{home}</span>
        </div>
      </div>

      <div className="tbm-sport-card-v3-pick">
        <span>Model Pick</span>
        <strong title={pick}>{pick}</strong>
      </div>

      <div className="tbm-sport-card-v3-details">
        <div>
          <span>Market</span>
          <strong title={market}>{market}</strong>
        </div>

        <div>
          <span>Edge</span>
          <strong className="is-edge">{edge}</strong>
        </div>

        <div>
          <span>Best Price</span>
          <strong title={bestPrice}>{bestPrice}</strong>
        </div>
      </div>
    </Link>
  );
}
