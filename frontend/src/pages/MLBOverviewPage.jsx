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

function MarketTile({ title, value, sub, href }) {
  return (
    <a className="mlb-overview-tile" href={href}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </a>
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
      ...fullGame.map((p) => ({ ...p, overview_market: p.market || "Full Game" })),
      ...f5.map((p) => ({ ...p, overview_market: p.market || "First 5" })),
      ...nrfi.map((p) => ({ ...p, overview_market: p.market || "NRFI/YRFI" })),
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

  return (
    <TBMPage className="mlb-overview-page">
      <div className="mlb-overview-header">
        <span>MLB Overview</span>
        <h1>MLB Dashboard</h1>
        <p>
          Complete MLB command center for full game, run line, totals, first five,
          NRFI/YRFI, market intelligence, line shopping, and top model edges.
        </p>
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

      <section className="mlb-overview-main">
        <TBMCard className="mlb-overview-panel">
          <div className="mlb-overview-panel-header">
            <span>Top MLB Edges</span>
            <h2>Best Plays Across Every MLB Market</h2>
          </div>

          <div className="mlb-overview-top-list">
            {topPlays.length > 0 ? (
              topPlays.map((play, index) => (
                <TBMTopPlayRow
                  key={`${play.game}-${play.pick}-${index}`}
                  play={{ ...play, sport: "MLB" }}
                  index={index}
                />
              ))
            ) : (
              <div className="mlb-overview-empty">No MLB plays available.</div>
            )}
          </div>
        </TBMCard>

        <TBMCard className="mlb-overview-panel">
          <div className="mlb-overview-panel-header">
            <span>Market Breakdown</span>
            <h2>MLB Model Boards</h2>
          </div>

          <div className="mlb-overview-market-grid">
            <MarketTile title="Moneyline" value={moneylineCount} sub="Full game ML" href="/mlb-model" />
            <MarketTile title="Run Line" value={runLineCount} sub="Spread market" href="/mlb-runline" />
            <MarketTile title="Totals" value={totalsCount} sub="Over / Under" href="/mlb-totals" />
            <MarketTile title="First 5" value={f5.length} sub="F5 markets" href="/mlb-f5" />
            <MarketTile title="NRFI/YRFI" value={nrfi.length} sub="First inning" href="/mlb-nrfi" />
          </div>
        </TBMCard>
      </section>

      <section className="mlb-overview-bottom">
        <TBMCard className="mlb-overview-panel">
          <div className="mlb-overview-panel-header">
            <span>Model Intelligence</span>
            <h2>What This Dashboard Is Watching</h2>
          </div>

          <div className="mlb-overview-intel-grid">
            <TBMMetric label="Pitching Edge" value="Starter Rating" />
            <TBMMetric label="Bullpen Edge" value="Fatigue + Form" />
            <TBMMetric label="Weather Edge" value="Risk + Park" />
            <TBMMetric label="Market Edge" value="Sharp + CLV" accent />
          </div>
        </TBMCard>

        <TBMCard className="mlb-overview-panel">
          <div className="mlb-overview-panel-header">
            <span>Next Build</span>
            <h2>MLB Suite Roadmap</h2>
          </div>

          <div className="mlb-overview-roadmap">
            <div>Run Line Dashboard V3</div>
            <div>Totals Dashboard V3</div>
            <div>First 5 Dashboard V3</div>
            <div>NRFI/YRFI Dashboard V3</div>
          </div>
        </TBMCard>
      </section>
    </TBMPage>
  );
}
