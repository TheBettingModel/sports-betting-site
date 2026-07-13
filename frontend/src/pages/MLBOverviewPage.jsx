import { useEffect, useMemo, useState } from "react";
import MLBTabs from "../components/MLBTabs";
import TBMSportCard from "../components/home/TBMSportCard";
import { TBMPage } from "../components/ui";
import TBMSportDashboardHeader from "../components/sports/TBMSportDashboardHeader";
import MLBIntelligenceCenter from "../components/mlb/MLBIntelligenceCenter";
import MLBSlateCommandBar from "../components/mlb/MLBSlateCommandBar";
import MLBPitcherMatchupCenter from "../components/mlb/MLBPitcherMatchupCenter";
import MLBMarketHeatMap from "../components/mlb/MLBMarketHeatMap";
import MLBSharpMoneyMeter from "../components/mlb/MLBSharpMoneyMeter";
import MLBWeatherParkCenter from "../components/mlb/MLBWeatherParkCenter";
import MLBSportsbookPriceBoard from "../components/mlb/MLBSportsbookPriceBoard";
import MLBLineMovementTracker from "../components/mlb/MLBLineMovementTracker";
import MLBPerformanceMiniDashboard from "../components/mlb/MLBPerformanceMiniDashboard";
import "./MLBOverviewPage.css";

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

function countMarket(plays, market) {
  const search = String(market || "").toLowerCase();

  return plays.filter((play) =>
    String(play?.market || "").toLowerCase().includes(search)
  ).length;
}

function sharpCount(plays) {
  return plays.filter((play) => {
    const signal = String(
      play?.sharp_signal ||
        play?.sharp_book_signal ||
        play?.market_intelligence_signal ||
        ""
    ).toLowerCase();

    return signal.includes("sharp") || signal.includes("strong");
  }).length;
}

function topMarket(plays) {
  if (!plays.length) {
    return "N/A";
  }

  const counts = plays.reduce((accumulator, play) => {
    const market = play?.overview_market || play?.market || "Unknown";
    accumulator[market] = (accumulator[market] || 0) + 1;
    return accumulator;
  }, {});

  return (
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A"
  );
}

function playScore(play) {
  return Number(
    play?.universal_pod_score ??
      play?.pod_score ??
      play?.final_model_score ??
      play?.top_play_score ??
      play?.edge ??
      0
  );
}

