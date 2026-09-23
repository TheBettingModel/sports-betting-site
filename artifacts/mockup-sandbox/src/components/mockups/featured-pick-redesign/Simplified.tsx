import { useState } from 'react';
import './_group.css';

type Team = {
  city: string;
  name: string;
  abbr: string;
  record: string;
  logoUrl: string;
};

const game = {
  sport: 'MLB',
  tier: 'TOP PICK',
  gameTime: '7:10 PM ET',
  awayTeam: {
    city: 'Cincinnati',
    name: 'Reds',
    abbr: 'CIN',
    record: '48-52',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/mlb/500/cin.png',
  } satisfies Team,
  homeTeam: {
    city: 'Chicago',
    name: 'Cubs',
    abbr: 'CHC',
    record: '55-45',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/mlb/500/chc.png',
  } satisfies Team,
  pick: 'CHC MONEYLINE',
  odds: -128,
  valueRating: 'Strong Buy',
  units: 2.0,
  modelScore: 88,
  stars: 4,
  edge: 6.8,
  total: 8.5,
  spread: -1.5,
  homeOdds: -128,
  awayStarter: { name: 'Nick Lodolo', era: 3.34 },
  homeStarter: { name: 'Shota Imanaga', era: 2.81 },
  bestLineBook: 'DraftKings',
  bestLineOdds: -128,
  insights: ['Cubs bullpen advantage', 'Reds 3-7 in last 10'],
};

function american(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function TeamLogo({ team }: { team: Team }) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="featured-pick-simplified__logo" aria-label={`${team.name} logo`}>
      {!failed ? (
        <img src={team.logoUrl} alt="" onError={() => setFailed(true)} />
      ) : (
        <span>{team.abbr}</span>
      )}
    </span>
  );
}

function DetailRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="featured-pick-simplified__detail-row">
      <span>{label}</span>
      <strong className={accent ? 'is-accent' : ''}>{value}</strong>
    </div>
  );
}

