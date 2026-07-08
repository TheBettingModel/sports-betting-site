import { useEffect, useMemo, useState } from "react";
import TBMTeamLogo from "../components/logos/TBMTeamLogo";
import TBMSportsbookBadge from "../components/logos/TBMSportsbookBadge";
import { TBMPage, TBMCard, TBMMetric } from "../components/ui";
import "./PlayOfTheDayPage.css";

const API_URL = import.meta.env.VITE_API_URL;

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

function normalizeBestBySport(data) {
  const pick = data?.play_of_the_day || data?.overall_play;
  const raw = data?.best_by_sport || data?.by_sport || {};
  const cleaned = { ...raw };

  if (pick?.sport) cleaned[pick.sport] = pick;
  if (pick?.pod_sport) cleaned[pick.pod_sport] = pick;

  return cleaned;
}

function getSport(play) {
  return play?.sport || play?.pod_sport || play?.league || "Sport";
}

function getPick(play) {
  return play?.pick || play?.recommendation || "No Pick";
}

function getBook(play) {
  return play?.best_sportsbook || play?.sportsbook || "Best Available";
}

function score(play) {
  return play?.universal_pod_score ?? play?.pod_score ?? play?.final_model_score ?? "N/A";
}

function CompactSportPlay({ sport, play }) {
  const { away, home } = splitGame(play?.game || "");

  return (
    <a className="pod-sport-card" href="/">
      <div className="pod-sport-card-top">
        <span>{sport}</span>
        <strong>{play?.final_recommendation || play?.recommendation || "Model Play"}</strong>
      </div>

      <div className="pod-sport-matchup">
        <div>
          <TBMTeamLogo team={away} sport={sport} size={34} />
          <span>{away}</span>
        </div>

        <em>@</em>

        <div>
          <TBMTeamLogo team={home} sport={sport} size={34} />
          <span>{home}</span>
        </div>
      </div>

      <div className="pod-sport-pick">{getPick(play)}</div>
    </a>
  );
}

export default function PlayOfTheDayPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/homepage`)
      .then((response) => response.json())
      .then((homepage) => {
        if (homepage.play_of_the_day) {
          setData(homepage);
        } else {
          setError(homepage.message || homepage.error || "No play of the day found.");
        }
      })
      .catch(() => setError("Could not load play of the day."));
  }, []);

  const pick = data?.play_of_the_day;
  const bestBySport = useMemo(() => normalizeBestBySport(data), [data]);
  const { away, home } = splitGame(pick?.game || "");

  return (
    <TBMPage className="pod-page-v2">
      <header className="pod-header-v2">
        <div>
          <span>Official Pick</span>
          <h1>Play of the Day</h1>
          <p>One flagship model play. Clean, simple, and updated from the same dashboard engine.</p>
        </div>
      </header>

      {error ? (
        <p className="pod-error">{error}</p>
      ) : !pick ? (
        <TBMCard className="pod-loading">Loading play of the day...</TBMCard>
      ) : (
        <>
          <TBMCard glow className="pod-feature-card">
            <div className="pod-feature-top">
              <div>
                <span className="pod-label">Today’s POD</span>
                <h2>{getPick(pick)}</h2>
                <p>{pick.game}</p>
              </div>

              <div className="pod-score">
                <span>Score</span>
                <strong>{score(pick)}</strong>
              </div>
            </div>

            <div className="pod-matchup-row">
              <div>
                <TBMTeamLogo team={away} sport={getSport(pick)} size={58} />
                <span>{away}</span>
              </div>

              <em>@</em>

              <div>
                <TBMTeamLogo team={home} sport={getSport(pick)} size={58} />
                <span>{home}</span>
              </div>
            </div>

            <div className="pod-metric-grid">
              <TBMMetric label="Sport" value={getSport(pick)} />
              <TBMMetric label="Market" value={pick.market || "N/A"} />
              <TBMMetric label="Odds" value={formatOdds(pick.best_odds ?? pick.odds)} accent />
              <TBMMetric label="Edge" value={`${pick.edge ?? "N/A"}%`} accent />
              <TBMMetric label="Confidence" value={`${pick.confidence ?? "N/A"}%`} />
              <TBMMetric label="Units" value={pick.units ?? "N/A"} />
            </div>

            <div className="pod-signal-strip">
              <span>{pick.sharp_signal || "Sharp Watch"}</span>
              <span>{pick.clv_status || "CLV Watch"}</span>
              <span>{pick.market_intelligence_grade || "Market Grade N/A"}</span>
              <TBMSportsbookBadge book={getBook(pick)} />
            </div>
          </TBMCard>

          <section className="pod-section">
            <div className="pod-section-header">
              <span>Sport Board</span>
              <h2>Best Play by Sport</h2>
            </div>

            <div className="pod-sport-grid">
              {Object.entries(bestBySport).map(([sport, play]) => (
                <CompactSportPlay key={sport} sport={sport} play={play} />
              ))}
            </div>
          </section>
        </>
      )}
    </TBMPage>
  );
}
