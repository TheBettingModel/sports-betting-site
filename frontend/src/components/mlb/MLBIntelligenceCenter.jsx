import { TBMCard } from "../ui";
import TBMSportsbookBadge from "../logos/TBMSportsbookBadge";
import "./MLBIntelligenceCenter.css";

function value(v, fallback = "N/A") {
  return v === null || v === undefined || v === "" ? fallback : v;
}

function topByEdge(plays = []) {
  return [...plays].sort((a, b) => (Number(b.edge) || 0) - (Number(a.edge) || 0))[0];
}

function topSharp(plays = []) {
  return plays.find((p) =>
    String(p.sharp_signal || p.sharp_book_signal || "").toLowerCase().includes("sharp")
  ) || topByEdge(plays);
}

function SignalRow({ label, play, metric }) {
  return (
    <div className="mlb-intel-signal-row">
      <div>
        <span>{label}</span>
        <strong>{value(play?.pick || play?.game)}</strong>
        <small>{value(play?.game)}</small>
      </div>
      <em>{value(metric)}</em>
    </div>
  );
}

function BookRow({ book, label }) {
  return (
    <div className="mlb-intel-book-row">
      <TBMSportsbookBadge book={book} />
      <span>{label}</span>
    </div>
  );
}

export default function MLBIntelligenceCenter({ plays = [] }) {
  const bestEdge = topByEdge(plays);
  const sharp = topSharp(plays);

  return (
    <section className="mlb-intel-grid">
      <TBMCard className="mlb-intel-card">
        <div className="mlb-intel-title">
          <span>Live Line Movement</span>
          <h2>Market movers</h2>
        </div>

        <div className="mlb-intel-list">
          <SignalRow label="Best Edge" play={bestEdge} metric={`${value(bestEdge?.edge)}%`} />
          <SignalRow label="CLV" play={bestEdge} metric={bestEdge?.clv_status} />
          <SignalRow label="Timing" play={bestEdge} metric={bestEdge?.market_timing_signal} />
        </div>
      </TBMCard>

      <TBMCard className="mlb-intel-card">
        <div className="mlb-intel-title">
          <span>Sharp Money Tracker</span>
          <h2>Respected money signals</h2>
        </div>

        <div className="mlb-intel-list">
          <SignalRow label="Sharp Signal" play={sharp} metric={sharp?.sharp_signal || sharp?.sharp_book_signal} />
          <SignalRow label="Best Edge" play={bestEdge} metric={`${value(bestEdge?.edge)}%`} />
          <SignalRow label="Book" play={sharp} metric={sharp?.best_sportsbook || sharp?.sportsbook} />
        </div>
      </TBMCard>

      <TBMCard className="mlb-intel-card">
        <div className="mlb-intel-title">
          <span>Pitcher Matchup Center</span>
          <h2>Starter and bullpen edge</h2>
        </div>

        <div className="mlb-intel-list">
          <SignalRow label="Pitcher Edge" play={bestEdge} metric={bestEdge?.pitcher_rating_diff || bestEdge?.pitcher_rating} />
          <SignalRow label="Starter" play={bestEdge} metric={bestEdge?.starting_pitcher || bestEdge?.away_starter} />
          <SignalRow label="Bullpen" play={bestEdge} metric={bestEdge?.high_leverage_risk || bestEdge?.bullpen_status} />
        </div>
      </TBMCard>

      <TBMCard className="mlb-intel-card">
        <div className="mlb-intel-title">
          <span>Weather & Park Center</span>
          <h2>Run environment watch</h2>
        </div>

        <div className="mlb-intel-list">
          <SignalRow label="Weather" play={bestEdge} metric={bestEdge?.weather_risk} />
          <SignalRow label="Ballpark" play={bestEdge} metric={bestEdge?.ballpark} />
          <SignalRow label="Run Factor" play={bestEdge} metric={bestEdge?.run_factor} />
        </div>
      </TBMCard>

      <TBMCard className="mlb-intel-card wide">
        <div className="mlb-intel-title">
          <span>Sportsbook Comparison</span>
          <h2>Where to shop first</h2>
        </div>

        <div className="mlb-intel-books">
          <BookRow book="FanDuel" label="Top prices" />
          <BookRow book="DraftKings" label="Alt markets" />
          <BookRow book="BetMGM" label="Run line value" />
          <BookRow book="Caesars" label="CLV opportunities" />
          <BookRow book="ESPN BET" label="Line discrepancy watch" />
        </div>
      </TBMCard>

      <TBMCard className="mlb-intel-card wide">
        <div className="mlb-intel-title">
          <span>Today’s Opportunity Map</span>
          <h2>What to monitor next</h2>
        </div>

        <div className="mlb-intel-opportunity-grid">
          <div><span>Bet Now</span><strong>{value(bestEdge?.market_timing_signal || "Best Edge")}</strong></div>
          <div><span>Watch</span><strong>{value(sharp?.sharp_signal || "Sharp Money")}</strong></div>
          <div><span>Shop</span><strong>{value(bestEdge?.best_sportsbook || bestEdge?.sportsbook || "Best Line")}</strong></div>
          <div><span>Risk</span><strong>{value(bestEdge?.weather_risk || "Weather / Bullpen")}</strong></div>
        </div>
      </TBMCard>
    </section>
  );
}