export function Simplified() {
  const [expanded, setExpanded] = useState(false);
  const { awayTeam, homeTeam } = game;

  return (
    <main className="featured-pick-simplified">
      <style>{`
        .featured-pick-simplified {
          --fp-background: #000000;
          --fp-card: #0f0f0f;
          --fp-muted: #141414;
          --fp-border: #1e1e1e;
          --fp-foreground: #ffffff;
          --fp-muted-foreground: #7f8792;
          --fp-feature: #b7f34a;
          --fp-feature-soft: #18230d;
          min-height: 100dvh;
          padding: 28px 12px 44px;
          background: var(--fp-background);
          color: var(--fp-foreground);
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .featured-pick-simplified *, .featured-pick-simplified *::before, .featured-pick-simplified *::after { box-sizing: border-box; }
        .featured-pick-simplified__context { width: min(100%, 390px); margin: 0 auto 11px; color: var(--fp-muted-foreground); font-size: 11px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
        .featured-pick-simplified__context strong { color: var(--fp-foreground); font-weight: 700; }
        .featured-pick-simplified__card { width: min(100%, 390px); margin: 0 auto; overflow: hidden; border: 1px solid var(--fp-border); border-left: 3px solid var(--fp-feature); border-radius: 0 14px 14px 0; background: var(--fp-card); box-shadow: 0 12px 24px rgba(0,0,0,.18); }
        .featured-pick-simplified__top { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px 11px; border-bottom: 1px solid var(--fp-border); color: var(--fp-muted-foreground); font-size: 10px; font-weight: 700; letter-spacing: .11em; }
        .featured-pick-simplified__top strong { color: var(--fp-feature); }
        .featured-pick-simplified__time { color: var(--fp-foreground); letter-spacing: .06em; }
        .featured-pick-simplified__body { padding: 15px 15px 9px; }
        .featured-pick-simplified__matchup { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
        .featured-pick-simplified__team { display: grid; justify-items: center; gap: 4px; min-width: 0; }
        .featured-pick-simplified__team:last-child { justify-items: center; }
        .featured-pick-simplified__logo { display: grid; width: 52px; height: 52px; place-items: center; overflow: hidden; border: 1px solid var(--fp-border); border-radius: 50%; background: var(--fp-muted); color: var(--fp-feature); font-size: 12px; font-weight: 700; }
        .featured-pick-simplified__logo img { width: 100%; height: 100%; object-fit: contain; }
        .featured-pick-simplified__logo > span { display: grid; width: 100%; height: 100%; place-items: center; }
        .featured-pick-simplified__team strong { font-size: 14px; letter-spacing: .02em; }
        .featured-pick-simplified__team small { color: var(--fp-muted-foreground); font-size: 10px; font-weight: 500; }
        .featured-pick-simplified__vs { display: grid; justify-items: center; gap: 3px; color: var(--fp-muted-foreground); }
        .featured-pick-simplified__vs b { color: var(--fp-foreground); font-size: 12px; letter-spacing: .1em; }
        .featured-pick-simplified__vs span { font-size: 9px; line-height: 13px; text-align: center; }
        .featured-pick-simplified__hero { margin-top: 17px; padding: 14px 14px 13px; border: 1px solid rgba(183,243,74,.28); border-radius: 9px; background: var(--fp-feature-soft); }
        .featured-pick-simplified__eyebrow { color: var(--fp-feature); font-size: 9px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
        .featured-pick-simplified__pick-line { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-top: 6px; }
        .featured-pick-simplified__pick { color: var(--fp-foreground); font-size: clamp(21px, 6.5vw, 27px); font-weight: 700; letter-spacing: -.055em; line-height: 1; }
        .featured-pick-simplified__odds { color: var(--fp-feature); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(24px, 7vw, 30px); font-weight: 700; letter-spacing: -.06em; }
        .featured-pick-simplified__meta { display: flex; align-items: center; gap: 8px; margin-top: 10px; color: var(--fp-muted-foreground); font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
        .featured-pick-simplified__meta strong { color: var(--fp-feature); }
        .featured-pick-simplified__meta i { color: var(--fp-border); font-style: normal; }
        .featured-pick-simplified__analysis-button { display: flex; width: 100%; min-height: 44px; align-items: center; justify-content: flex-end; gap: 7px; padding: 8px 0 2px; border: 0; background: transparent; color: var(--fp-muted-foreground); cursor: pointer; font: inherit; font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; transition: color .18s ease, opacity .18s ease; }
        .featured-pick-simplified__analysis-button:hover, .featured-pick-simplified__analysis-button:focus-visible { color: var(--fp-foreground); outline: none; }
        .featured-pick-simplified__analysis-button:active { opacity: .65; }
        .featured-pick-simplified__chevron { color: var(--fp-feature); font-size: 15px; line-height: 1; transform: translateY(-1px); }
        .featured-pick-simplified__analysis { padding: 4px 15px 17px; animation: featuredPickReveal .2s ease-out; }
        .featured-pick-simplified__analysis-inner { padding-top: 14px; border-top: 1px solid var(--fp-border); }
        .featured-pick-simplified__analysis-title { margin: 0 0 13px; color: var(--fp-foreground); font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
        .featured-pick-simplified__details { display: grid; gap: 10px; }
        .featured-pick-simplified__detail-row { display: flex; justify-content: space-between; gap: 14px; color: var(--fp-muted-foreground); font-size: 11px; }
        .featured-pick-simplified__detail-row strong { color: var(--fp-foreground); font-weight: 600; text-align: right; }
        .featured-pick-simplified__detail-row strong.is-accent { color: var(--fp-feature); }
        .featured-pick-simplified__pitchers, .featured-pick-simplified__market { display: grid; grid-template-columns: 1fr auto 1fr; gap: 9px; margin-top: 15px; padding-top: 13px; border-top: 1px solid var(--fp-border); }
        .featured-pick-simplified__pitcher { display: grid; gap: 3px; color: var(--fp-muted-foreground); font-size: 9px; }
        .featured-pick-simplified__pitcher:last-child { justify-items: end; text-align: right; }
        .featured-pick-simplified__pitcher strong { color: var(--fp-foreground); font-size: 11px; }
        .featured-pick-simplified__pitcher em { color: var(--fp-feature); font-size: 10px; font-style: normal; }
        .featured-pick-simplified__middle { align-self: center; color: var(--fp-muted-foreground); font-size: 10px; }
        .featured-pick-simplified__market { grid-template-columns: repeat(3, 1fr); }
        .featured-pick-simplified__market span { display: grid; gap: 3px; color: var(--fp-muted-foreground); font-size: 9px; }
        .featured-pick-simplified__market span:nth-child(2) { text-align: center; }
        .featured-pick-simplified__market span:last-child { text-align: right; }
        .featured-pick-simplified__market strong { color: var(--fp-foreground); font-size: 11px; }
        .featured-pick-simplified__insights { display: grid; gap: 6px; margin-top: 14px; color: var(--fp-muted-foreground); font-size: 10px; }
        .featured-pick-simplified__insights span::before { content: '—'; margin-right: 6px; color: var(--fp-feature); }
        @keyframes featuredPickReveal { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 350px) {
          .featured-pick-simplified { padding-right: 8px; padding-left: 8px; }
          .featured-pick-simplified__body { padding-right: 12px; padding-left: 12px; }
          .featured-pick-simplified__logo { width: 46px; height: 46px; }
          .featured-pick-simplified__pick { font-size: 20px; }
        }
      `}</style>

      <div className="featured-pick-simplified__context">
        <strong>Today’s Top Pick</strong>
      </div>
      <article className="featured-pick-simplified__card" aria-label="Featured MLB top pick">
        <header className="featured-pick-simplified__top">
          <span><strong>{game.sport}</strong> · {game.tier}</span>
          <span className="featured-pick-simplified__time">{game.gameTime}</span>
        </header>

        <div className="featured-pick-simplified__body">
          <section className="featured-pick-simplified__matchup" aria-label="Matchup">
            <div className="featured-pick-simplified__team">
              <TeamLogo team={awayTeam} />
              <strong>{awayTeam.abbr}</strong>
              <small>{awayTeam.record} · AWAY</small>
            </div>
            <div className="featured-pick-simplified__vs">
              <b>AT</b>
              <span>{awayTeam.city} {awayTeam.name}<br />{homeTeam.city} {homeTeam.name}</span>
            </div>
            <div className="featured-pick-simplified__team">
              <TeamLogo team={homeTeam} />
              <strong>{homeTeam.abbr}</strong>
              <small>{homeTeam.record} · HOME</small>
            </div>
          </section>

          <section className="featured-pick-simplified__hero" aria-label="TBM pick">
            <div className="featured-pick-simplified__eyebrow">TBM PICK</div>
            <div className="featured-pick-simplified__pick-line">
              <strong className="featured-pick-simplified__pick">{game.pick}</strong>
              <strong className="featured-pick-simplified__odds">{american(game.odds)}</strong>
            </div>
            <div className="featured-pick-simplified__meta">
              <strong>{game.valueRating}</strong>
              <i>·</i>
              <span>{game.units.toFixed(1)}U</span>
            </div>
          </section>

          <button
            type="button"
            className="featured-pick-simplified__analysis-button"
            aria-expanded={expanded}
            onClick={() => setExpanded((isOpen) => !isOpen)}
          >
            {expanded ? 'Hide analysis' : 'View analysis'}
            <span className="featured-pick-simplified__chevron" aria-hidden="true">{expanded ? '−' : '+'}</span>
          </button>
        </div>

        {expanded && (
          <section className="featured-pick-simplified__analysis" aria-label="Pick analysis">
            <div className="featured-pick-simplified__analysis-inner">
              <h2 className="featured-pick-simplified__analysis-title">Why TBM likes {homeTeam.name}</h2>
              <div className="featured-pick-simplified__details">
                <DetailRow label="Model score" value={`${game.modelScore}/100 · ${'★'.repeat(game.stars)}`} />
                <DetailRow label="Model edge" value={`+${game.edge.toFixed(1)}%`} accent />
                <DetailRow label="Recommendation" value={game.valueRating} accent />
                <DetailRow label="Units" value={`${game.units.toFixed(1)}U`} />
              </div>
              <div className="featured-pick-simplified__pitchers" aria-label="Starting pitchers">
                <div className="featured-pick-simplified__pitcher">
                  <span>STARTER · {awayTeam.abbr}</span>
                  <strong>{game.awayStarter.name}</strong>
                  <em>{game.awayStarter.era.toFixed(2)} ERA</em>
                </div>
                <span className="featured-pick-simplified__middle">VS</span>
                <div className="featured-pick-simplified__pitcher">
                  <span>STARTER · {homeTeam.abbr}</span>
                  <strong>{game.homeStarter.name}</strong>
                  <em>{game.homeStarter.era.toFixed(2)} ERA</em>
                </div>
              </div>
              <div className="featured-pick-simplified__market" aria-label="Vegas line">
                <span>VEGAS<strong>{american(game.homeOdds)}</strong></span>
                <span>O/U<strong>{game.total}</strong></span>
                <span>SPREAD<strong>{game.spread}</strong></span>
              </div>
              <div className="featured-pick-simplified__details" style={{ marginTop: 14 }}>
                <DetailRow label="Best line" value={`${american(game.bestLineOdds)} at ${game.bestLineBook}`} accent />
              </div>
              <div className="featured-pick-simplified__insights">
                {game.insights.map((insight) => <span key={insight}>{insight}</span>)}
              </div>
            </div>
          </section>
        )}
      </article>
    </main>
  );
}