function RankedPlayCards({ plays }) {
  return (
    <section className="mlb-overview-ranked-section">
      <div className="mlb-overview-ranked-shell">
        <div className="mlb-overview-ranked-header">
          <div>
            <span>MLB Edge Board</span>
            <h2>Ranked Model Plays</h2>
          </div>

          <a href="/mlb-model">View Full Board →</a>
        </div>

        <div className="mlb-overview-ranked-grid">
          {plays.length > 0 ? (
            plays.map((play, index) => (
              <div
                className="mlb-overview-ranked-card-wrap"
                key={`${play?.game}-${play?.pick}-${index}`}
              >
                <span className="mlb-overview-ranked-number">
                  {index + 1}
                </span>

                <TBMSportCard
                  name="MLB"
                  play={play}
                  href="/mlb-model"
                />
              </div>
            ))
          ) : (
            <div className="mlb-overview-ranked-empty">
              No qualified MLB plays are currently available.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function MLBOverviewPage() {
  const [fullGame, setFullGame] = useState([]);
  const [f5, setF5] = useState([]);
  const [nrfi, setNrfi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadMLB() {
      try {
        setLoading(true);
        setError("");

        const [fullRes, f5Res, nrfiRes] = await Promise.all([
          fetch(`${API_URL}/model/mlb/today`),
          fetch(`${API_URL}/model/mlb/f5/today`),
          fetch(`${API_URL}/model/mlb/nrfi/today`),
        ]);

        if (!fullRes.ok || !f5Res.ok || !nrfiRes.ok) {
          throw new Error("One or more MLB endpoints failed.");
        }

        const [fullData, f5Data, nrfiData] = await Promise.all([
          fullRes.json(),
          f5Res.json(),
          nrfiRes.json(),
        ]);

        if (!active) {
          return;
        }

        setFullGame(
          Array.isArray(fullData?.plays) ? fullData.plays : []
        );

        setF5(
          Array.isArray(f5Data?.plays) ? f5Data.plays : []
        );

        setNrfi(
          Array.isArray(nrfiData?.plays) ? nrfiData.plays : []
        );
      } catch (err) {
        console.error("MLB overview fetch error:", err);

        if (active) {
          setError("Failed to load the MLB overview.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadMLB();

    return () => {
      active = false;
    };
  }, []);

  const allPlays = useMemo(
    () => [
      ...fullGame.map((play) => ({
        ...play,
        sport: "MLB",
        overview_market: play?.market || "Full Game",
      })),
      ...f5.map((play) => ({
        ...play,
        sport: "MLB",
        overview_market: play?.market || "First 5",
      })),
      ...nrfi.map((play) => ({
        ...play,
        sport: "MLB",
        overview_market: play?.market || "NRFI/YRFI",
      })),
    ],
    [fullGame, f5, nrfi]
  );

  const topPlays = useMemo(
    () =>
      [...allPlays]
        .sort((a, b) => playScore(b) - playScore(a))
        .slice(0, 5),
    [allPlays]
  );

  const flagshipPlay = topPlays[0] || null;

  const moneylineCount = countMarket(fullGame, "moneyline");
  const runLineCount = countMarket(fullGame, "run");
  const totalsCount = countMarket(fullGame, "total");

  const metrics = useMemo(
    () => [
      {
        label: "Today's Plays",
        value: allPlays.length,
        sub: "All qualified MLB markets",
        tone: "green",
      },
      {
        label: "Average Edge",
        value: `${averageValue(allPlays, "edge").toFixed(2)}%`,
        sub: `${averageValue(allPlays, "confidence").toFixed(
          1
        )}% average confidence`,
        tone: "blue",
      },
      {
        label: "Sharp Signals",
        value: sharpCount(allPlays),
        sub: "Qualified market signals",
        tone: "gold",
      },
      {
        label: "Top Market",
        value: topMarket(allPlays),
        sub: "Most active model market",
        tone: "default",
      },
    ],
    [allPlays]
  );

  const navigation = useMemo(
    () => [
      {
        label: "Moneyline",
        meta: `${moneylineCount} plays`,
        href: "/mlb-model",
      },
      {
        label: "Run Line",
        meta: `${runLineCount} plays`,
        href: "/mlb-runline",
      },
      {
        label: "Totals",
        meta: `${totalsCount} plays`,
        href: "/mlb-totals",
      },
      {
        label: "First 5",
        meta: `${f5.length} plays`,
        href: "/mlb-f5",
      },
      {
        label: "NRFI / YRFI",
        meta: `${nrfi.length} plays`,
        href: "/mlb-nrfi",
      },
    ],
    [
      moneylineCount,
      runLineCount,
      totalsCount,
      f5.length,
      nrfi.length,
    ]
  );

  return (
    <TBMPage className="mlb-v4-page">
      <TBMSportDashboardHeader
        sport="MLB"
        title="MLB Dashboard"
        badge={loading ? "Loading Model" : "Premium Dashboard"}
        flagshipPlay={flagshipPlay}
        topPlays={topPlays}
        metrics={metrics}
        navigation={navigation}
        premiumTitle="Today's Premium MLB Card"
      />

      <MLBTabs />

      {error ? <p className="mlb-v4-error">{error}</p> : null}

      <MLBSlateCommandBar
        plays={allPlays}
        f5Count={f5.length}
        nrfiCount={nrfi.length}
      />

      <RankedPlayCards plays={topPlays} />

      <section className="mlb-command-center-v6">
        <div className="mlb-command-main-v6">
          <MLBIntelligenceCenter plays={allPlays} />

          <MLBMarketHeatMap
            fullGame={fullGame}
            f5={f5}
            nrfi={nrfi}
          />

          <MLBSportsbookPriceBoard plays={allPlays} />
        </div>

        <aside className="mlb-command-side-v6">
          <MLBSharpMoneyMeter plays={allPlays} />
          <MLBPitcherMatchupCenter plays={allPlays} />
          <MLBWeatherParkCenter plays={allPlays} />
          <MLBLineMovementTracker plays={allPlays} />
          <MLBPerformanceMiniDashboard />
        </aside>
      </section>
    </TBMPage>
  );
}
