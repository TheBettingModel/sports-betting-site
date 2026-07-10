import { useEffect, useMemo, useState } from "react";
import MLBTabs from "../components/MLBTabs";
import TBMSportCard from "../components/home/TBMSportCard";
import TBMSportDashboardHeader from "../components/sports/TBMSportDashboardHeader";
import TBMSection from "../components/layout/TBMSection";
import { TBMPage } from "../components/ui";
import "./MLBModelBoardPage.css";

const API_URL = import.meta.env.VITE_API_URL;

function averageValue(plays, key) {
  const values = plays
    .map((play) => Number(play?.[key]))
    .filter(Number.isFinite);

  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getPlayScore(play) {
  return Number(
    play?.universal_pod_score ??
      play?.pod_score ??
      play?.final_model_score ??
      play?.top_play_score ??
      play?.edge ??
      0
  );
}

function hasSharpSignal(play) {
  const value = String(
    play?.sharp_signal ||
      play?.sharp_book_signal ||
      play?.market_intelligence_signal ||
      ""
  ).toLowerCase();

  return value.includes("sharp") || value.includes("strong");
}

function isMoneylinePlay(play) {
  const market = String(play?.market || "").toLowerCase();
  const pick = String(play?.pick || play?.recommendation || "").toLowerCase();

  return (
    market.includes("moneyline") ||
    market === "ml" ||
    pick.endsWith(" ml") ||
    pick.includes("moneyline")
  );
}

export default function MLBModelBoardPage() {
  const [plays, setPlays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 30000);

    async function loadMoneylinePlays() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`${API_URL}/model/mlb/today`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        setPlays(Array.isArray(data?.plays) ? data.plays : []);
      } catch (err) {
        if (err?.name === "AbortError") {
          return;
        }

        console.error("MLB moneyline fetch error:", err);
        setError("Failed to load the MLB Moneyline model.");
      } finally {
        window.clearTimeout(timer);
        setLoading(false);
      }
    }

    loadMoneylinePlays();

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const filteredPlays = useMemo(
    () =>
      plays
        .filter(isMoneylinePlay)
        .map((play) => ({
          ...play,
          sport: "MLB",
          market: play?.market || "Moneyline",
        }))
        .sort((a, b) => getPlayScore(b) - getPlayScore(a)),
    [plays]
  );

  const topPlays = useMemo(
    () => filteredPlays.slice(0, 5),
    [filteredPlays]
  );

  const flagshipPlay = topPlays[0] || null;

  const averageEdge = averageValue(filteredPlays, "edge");
  const averageConfidence = averageValue(filteredPlays, "confidence");
  const sharpSignals = filteredPlays.filter(hasSharpSignal).length;

  const metrics = useMemo(
    () => [
      {
        label: "Moneyline Plays",
        value: filteredPlays.length,
        sub: "Qualified MLB sides",
        tone: "green",
      },
      {
        label: "Average Edge",
        value: `${averageEdge.toFixed(2)}%`,
        sub: "Across today's board",
        tone: "blue",
      },
      {
        label: "Avg Confidence",
        value: `${averageConfidence.toFixed(0)}%`,
        sub: "Model confidence",
        tone: "gold",
      },
      {
        label: "Sharp Signals",
        value: sharpSignals,
        sub: "Market-supported plays",
        tone: "default",
      },
    ],
    [
      filteredPlays.length,
      averageEdge,
      averageConfidence,
      sharpSignals,
    ]
  );

  const navigation = useMemo(
    () => [
      {
        label: "Overview",
        meta: "MLB command center",
        href: "/mlb-overview",
      },
      {
        label: "Moneyline",
        meta: `${filteredPlays.length} plays`,
        href: "/mlb-model",
      },
      {
        label: "Totals",
        meta: "Full-game totals",
        href: "/mlb-totals",
      },
      {
        label: "First 5",
        meta: "Early-game markets",
        href: "/mlb-f5",
      },
      {
        label: "NRFI / YRFI",
        meta: "First-inning markets",
        href: "/mlb-nrfi",
      },
    ],
    [filteredPlays.length]
  );

  return (
    <TBMPage className="mlb-moneyline-page">
      <TBMSportDashboardHeader
        sport="MLB"
        title="MLB Moneyline Dashboard"
        badge={loading ? "Loading Model" : "Premium Dashboard"}
        flagshipPlay={flagshipPlay}
        topPlays={topPlays}
        metrics={metrics}
        navigation={navigation}
        premiumTitle="Today's Premium Moneyline Card"
      />

      <MLBTabs />

      {error ? (
        <div className="mlb-moneyline-state mlb-moneyline-error">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <TBMSection title="All MLB Moneyline Plays">
          {filteredPlays.length > 0 ? (
            <div className="mlb-moneyline-card-grid">
              {filteredPlays.map((play, index) => (
                <div
                  className="mlb-moneyline-card-shell"
                  key={`${play?.game}-${play?.pick}-${index}`}
                >
                  <span className="mlb-moneyline-rank">
                    {index + 1}
                  </span>

                  <TBMSportCard
                    name="MLB"
                    play={play}
                    href="/mlb-model"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="mlb-moneyline-state">
              No qualified MLB Moneyline plays are currently available.
            </div>
          )}
        </TBMSection>
      ) : null}
    </TBMPage>
  );
}
