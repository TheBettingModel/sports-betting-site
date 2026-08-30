import './_group.css';
import { useState } from 'react';

type TeamLogoProps = {
  abbr: string;
  src: string;
};

function TeamLogo({ abbr, src }: TeamLogoProps) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="clear-logo" aria-hidden="true">
      {failed ? abbr : <img src={src} alt="" onError={() => setFailed(true)} />}
    </span>
  );
}

function AnalysisPanel() {
  return (
    <div className="clear-analysis" id="soccer-analysis">
      <div className="clear-analysis-heading">
        <span className="clear-eyebrow">ANALYSIS</span>
        <span className="clear-analysis-status">LEAN · NOT A BET</span>
      </div>

      <div className="clear-score-card">
        <div>
          <p className="clear-metric-label">TBM SCORE</p>
          <p className="clear-score-value">59<span>/100</span></p>
        </div>
        <div className="clear-score-meter" aria-label="TBM Score 59 out of 100">
          <span style={{ width: '59%' }} />
        </div>
        <p className="clear-score-copy">
          A higher score means the model has stronger conviction. This is a moderate lean,
          not a recommendation to bet.
        </p>
      </div>

      <div className="clear-market-grid">
        <div className="clear-market-card">
          <p className="clear-metric-label">MONEYLINE</p>
          <strong>STL · 57.8%</strong>
          <span>Model win probability</span>
        </div>
        <div className="clear-market-card">
          <p className="clear-metric-label">SPREAD</p>
          <strong>STL -0.5 · 53.4%</strong>
          <span>Model cover probability</span>
        </div>
      </div>

      <div className="clear-facts">
        <div><span>EDGE</span><strong>+4.6%</strong></div>
        <div><span>FAIR ML PRICE</span><strong>-137</strong></div>
        <div><span>MARKET ML</span><strong>-120</strong></div>
      </div>

      <p className="clear-explanation">
        The model leans toward STL, but the signal does not clear the threshold for an
        official bet. Treat this as context for the matchup, not a pick.
      </p>
    </div>
  );
}

function SoccerForecastRow() {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className={`clear-row${expanded ? ' clear-row--expanded' : ''}`}>
      <button
        type="button"
        className="clear-row-trigger"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls="soccer-analysis"
      >
        <span className="clear-matchup">
          <span className="clear-teams">
            <span className="clear-team">
              <TeamLogo abbr="DAL" src="https://a.espncdn.com/i/teamlogos/soccer/500/132.png" />
              DAL
            </span>
            <span className="clear-at">@</span>
            <span className="clear-team">
              STL
              <TeamLogo abbr="STL" src="https://a.espncdn.com/i/teamlogos/soccer/500/21812.png" />
            </span>
          </span>
          <span className="clear-time">7:00 PM EDT</span>
        </span>

        <span className="clear-row-summary">
          <span className="clear-status">MODEL LEAN · #1</span>
          <span className="clear-projection">STL · MODEL LEAN</span>
          <span className="clear-score-line">TBM SCORE <strong>59/100</strong></span>
          <span className="clear-score-caption">Higher = stronger model conviction</span>
          <span className="clear-no-bet">NO OFFICIAL BET</span>
        </span>

        <span className={`clear-chevron${expanded ? ' clear-chevron--open' : ''}`} aria-hidden="true">
          <span />
        </span>
      </button>
      {expanded && <AnalysisPanel />}
    </article>
  );
}

