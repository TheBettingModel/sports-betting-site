import TBMSportsbookBadge from "../logos/TBMSportsbookBadge";
import TBMTeamLogo from "../logos/TBMTeamLogo";
import "./TBMTopPlayRow.css";

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
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

function getSport(play) {
  return play?.pod_sport || play?.sport || play?.league || "TBM";
}

function getBook(play) {
  return play?.best_sportsbook || play?.best_book || play?.sportsbook || "Best Available";
}

function getOdds(play) {
  return play?.best_odds ?? play?.odds;
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

function getGrade(play) {
  return play?.final_model_tier || play?.market_intelligence_grade || play?.universal_pod_tier || "N/A";
}

export default function TBMTopPlayRow({ play, index }) {
  if (!play) return null;

  const { away, home } = splitGame(play.game || "");
  const sport = getSport(play);

  return (
    <div className="tbm-top-play-row-v2">
      <div className="tbm-top-rank">{index + 1}</div>

      <div className="tbm-top-matchup">
        <div className="tbm-top-logos">
          <TBMTeamLogo team={away} sport={sport} size={42} />
          <TBMTeamLogo team={home} sport={sport} size={42} />
        </div>

        <div>
          <strong>{away} @ {home}</strong>
          <span>{sport}</span>
        </div>
      </div>

      <div className="tbm-top-pick">
        <strong>{play.pick}</strong>
        <span>{play.market || "Market"}</span>
      </div>

      <div className="tbm-top-odds">{formatOdds(getOdds(play))}</div>

      <div className="tbm-top-score">{getScore(play).toFixed(2)}</div>

      <div className="tbm-top-edge">+{play.edge ?? "N/A"}%</div>

      <div className="tbm-top-book"><TBMSportsbookBadge book={getBook(play)} /></div>

      <div className="tbm-top-grade">{getGrade(play)}</div>

      <div className="tbm-top-conf">{play.confidence ?? "N/A"}%</div>
    </div>
  );
}
