import { useEffect, useMemo, useState } from "react";
import TBMHeroPlayCard from "../components/home/TBMHeroPlayCard";
import TBMDataCard from "../components/cards/TBMDataCard";
import TBMTopPlaysTable from "../components/cards/TBMTopPlaysTable";
import TBMIntelligenceGrid from "../components/cards/TBMIntelligenceGrid";
import TBMPremiumCardStack from "../components/premium/TBMPremiumCardStack";
import TBMPageHeader from "../components/layout/TBMPageHeader";
import TBMSection from "../components/layout/TBMSection";
import "./AutoPODPage.css";

const API_URL = import.meta.env.VITE_API_URL;

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
  return play?.universal_pod_score ?? play?.final_model_score ?? play?.top_play_score ?? "N/A";
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
            <TBMDataCard label="Overall Play" value={overallPlay?.pick || "No Play"} tone="green" />
            <TBMDataCard label="Premium Plays" value={topFive.length} tone="blue" />
            <TBMDataCard label="POD Score" value={getScore(overallPlay)} tone="gold" />
          </section>

          <TBMHeroPlayCard
            play={overallPlay}
            label="Overall Play of the Day"
          />

          <TBMSection title="Today's Premium Card">
            <TBMPremiumCardStack
              title="Premium Card Preview"
              plays={topFive}
              visibleCount={1}
              lockedCount={2}
            />
          </TBMSection>

          <TBMSection title="Market Intelligence">
            <TBMIntelligenceGrid play={overallPlay} />
          </TBMSection>

          <TBMSection title="Top Plays">
            <TBMTopPlaysTable plays={topFive} />
          </TBMSection>

          <TBMSection title="Qualified Sports">
            <div className="auto-pod-qualified-grid">
              {sportCards.map(({ sport, play }) => (
                <div className="auto-pod-qualified-card" key={sport}>
                  <span>{sport}</span>
                  <strong>{play?.pick || "Qualified Play"}</strong>
                </div>
              ))}
            </div>
          </TBMSection>
        </>
      )}
    </main>
  );
}

export default AutoPODPage;
