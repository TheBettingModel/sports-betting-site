import { useEffect, useMemo, useState } from "react";
import MLBTabs from "../components/MLBTabs";
import TBMSportsbookBadge from "../components/logos/TBMSportsbookBadge";
import { TBMPage, TBMCard } from "../components/ui";
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

const API_URL = import.meta.env.VITE_API_URL;

function formatOdds(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  const num = Number(value);

  if (Number.isNaN(num)) {
    return value;
  }

  return num > 0 ? `+${num}` : `${num}`;
}

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

function getBook(play) {
  return (
    play?.best_sportsbook ||
    play?.best_book ||
    play?.sportsbook ||
    "Best Available"
  );
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

function marketBadgeClass(market = "") {
  const value = String(market).toLowerCase();

  if (value.includes("moneyline")) return "blue";
  if (value.includes("run")) return "green";
  if (value.includes("total")) return "purple";
  if (value.includes("first") || value.includes("f5")) return "orange";
  if (value.includes("nrfi") || value.includes("yrfi")) return "gold";

  return "green";
}

function gameShort(game = "") {
  return String(game).replace(" vs ", " @ ").replace(" at ", " @ ");
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

function TopPlayTable({ plays }) {
  return (
    <TBMCard className="mlb-v4-top-table">
      <div className="mlb-v4-panel-title">
        <div>
          <span>MLB Edge Board</span>
          <h2>Ranked Model Plays</h2>
        </div>

        <a href="/mlb-model">Full Board ↗</a>
      </div>

      <div className="mlb-v4-table">
        <div className="mlb-v4-table-head">
          <span>#</span>
          <span>Game</span>
          <span>Pick</span>
          <span>Market</span>
          <span>Odds</span>
          <span>Edge</span>
          <span>Conf.</span>
          <span>Units</span>
          <span>Best Book</span>
        </div>

        {plays.length > 0 ? (
          plays.map((play, index) => (
            <div
              className="mlb-v4-table-row"
              key={`${play?.game}-${play?.pick}-${index}`}
            >
              <div className="rank">{index + 1}</div>

              <div className="game">
                <strong>{gameShort(play?.game)}</strong>
                <span>MLB</span>
              </div>

              <div className="pick">
                <strong>
                  {play?.pick || play?.recommendation || "No Pick"}
                </strong>
                <span>
                  {play?.market || play?.overview_market || "Market"}
                </span>
              </div>

              <div>
                <span
                  className={`mlb-v4-market-pill ${marketBadgeClass(
                    play?.overview_market || play?.market
                  )}`}
                >
                  {play?.overview_market || play?.market || "MLB"}
                </span>
              </div>

              <div className="odds">
                {formatOdds(play?.best_odds ?? play?.odds)}
              </div>

              <div className="edge">{play?.edge ?? "N/A"}%</div>

              <div className="confidence">
                <strong>{play?.confidence ?? "N/A"}%</strong>
                <i
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, Number(play?.confidence) || 0)
                    )}%`,
                  }}
                />
              </div>

              <div className="units">{play?.units ?? "N/A"}</div>

              <div>
                <TBMSportsbookBadge book={getBook(play)} />
              </div>
            </div>
          ))
        ) : (
          <div className="mlb-v4-empty">
            No MLB plays are currently available.
          </div>
        )}
      </div>
    </TBMCard>
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
        href: "/mlb-model",
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

      <TopPlayTable plays={topPlays} />

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
