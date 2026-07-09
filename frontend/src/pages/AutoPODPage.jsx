import { useEffect, useMemo, useState } from "react";
import TBMHeroPlayCard from "../components/home/TBMHeroPlayCard";
import TBMTopPlayRow from "../components/home/TBMTopPlayRow";
import TBMSportCard from "../components/home/TBMSportCard";
import TBMDataCard from "../components/cards/TBMDataCard";
import TBMTopPlaysTable from "../components/cards/TBMTopPlaysTable";
import TBMIntelligenceGrid from "../components/cards/TBMIntelligenceGrid";
import TBMPageHeader from "../components/layout/TBMPageHeader";
import TBMSection from "../components/layout/TBMSection";
import "./AutoPODPage.css";

const API_URL = import.meta.env.VITE_API_URL;

const SPORT_ROUTES = {
  MLB: "/mlb-model",
  NBA: "/model-board",
  NFL: "/nfl-model",
  NHL: "/nhl-model",
  WNBA: "/wnba-model",
  NCAAF: "/ncaaf-model",
  NCAAMB: "/model/ncaamb",
  Soccer: "/soccer-model",
  UFC: "/model/ufc",
};

function normalizeBestBySport(data, overallPlay) {
  const raw = data?.best_by_sport || data?.by_sport || {};
  const cleaned = { ...raw };

  if (overallPlay?.sport) cleaned[overallPlay.sport] = overallPlay;
  if (overallPlay?.pod_sport) cleaned[overallPlay.pod_sport] = overallPlay;

  return Object.entries(cleaned)
    .map(([sport, play]) => ({ sport, play }))
    .filter((item) => item.play);
}

function getScore(play) {
  return play?.universal_pod_score ?? play?.pod_score ?? play?.final_model_score ?? play?.top_play_score ?? "N/A";
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
  const topPlays = Array.isArray(data?.top_5) ? data.top_5 : [];
  const sportCards = useMemo(() => normalizeBestBySport(data, overallPlay), [data, overallPlay]);

  return (
    <main className="auto-pod-page">
      <TBMPageHeader title="Play of the Day" badge="Premium Dashboard" />

      {error ? (
        <div className="auto-pod-state auto-pod-error">{error}</div>
      ) : !data ? (
        <div className="auto-pod-state">Loading Play of the Day...</div>
      ) : (
        <>
          <section className="auto-pod-kpis">
            <TBMDataCard label="Overall Play" value={overallPlay?.pick || "No Play"} tone="green" />
            <TBMDataCard label="Premium Plays" value={topPlays.length} tone="blue" />
            <TBMDataCard label="POD Score" value={getScore(overallPlay)} tone="gold" />
          </section>

          <TBMHeroPlayCard play={overallPlay} label="Overall Play of the Day" />

          <TBMSection title="Today's Premium Card">
            <div className="auto-pod-premium-list">
              {topPlays.length > 0 ? (
                topPlays.map((play, index) => (
                  <TBMTopPlayRow
                    key={`${play?.game}-${play?.pick}-${index}`}
                    play={play}
                    index={index}
                  />
                ))
              ) : (
                <div className="auto-pod-empty">No premium plays available yet.</div>
              )}
            </div>
          </TBMSection>

          <TBMSection title="Best Play by Sport">
            <div className="auto-pod-sport-grid">
              {sportCards.length > 0 ? (
                sportCards.map(({ sport, play }) => (
                  <TBMSportCard
                    key={sport}
                    name={sport}
                    play={play}
                    href={SPORT_ROUTES[sport] || "#"}
                  />
                ))
              ) : (
                <div className="auto-pod-empty">No sport plays available.</div>
              )}
            </div>
          </TBMSection>

          <TBMSection title="Market Intelligence">
            <TBMIntelligenceGrid play={overallPlay} />
          </TBMSection>

          <TBMSection title="Top Plays Table">
            <TBMTopPlaysTable plays={topPlays} />
          </TBMSection>
        </>
      )}
    </main>
  );
}

export default AutoPODPage;
