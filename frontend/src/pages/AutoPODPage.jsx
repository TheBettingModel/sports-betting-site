import { useEffect, useMemo, useState } from "react";
import TBMSportCard from "../components/home/TBMSportCard";
import TBMHeroCard from "../components/cards/TBMHeroCard";
import TBMDataCard from "../components/cards/TBMDataCard";
import TBMTopPlaysTable from "../components/cards/TBMTopPlaysTable";
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

function getScore(play) {
  return play?.universal_pod_score ?? play?.final_model_score ?? "N/A";
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
      .then((json) => {
        setData(json);
        setError("");
      })
      .catch((err) => {
        console.error("Auto POD fetch error:", err);
        setError("Failed to load Play of the Day.");
      });
  }, []);

  const overallPlay = data?.overall_play || data?.play_of_the_day || null;
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
            <TBMDataCard label="Featured" value={overallPlay?.pick || "No Play"} tone="green" />
            <TBMDataCard label="Qualified Sports" value={sportCards.length} tone="blue" />
            <TBMDataCard label="Top Score" value={getScore(overallPlay)} tone="gold" />
          </section>

          <TBMHeroCard
            label="Overall Play of the Day"
            play={overallPlay}
            scoreLabel="POD Score"
            score={getScore(overallPlay)}
            href="/auto-pod"
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

            <TBMTopPlaysTable plays={topFive} />
          </section>
        </>
      )}
    </main>
  );
}

export default AutoPODPage;
