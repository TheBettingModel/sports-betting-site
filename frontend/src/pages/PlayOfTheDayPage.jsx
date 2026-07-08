import { useEffect, useMemo, useState } from "react";
import TBMTeamLogo from "../components/logos/TBMTeamLogo";
import TBMSportsbookBadge from "../components/logos/TBMSportsbookBadge";
import { TBMPage, TBMCard } from "../components/ui";
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

function getRecommendation(play) {
  return play?.final_recommendation || play?.recommendation || "Model Play";
}

function SimpleSportCard({ sport, play }) {
  const { away, home } = splitGame(play?.game || "");

  return (
    <div className="pod-simple-sport-card">
      <div className="pod-simple-sport-top">
        <span>{sport}</span>
        <strong>{getRecommendation(play)}</strong>
      </div>

      <div className="pod-simple-matchup">
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

      <div className="pod-simple-pick">{getPick(play)}</div>
    </div>
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
    <TBMPage className="pod-page-clean">
      <header className="pod-clean-header">
        <span>Official Pick</span>
        <h1>Play of the Day</h1>
      </header>

      {error ? (
        <p className="pod-error">{error}</p>
      ) : !pick ? (
        <TBMCard className="pod-loading">Loading play of the day...</TBMCard>
      ) : (
        <>
          <TBMCard glow className="pod-clean-card">
            <div className="pod-clean-top">
              <div>
                <span>Today’s POD</span>
                <h2>{getPick(pick)}</h2>
              </div>

              <TBMSportsbookBadge book={getBook(pick)} />
            </div>

            <div className="pod-clean-matchup">
              <div>
                <TBMTeamLogo team={away} sport={getSport(pick)} size={58} />
                <strong>{away}</strong>
              </div>

              <em>@</em>

              <div>
                <TBMTeamLogo team={home} sport={getSport(pick)} size={58} />
                <strong>{home}</strong>
              </div>
            </div>

            <div className="pod-clean-stats">
              <div>
                <span>Odds</span>
                <strong>{formatOdds(pick.best_odds ?? pick.odds)}</strong>
              </div>

              <div>
                <span>Edge</span>
                <strong>{pick.edge ?? "N/A"}%</strong>
              </div>

              <div>
                <span>Confidence</span>
                <strong>{pick.confidence ?? "N/A"}%</strong>
              </div>

              <div>
                <span>Units</span>
                <strong>{pick.units ?? "N/A"}</strong>
              </div>
            </div>

            <div className="pod-clean-tags">
              <span>{getSport(pick)}</span>
              <span>{pick.market || "Market"}</span>
              <span>{getRecommendation(pick)}</span>
            </div>
          </TBMCard>

          <section className="pod-clean-section">
            <div className="pod-clean-section-header">
              <span>Sport Board</span>
              <h2>Best Play by Sport</h2>
            </div>

            <div className="pod-simple-sport-grid">
              {Object.entries(bestBySport).map(([sport, play]) => (
                <SimpleSportCard key={sport} sport={sport} play={play} />
              ))}
            </div>
          </section>
        </>
      )}
    </TBMPage>
  );
}
