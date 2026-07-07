import { useEffect, useMemo, useState } from "react";
import MLBTabs from "../components/MLBTabs";
import TBMSportsbookBadge from "../components/logos/TBMSportsbookBadge";
import { TBMPage, TBMCard } from "../components/ui";
import MLBIntelligenceCenter from "../components/mlb/MLBIntelligenceCenter";
import MLBSlateCommandBar from "../components/mlb/MLBSlateCommandBar";
import MLBPitcherMatchupCenter from "../components/mlb/MLBPitcherMatchupCenter";
import MLBMarketHeatMap from "../components/mlb/MLBMarketHeatMap";
import MLBSharpMoneyMeter from "../components/mlb/MLBSharpMoneyMeter";
import MLBWeatherParkCenter from "../components/mlb/MLBWeatherParkCenter";

const API_URL = import.meta.env.VITE_API_URL;

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
}

function avgEdge(plays) {
  const values = plays.map((p) => Number(p.edge)).filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function avgConfidence(plays) {
  const values = plays.map((p) => Number(p.confidence)).filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function countMarket(plays, market) {
  return plays.filter((p) => String(p.market || "").toLowerCase().includes(market)).length;
}

function sharpCount(plays) {
  return plays.filter((p) =>
    String(p.sharp_signal || p.sharp_book_signal || "").toLowerCase().includes("sharp")
  ).length;
}

function getBook(play) {
  return play?.best_sportsbook || play?.sportsbook || "Best Available";
}

function topMarket(plays) {
  if (!plays.length) return "N/A";
  const counts = plays.reduce((acc, play) => {
    const key = play.overview_market || play.market || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
}

function marketBadgeClass(market = "") {
  const value = market.toLowerCase();
  if (value.includes("moneyline")) return "blue";
  if (value.includes("run")) return "green";
  if (value.includes("total")) return "purple";
  if (value.includes("first") || value.includes("f5")) return "orange";
  if (value.includes("nrfi") || value.includes("yrfi")) return "gold";
  return "green";
}

function gameShort(game = "") {
  return String(game)
    .replace(" vs ", " @ ")
    .replace(" at ", " @ ");
}

function SnapshotRow({ label, value }) {
  return (
    <div className="mlb-v4-snapshot-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MarketRow({ label, value, max, href, tone }) {
  const pct = Math.min(100, Math.max(7, (Number(value || 0) / Math.max(max, 1)) * 100));

  return (
    <a href={href} className="mlb-v4-market-row">
      <span>{label}</span>
      <div>
        <i className={tone} style={{ width: `${pct}%` }} />
      </div>
      <strong>{value}</strong>
      <em>›</em>
    </a>
  );
}

function EdgeDriver({ title, desc, status = "Strong", tone = "green" }) {
  return (
    <div className="mlb-v4-driver">
      <div className={`mlb-v4-driver-icon ${tone}`}>▮</div>
      <div>
        <strong>{title}</strong>
        <span>{desc}</span>
      </div>
      <em className={tone}>{status}</em>
    </div>
  );
}

function RoadmapRow({ title, status, done = false }) {
  return (
    <div className="mlb-v4-roadmap-row">
      <span className={done ? "done" : ""}>{done ? "✓" : "○"}</span>
      <strong>{title}</strong>
      <em>{status}</em>
    </div>
  );
}

function TopPlayTable({ plays }) {
  return (
    <TBMCard className="mlb-v4-top-table">
      <div className="mlb-v4-panel-title">
        <div>
          <span>Top MLB Edges Across All Markets</span>
          <h2>Best model opportunities ranked by edge</h2>
        </div>
        <a href="/mlb-model">View All Markets ↗</a>
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
            <div className="mlb-v4-table-row" key={`${play.game}-${play.pick}-${index}`}>
              <div className="rank">{index + 1}</div>

              <div className="game">
                <strong>{gameShort(play.game)}</strong>
                <span>MLB</span>
              </div>

              <div className="pick">
                <strong>{play.pick || play.recommendation}</strong>
                <span>{play.market || play.overview_market || "Market"}</span>
              </div>

              <div>
                <span className={`mlb-v4-market-pill ${marketBadgeClass(play.overview_market || play.market)}`}>
                  {play.overview_market || play.market || "MLB"}
                </span>
              </div>

              <div className="odds">{formatOdds(play.best_odds ?? play.odds)}</div>
              <div className="edge">{play.edge ?? "N/A"}%</div>

              <div className="confidence">
                <strong>{play.confidence ?? "N/A"}%</strong>
                <i style={{ width: `${Math.min(100, Number(play.confidence) || 0)}%` }} />
              </div>

              <div className="units">{play.units ?? "N/A"}</div>
              <div><TBMSportsbookBadge book={getBook(play)} /></div>
            </div>
          ))
        ) : (
          <div className="mlb-v4-empty">No MLB plays available.</div>
        )}
      </div>
    </TBMCard>
  );
}

export default function MLBOverviewPage() {
  const [fullGame, setFullGame] = useState([]);
  const [f5, setF5] = useState([]);
  const [nrfi, setNrfi] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMLB() {
      try {
        setError("");

        const [fullRes, f5Res, nrfiRes] = await Promise.all([
          fetch(`${API_URL}/model/mlb/today`),
          fetch(`${API_URL}/model/mlb/f5/today`),
          fetch(`${API_URL}/model/mlb/nrfi/today`),
        ]);

        const [fullData, f5Data, nrfiData] = await Promise.all([
          fullRes.json(),
          f5Res.json(),
          nrfiRes.json(),
        ]);

        setFullGame(Array.isArray(fullData.plays) ? fullData.plays : []);
        setF5(Array.isArray(f5Data.plays) ? f5Data.plays : []);
        setNrfi(Array.isArray(nrfiData.plays) ? nrfiData.plays : []);
      } catch (err) {
        console.error("MLB overview fetch error:", err);
        setError("Failed to load MLB overview.");
      }
    }

    loadMLB();
  }, []);

  const allPlays = useMemo(() => {
    return [
      ...fullGame.map((p) => ({ ...p, sport: "MLB", overview_market: p.market || "Full Game" })),
      ...f5.map((p) => ({ ...p, sport: "MLB", overview_market: p.market || "First 5" })),
      ...nrfi.map((p) => ({ ...p, sport: "MLB", overview_market: p.market || "NRFI/YRFI" })),
    ];
  }, [fullGame, f5, nrfi]);

  const topPlays = useMemo(() => {
    return [...allPlays]
      .sort((a, b) => (Number(b.edge) || 0) - (Number(a.edge) || 0))
      .slice(0, 5);
  }, [allPlays]);

  const moneylineCount = countMarket(fullGame, "moneyline");
  const runLineCount = countMarket(fullGame, "run");
  const totalsCount = countMarket(fullGame, "total");
  const maxMarketCount = Math.max(moneylineCount, runLineCount, totalsCount, f5.length, nrfi.length, 1);

  return (
    <TBMPage className="mlb-v4-page">
      <section className="mlb-v4-hero">
        <div>
          <span className="mlb-v4-eyebrow">MLB Overview</span>
          <h1>MLB Dashboard</h1>
          <p>
            Your complete MLB command center. Real-time model edges across every market
            with sharp signals, line value, situational advantages, and pricing intelligence.
          </p>
        </div>

        <TBMCard className="mlb-v4-snapshot">
          <div className="mlb-v4-snapshot-title">
            <h2>Today’s Snapshot</h2>
            <strong>● Live</strong>
          </div>
          <SnapshotRow label="Total Plays" value={allPlays.length} />
          <SnapshotRow label="Avg Edge" value={`${avgEdge(allPlays).toFixed(2)}%`} />
          <SnapshotRow label="Sharp Signals" value={sharpCount(allPlays)} />
          <SnapshotRow label="Top Market" value={topMarket(allPlays)} />
        </TBMCard>
      </section>

      <MLBTabs />

      {error && <p className="mlb-v4-error">{error}</p>}

      <MLBSlateCommandBar plays={allPlays} f5Count={f5.length} nrfiCount={nrfi.length} />

      <TopPlayTable plays={topPlays} />

      <MLBIntelligenceCenter plays={allPlays} />

      <MLBPitcherMatchupCenter plays={allPlays} />

      <MLBMarketHeatMap fullGame={fullGame} f5={f5} nrfi={nrfi} />

      <MLBSharpMoneyMeter plays={allPlays} />

      <MLBWeatherParkCenter plays={allPlays} />

      <section className="mlb-v4-card-grid">
        <TBMCard className="mlb-v4-panel">
          <div className="mlb-v4-panel-title compact">
            <div>
              <span>Market Breakdown</span>
              <h2>Plays by market</h2>
            </div>
          </div>

          <div className="mlb-v4-market-list">
            <MarketRow label="Moneyline" value={moneylineCount} max={maxMarketCount} href="/mlb-model" tone="blue" />
            <MarketRow label="Run Line" value={runLineCount} max={maxMarketCount} href="/mlb-runline" tone="green" />
            <MarketRow label="Totals" value={totalsCount} max={maxMarketCount} href="/mlb-totals" tone="purple" />
            <MarketRow label="First 5" value={f5.length} max={maxMarketCount} href="/mlb-f5" tone="orange" />
            <MarketRow label="NRFI/YRFI" value={nrfi.length} max={maxMarketCount} href="/mlb-nrfi" tone="gold" />
          </div>
        </TBMCard>

        <TBMCard className="mlb-v4-panel">
          <div className="mlb-v4-panel-title compact">
            <div>
              <span>Model Edge Drivers</span>
              <h2>Key factors powering today’s edges</h2>
            </div>
          </div>

          <div className="mlb-v4-driver-list">
            <EdgeDriver title="Pitching Edge" desc="Starter ratings, form, and matchup advantage" />
            <EdgeDriver title="Bullpen Edge" desc="Bullpen fatigue, leverage usage, and form" />
            <EdgeDriver title="Weather & Park" desc="Weather risk, wind, and park factors" status="Moderate" tone="gold" />
            <EdgeDriver title="Market Intelligence" desc="Sharp action, CLV trends, and timing" />
          </div>
        </TBMCard>

        <TBMCard className="mlb-v4-panel">
          <div className="mlb-v4-panel-title compact">
            <div>
              <span>Line Shopping Advantage</span>
              <h2>Best books for top opportunities</h2>
            </div>
          </div>

          <div className="mlb-v4-book-grid">
            <div><span>Best Overall Book</span><strong>FanDuel</strong><small>Top Prices</small></div>
            <div><span>Most Improved</span><strong>DraftKings</strong><small>Better Prices</small></div>
            <div><span>Best CLV</span><strong>Caesars</strong><small>Positive CLV</small></div>
          </div>
        </TBMCard>

        <TBMCard className="mlb-v4-panel">
          <div className="mlb-v4-panel-title compact">
            <div>
              <span>What’s Next</span>
              <h2>MLB suite roadmap</h2>
            </div>
          </div>

          <div className="mlb-v4-roadmap">
            <RoadmapRow title="Run Line Dashboard V3" status="Completed" done />
            <RoadmapRow title="Totals Dashboard V3" status="Next" />
            <RoadmapRow title="First 5 Dashboard V3" status="Upcoming" />
            <RoadmapRow title="NRFI/YRFI Dashboard V3" status="Upcoming" />
          </div>
        </TBMCard>
      </section>
    </TBMPage>
  );
}
