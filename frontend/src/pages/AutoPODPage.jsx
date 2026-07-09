import { useEffect, useMemo, useState } from "react";
import TBMSportCard from "../components/home/TBMSportCard";
import TBMHeroCard from "../components/cards/TBMHeroCard";
import TBMDataCard from "../components/cards/TBMDataCard";
import TBMTopPlaysTable from "../components/cards/TBMTopPlaysTable";
import TBMIntelligenceGrid from "../components/cards/TBMIntelligenceGrid";
import TBMPageHeader from "../components/layout/TBMPageHeader";
import TBMSection from "../components/layout/TBMSection";
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
      <TBMPageHeader title="Play of the Day" badge="Live Model" />

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

          <TBMSection title="Market Intelligence">
            <TBMIntelligenceGrid play={overallPlay} />
          </TBMSection>

          <TBMSection title="Best Play by Sport">
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
          </TBMSection>

          <TBMSection title="Top Plays">
            <TBMTopPlaysTable plays={topFive} />
          </TBMSection>
        </>
      )}
    </main>
  );
}

export default AutoPODPage;