export function Clear() {
  return (
    <main className="forecast-preview clear-preview">
      <style>{`
        .clear-shell { padding-top: 30px; }
        .clear-header { margin-bottom: 11px; }
        .clear-row {
          margin: 0 16px;
          overflow: hidden;
          border: 1px solid var(--forecast-border-soft);
          border-radius: 12px;
          background: var(--forecast-card-refined);
          box-shadow: 0 5px 14px rgba(0,0,0,.16);
          animation: clear-rise .42s ease-out both;
        }
        .clear-row-trigger {
          display: flex;
          position: relative;
          width: 100%;
          min-height: 92px;
          align-items: center;
          gap: 10px;
          padding: 12px 34px 12px 13px;
          border: 0;
          color: inherit;
          background: transparent;
          font: inherit;
          text-align: left;
          cursor: pointer;
          transition: background-color .2s ease;
        }
        .clear-row-trigger:hover, .clear-row-trigger:focus-visible { background: rgba(183,243,74,.035); outline: none; }
        .clear-row-trigger:focus-visible { box-shadow: inset 0 0 0 1px rgba(183,243,74,.6); }
        .clear-matchup { flex: 0 0 42%; min-width: 0; }
        .clear-teams { display: flex; align-items: center; gap: 4px; color: var(--forecast-text); font-size: 14px; font-weight: 700; white-space: nowrap; }
        .clear-team { display: inline-flex; align-items: center; gap: 4px; }
        .clear-at { color: var(--forecast-muted); font-size: 12px; }
        .clear-logo { display: grid; place-items: center; width: 20px; height: 20px; flex: 0 0 auto; color: var(--forecast-muted); font: 700 6px/1 var(--forecast-mono); }
        .clear-logo img { display: block; width: 20px; height: 20px; object-fit: contain; }
        .clear-time { display: block; margin-top: 5px; color: var(--forecast-muted); font-size: 10px; font-weight: 500; }
        .clear-row-summary { display: flex; min-width: 0; flex: 1; flex-direction: column; align-items: flex-end; text-align: right; }
        .clear-status { color: var(--forecast-lime); font-size: 8px; font-weight: 700; letter-spacing: .8px; white-space: nowrap; }
        .clear-projection { margin-top: 4px; color: var(--forecast-text); font-size: 11px; font-weight: 700; white-space: nowrap; }
        .clear-score-line { margin-top: 4px; color: var(--forecast-lime); font: 700 10px/1.1 var(--forecast-mono); letter-spacing: .15px; white-space: nowrap; }
        .clear-score-line strong { color: var(--forecast-text); }
        .clear-score-caption { margin-top: 3px; color: var(--forecast-dim); font-size: 8px; white-space: nowrap; }
        .clear-no-bet { margin-top: 5px; color: var(--forecast-muted); font-size: 8px; font-weight: 700; letter-spacing: .65px; white-space: nowrap; }
        .clear-chevron { position: absolute; right: 13px; top: 50%; width: 11px; height: 11px; color: var(--forecast-muted); transform: translateY(-50%); }
        .clear-chevron span { display: block; width: 7px; height: 7px; margin: 1px; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; transform: rotate(45deg); transition: transform .2s ease; }
        .clear-chevron--open span { transform: rotate(225deg) translate(-1px, -1px); }
        .clear-analysis { padding: 0 13px 14px; border-top: 1px solid var(--forecast-border); animation: clear-reveal .24s ease-out both; }
        .clear-analysis-heading { display: flex; justify-content: space-between; align-items: center; padding: 12px 0 10px; }
        .clear-eyebrow, .clear-metric-label { color: var(--forecast-muted); font-size: 8px; font-weight: 700; letter-spacing: .9px; }
        .clear-analysis-status { color: var(--forecast-dim); font: 700 8px var(--forecast-mono); letter-spacing: .2px; }
        .clear-score-card { padding: 11px; border: 1px solid var(--forecast-border); border-radius: 8px; background: #151916; }
        .clear-score-value { margin: 4px 0 0; color: var(--forecast-text); font: 700 24px/1 var(--forecast-mono); letter-spacing: -1px; }
        .clear-score-value span { color: var(--forecast-muted); font-size: 12px; letter-spacing: 0; }
        .clear-score-meter { height: 4px; margin: 10px 0 8px; overflow: hidden; border-radius: 4px; background: #282e29; }
        .clear-score-meter span { display: block; height: 100%; border-radius: inherit; background: var(--forecast-lime); }
        .clear-score-copy, .clear-explanation { margin: 0; color: var(--forecast-muted); font-size: 10px; line-height: 1.45; }
        .clear-market-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 8px; }
        .clear-market-card { padding: 10px; border: 1px solid var(--forecast-border-soft); border-radius: 8px; }
        .clear-market-card strong { display: block; margin-top: 6px; color: var(--forecast-text); font: 700 11px var(--forecast-mono); }
        .clear-market-card span { display: block; margin-top: 4px; color: var(--forecast-dim); font-size: 8px; line-height: 1.3; }
        .clear-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 10px 0; padding: 9px 0; border-top: 1px solid var(--forecast-border-soft); border-bottom: 1px solid var(--forecast-border-soft); }
        .clear-facts div { display: flex; flex-direction: column; gap: 4px; }
        .clear-facts span { color: var(--forecast-dim); font-size: 7px; font-weight: 700; letter-spacing: .55px; }
        .clear-facts strong { color: var(--forecast-text); font: 700 10px var(--forecast-mono); }
        .clear-explanation { color: #aab2ac; }
        @keyframes clear-rise { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes clear-reveal { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 350px) {
          .clear-row { margin-left: 12px; margin-right: 12px; }
          .clear-row-trigger { gap: 7px; padding-left: 10px; padding-right: 30px; }
          .clear-matchup { flex-basis: 40%; }
          .clear-teams { font-size: 13px; gap: 2px; }
          .clear-logo, .clear-logo img { width: 18px; height: 18px; }
          .clear-score-caption { font-size: 7px; }
        }
      `}</style>
      <section className="forecast-shell clear-shell" aria-label="Clear soccer projections">
        <header className="forecast-section-header clear-header">
          <div>
            <h1 className="forecast-title">ALL SOCCER PROJECTIONS</h1>
            <p className="forecast-subtitle">1 upcoming game</p>
            <p className="forecast-order">RANKED BY VALUE EDGE · HIGHEST FIRST</p>
          </div>
          <div className="forecast-count">1</div>
        </header>
        <SoccerForecastRow />
      </section>
    </main>
  );
}

export default Clear;