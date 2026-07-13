import { useEffect, useMemo, useState } from "react";
import MLBTabs from "../MLBTabs";
import TBMSportCard from "../home/TBMSportCard";
import TBMSportDashboardHeader from "../sports/TBMSportDashboardHeader";
import TBMSection from "../layout/TBMSection";
import { TBMPage } from "../ui";
import MLBCommandCenter from "./MLBCommandCenter";
import "./MLBMarketDashboard.css";

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

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isMoneylinePlay(play) {
  const market = normalize(play?.market);
  const pick = normalize(play?.pick || play?.recommendation);

  return (
    market === "moneyline" ||
    market === "ml" ||
    market.includes("moneyline") ||
    pick.endsWith(" ml") ||
    pick.includes(" moneyline")
  );
}

function isRunLinePlay(play) {
  const market = normalize(play?.market);
  const pick = normalize(play?.pick || play?.recommendation);

  return (
    market === "run line" ||
    market === "runline" ||
    market.includes("run line") ||
    market.includes("runline") ||
    pick.includes("+1.5") ||
    pick.includes("-1.5")
  );
}

function isTotalPlay(play) {
  const market = normalize(play?.market);
  const pick = normalize(play?.pick || play?.recommendation);

  return (
    market === "total" ||
    market === "totals" ||
    market.includes("total") ||
    pick.startsWith("over ") ||
    pick.startsWith("under ") ||
    pick.includes(" over ") ||
    pick.includes(" under ")
  );
}

function matchesMarket(play, marketKey) {
  if (marketKey === "moneyline") {
    return isMoneylinePlay(play);
  }

  if (marketKey === "runline") {
    return isRunLinePlay(play);
  }

  if (marketKey === "totals") {
    return isTotalPlay(play);
  }

  return false;
}

function buildNavigation(activeRoute, playCount) {
  const navigation = [
    {
      label: "Overview",
      meta: "MLB command center",
      href: "/mlb-overview",
    },
    {
      label: "Moneyline",
      meta: activeRoute === "/mlb-model" ? `${playCount} plays` : "Straight winners",
      href: "/mlb-model",
    },
    {
      label: "Run Line",
      meta: activeRoute === "/mlb-runline" ? `${playCount} plays` : "Run spreads",
      href: "/mlb-runline",
    },
    {
      label: "Totals",
      meta: activeRoute === "/mlb-totals" ? `${playCount} plays` : "Game totals",
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
  ];

  return navigation;
}

export default function MLBMarketDashboard({
  marketKey,
  marketLabel,
  title,
  premiumTitle,
  route,
  emptyMessage,
}) {
  const [plays, setPlays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 30000);

    async function loadPlays() {
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

        console.error(`MLB ${marketLabel} fetch error:`, err);
        setError(`Failed to load the MLB ${marketLabel} model.`);
      } finally {
        window.clearTimeout(timer);
        setLoading(false);
      }
    }

    loadPlays();

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [marketLabel]);

  const filteredPlays = useMemo(
    () =>
      plays
        .filter((play) => matchesMarket(play, marketKey))
        .map((play) => ({
          ...play,
          sport: "MLB",
          market: play?.market || marketLabel,
        }))
        .sort((a, b) => getPlayScore(b) - getPlayScore(a)),
    [plays, marketKey, marketLabel]
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
        label: `${marketLabel} Plays`,
        value: filteredPlays.length,
        sub: `Qualified MLB ${marketLabel.toLowerCase()} plays`,
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
      marketLabel,
    ]
  );

  const navigation = useMemo(
    () => buildNavigation(route, filteredPlays.length),
    [route, filteredPlays.length]
  );

  return (
    <TBMPage className="mlb-market-dashboard-page">
      <TBMSportDashboardHeader
        sport="MLB"
        title={title}
        badge={loading ? "Loading Model" : "Premium Dashboard"}
        flagshipPlay={flagshipPlay}
        topPlays={topPlays}
        metrics={metrics}
        navigation={navigation}
        premiumTitle={premiumTitle}
      />

      <MLBTabs />

      <MLBCommandCenter
        plays={filteredPlays}
        marketLabel={marketLabel}
        loading={loading}
      />

      {error ? (
        <div className="mlb-market-dashboard-state mlb-market-dashboard-error">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <TBMSection title={`All MLB ${marketLabel} Plays`}>
          {filteredPlays.length > 0 ? (
            <div className="mlb-market-dashboard-grid">
              {filteredPlays.map((play, index) => (
                <div
                  className="mlb-market-dashboard-card-shell"
                  key={`${play?.game}-${play?.pick}-${index}`}
                >
                  <span className="mlb-market-dashboard-rank">
                    {index + 1}
                  </span>

                  <TBMSportCard
                    name="MLB"
                    play={play}
                    href={route}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="mlb-market-dashboard-state">
              {emptyMessage}
            </div>
          )}
        </TBMSection>
      ) : null}
    </TBMPage>
  );
}
