import { useEffect, useMemo, useState } from "react";
import MLBTabs from "../components/MLBTabs";
import TBMTopPlayRow from "../components/home/TBMTopPlayRow";
import { TBMPage, TBMCard, TBMMetric, TBMGrid } from "../components/ui";

const API_URL = import.meta.env.VITE_API_URL;

function avgEdge(plays) {
  const values = plays.map((p) => Number(p.edge)).filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function marketCount(plays, market) {
  return plays.filter((p) => String(p.market || "").toLowerCase().includes(market)).length;
}

function sharpCount(plays) {
  return plays.filter((p) =>
    String(p.sharp_signal || p.sharp_book_signal || "").toLowerCase().includes("sharp")
  ).length;
}

function topMarket(plays) {
  if (!plays.length) return "N/A";
  const counts = plays.reduce((acc, play) => {
    const key = play.market || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
}

function ProgressRow({ label, value, max = 10, href, tone = "green" }) {
  const pct = Math.min(100, Math.max(8, (Number(value || 0) / Math.max(max, 1)) * 100));

  return (
    <a className="mlb-overview-progress-row" href={href}>
      <span>{label}</span>
      <div className="mlb-overview-progress-track">
        <div className={`mlb-overview-progress-fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <strong>{value}</strong>
      <em>›</em>
    </a>
  );
}

function EdgeDriver({ title, text, grade = "Strong", tone = "green" }) {
  return (
    <div className="mlb-overview-driver">
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
      <em className={tone}>{grade}</em>
    </div>
  );
}

function RoadmapItem({ title, status, complete = false }) {
  return (
    <div className="mlb-overview-roadmap-row">
      <span className={complete ? "done" : ""}>{complete ? "✓" : "○"}</span>
      <strong>{title}</strong>
      <em>{status}</em>
    </div>
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

  const moneylineCount = marketCount(fullGame, "moneyline");
  const runLineCount = marketCount(fullGame, "run");
  const totalsCount = marketCount(fullGame, "total");
  const maxMarketCount = Math.max(moneylineCount, runLineCount, totalsCount, f5.length, nrfi.length, 1);

  return (
    <TBMPage className="mlb-overview-page">
      <div className="mlb-overview-hero-row">
        <div className="mlb-overview-header">
          <span>MLB Overview</span>
          <h1>MLB Dashboard</h1>
          <p>
            Complete MLB command center for every market with model edges, sharp signals,
            line value, pitching advantages, weather, bullpen risk, and pricing intelligence.
          </p>
        </div>

        <TBMCard className="mlb-overview-snapshot">
          <div className="mlb-overview-snapshot-head">
            <h2>Today’s Snapshot</h2>
            <strong>● Live</strong>
          </div>
          <div><span>Total Plays</span><strong>{allPlays.length}</strong></div>
          <div><span>Avg Edge</span><strong>{avgEdge(allPlays).toFixed(2)}%</strong></div>
          <div><span>Sharp Signals</span><strong>{sharpCount(allPlays)}</strong></div>
          <div><span>Top Market</span><strong>{topMarket(allPlays)}</strong></div>
        </TBMCard>
      </div>

      <MLBTabs />

      {error && <p className="mlb-overview-error">{error}</p>}

      <TBMGrid columns={5} className="mlb-overview-kpis">
        <TBMMetric label="Total MLB Plays" value={allPlays.length} />
        <TBMMetric label="Average Edge" value={`${avgEdge(allPlays).toFixed(2)}%`} accent />
        <TBMMetric label="Top Market" value={topMarket(allPlays)} />
        <TBMMetric label="Sharp Signals" value={sharpCount(allPlays)} accent />
        <TBMMetric label="F5 / NRFI Plays" value={`${f5.length} / ${nrfi.length}`} />
      </TBMGrid>

      <TBMCard className="mlb-overview-panel mlb-overview-top-panel">
        <div className="mlb-overview-panel-header">
          <span>Top MLB Edges</span>
          <h2>Best Plays Across Every MLB Market</h2>
          <p>The best model opportunities ranked by edge.</p>
        </div>

        <div className="mlb-overview-top-list">
          {topPlays.length > 0 ? (
            topPlays.map((play, index) => (
              <TBMTopPlayRow
                key={`${play.game}-${play.pick}-${index}`}
                play={play}
                index={index}
              />
            ))
          ) : (
            <div className="mlb-overview-empty">No MLB plays available.</div>
          )}
        </div>
      </TBMCard>

      <section className="mlb-overview-bottom-clean">
        <TBMCard className="mlb-overview-panel">
          <div className="mlb-overview-panel-header">
            <span>Market Breakdown</span>
            <h2>Plays by Market</h2>
          </div>

          <div className="mlb-overview-progress-list">
            <ProgressRow label="Moneyline" value={moneylineCount} max={maxMarketCount} href="/mlb-model" tone="blue" />
            <ProgressRow label="Run Line" value={runLineCount} max={maxMarketCount} href="/mlb-runline" tone="green" />
            <ProgressRow label="Totals" value={totalsCount} max={maxMarketCount} href="/mlb-totals" tone="purple" />
            <ProgressRow label="First 5" value={f5.length} max={maxMarketCount} href="/mlb-f5" tone="orange" />
            <ProgressRow label="NRFI / YRFI" value={nrfi.length} max={maxMarketCount} href="/mlb-nrfi" tone="gold" />
          </div>
        </TBMCard>

        <TBMCard className="mlb-overview-panel">
          <div className="mlb-overview-panel-header">
            <span>Model Edge Drivers</span>
            <h2>Key Factors Powering Today</h2>
          </div>

          <div className="mlb-overview-driver-list">
            <EdgeDriver title="Pitching Edge" text="Starter ratings, form, and matchup advantage" />
            <EdgeDriver title="Bullpen Edge" text="Fatigue, leverage usage, and recent form" />
            <EdgeDriver title="Weather & Park" text="Weather risk, wind, totals pressure, and park factors" grade="Moderate" tone="gold" />
            <EdgeDriver title="Market Intelligence" text="Sharp action, CLV trends, steam, and timing" />
          </div>
        </TBMCard>

        <TBMCard className="mlb-overview-panel">
          <div className="mlb-overview-panel-header">
            <span>Line Shopping</span>
            <h2>Best Price Intelligence</h2>
          </div>

          <div className="mlb-overview-book-grid">
            <div><span>Best Overall Book</span><strong>FanDuel</strong><small>Top Prices</small></div>
            <div><span>Most Improved</span><strong>DraftKings</strong><small>Better Prices</small></div>
            <div><span>Best CLV</span><strong>Caesars</strong><small>Positive CLV</small></div>
          </div>
        </TBMCard>

        <TBMCard className="mlb-overview-panel">
          <div className="mlb-overview-panel-header">
            <span>What’s Next</span>
            <h2>MLB Suite Roadmap</h2>
          </div>

          <div className="mlb-overview-roadmap-clean">
            <RoadmapItem title="Run Line Dashboard V3" status="Completed" complete />
            <RoadmapItem title="Totals Dashboard V3" status="Next" />
            <RoadmapItem title="First 5 Dashboard V3" status="Upcoming" />
            <RoadmapItem title="NRFI/YRFI Dashboard V3" status="Upcoming" />
          </div>
        </TBMCard>
      </section>
    </TBMPage>
  );
}
