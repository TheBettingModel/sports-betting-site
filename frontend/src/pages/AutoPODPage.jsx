import { useEffect, useMemo, useState } from "react";
import TBMSportCard from "../components/home/TBMSportCard";
import TBMHeroCard from "../components/cards/TBMHeroCard";
import "./AutoPODPage.css";

const API_URL = import.meta.env.VITE_API_URL;

const SPORT_ROUTES = {
  MLB: "/mlb",
  NBA: "/nba",
  NFL: "/nfl",
  NHL: "/nhl",
  WNBA: "/wnba",
  UFC: "/ufc",
  Soccer: "/soccer",
  NCAAF: "/ncaaf",
  NCAAMB: "/ncaamb",
};

function normalizeBestBySport(data) {
  const pick = data?.play_of_the_day || data?.overall_play;
  const raw = data?.best_by_sport || data?.by_sport || {};
  const cleaned = { ...raw };

  if (pick?.sport) cleaned[pick.sport] = pick;
  if (pick?.pod_sport) cleaned[pick.pod_sport] = pick;

  return Object.entries(cleaned)
    .map(([sport, play]) => ({ sport, play }))
    .filter((item) => item.play);
}

function AutoPODPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/homepage`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => {
        console.error("Auto POD fetch error:", err);
        setError("Failed to load Play of the Day.");
      });
  }, []);

  const overallPlay = data?.overall_play;
  const topFive = data?.top_5 || [];
  const sportCards = useMemo(() => normalizeBestBySport(data), [data]);

  return (
    <main className="auto-pod-page">
      <section className="auto-pod-header">
        <div>
          <p>THE BETTING MODEL</p>
          <h1>Play of the Day</h1>
        </div>
        <span>Live Model</span>
      </section>

      {error ? (
        <div className="auto-pod-state auto-pod-error">{error}</div>
      ) : !data ? (
        <div className="auto-pod-state">Loading Play of the Day...</div>
      ) : (
        <>
          <section className="auto-pod-kpis">
            <div>
              <span>Featured</span>
              <strong>{overallPlay?.pick || "No Play"}</strong>
            </div>
            <div>
              <span>Qualified Sports</span>
              <strong>{sportCards.length}</strong>
            </div>
            <div>
              <span>Top Score</span>
              <strong>{getScore(overallPlay)}</strong>
            </div>
          </section>

          <TBMHeroCard
            label="Overall Play of the Day"
            play={overallPlay}
            scoreLabel="POD Score"
            score={getScore(overallPlay)}
            href="/analytics"
          />

          <section className="auto-pod-section">
            <div className="auto-pod-section-head">
              <h2>Best Play by Sport</h2>
            </div>

            <div className="auto-pod-sport-grid">
              {sportCards.map(({ sport, play }) => (
                <TBMSportCard
                  key={sport}
                  name={sport}
                  play={play}
                  href={SPORT_ROUTES[sport] || "#"}
                />
              ))}
            </div>
          </section>

          <section className="auto-pod-section">
            <div className="auto-pod-section-head">
              <h2>Top Plays</h2>
            </div>

            <div className="auto-pod-rank-list">
              {topFive.length === 0 ? (
                <div className="auto-pod-empty">No qualified top plays available.</div>
              ) : (
                topFive.map((play, index) => (
                  <div className="auto-pod-rank-row" key={`${play.game}-${play.pick}-${index}`}>
                    <div className="auto-pod-rank-num">#{index + 1}</div>
                    <div>
                      <strong>{play.pick || "N/A"}</strong>
                      <span>{getSport(play)} — {play.game || "N/A"}</span>
                    </div>
                    <em>{getScore(play)}</em>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default AutoPODPage;
