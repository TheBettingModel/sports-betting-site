import './_group.css';
import { useState } from 'react';

type Team = { name: string; abbr: string; record: string; logoUrl?: string };
type Game = { sport: string; gameTime: string; homeTeam: Team; awayTeam: Team; projection: { homeWinPct: number; valueRating: string; modelScore: number; edge: number; units?: number; confidence: string; sharpSignal?: string }; vegasLine: { homeOdds: number; awayOdds: number; openingHomeOdds?: number; openingAwayOdds?: number } };
const game: Game = {
  sport: 'WNBA', gameTime: '9:00 PM ET',
  homeTeam: { name: 'Aces', abbr: 'LVA', record: '24-8', logoUrl: 'https://a.espncdn.com/i/teamlogos/wnba/500/lva.png' },
  awayTeam: { name: 'Liberty', abbr: 'NYL', record: '22-10', logoUrl: 'https://a.espncdn.com/i/teamlogos/wnba/500/nyl.png' },
  projection: { homeWinPct: 64, valueRating: 'Strong Buy', modelScore: 87, edge: 11.6, units: 2.5, confidence: 'High', sharpSignal: 'Sharp Play' },
  vegasLine: { homeOdds: -190, awayOdds: 160, openingHomeOdds: -180, openingAwayOdds: -175 },
};
function american(odds: number) { return odds > 0 ? `+${odds}` : `${odds}`; }
function implied(odds: number) { return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) * 100 : 100 / (odds + 100) * 100; }
function fairOdds(probability: number) { return probability >= 50 ? Math.round(-((probability / 100) / (1 - probability / 100)) * 100) : Math.round(((1 - probability / 100) / (probability / 100)) * 100); }
function Logo({ team }: { team: Team }) {
  const [failed, setFailed] = useState(false);
  return <div className="tbm-logo">{team.logoUrl && !failed ? <img src={team.logoUrl} alt="" onError={() => setFailed(true)} /> : team.abbr}</div>;
}

export function Simplified() {
  const [expanded, setExpanded] = useState(false);
  const pickIsHome = game.projection.homeWinPct >= 50;
  const pick = pickIsHome ? game.homeTeam : game.awayTeam;
  const odds = pickIsHome ? game.vegasLine.homeOdds : game.vegasLine.awayOdds;
  const opening = pickIsHome ? game.vegasLine.openingHomeOdds : game.vegasLine.openingAwayOdds;
  const model = game.projection.homeWinPct;
  const market = implied(odds);
  const probabilityEdge = model - market;
  return (
    <main className="tbm-preview" style={{ padding: '42px 14px' }}>
      <article className="tbm-card" style={{ borderLeftWidth: 3 }}>
        <header style={{ padding: '15px 16px 14px', borderBottom: '1px solid var(--tbm-line-soft)', boxShadow: 'inset 3px 0 0 rgba(183,243,74,.32)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="tbm-label"><span style={{ color: 'var(--tbm-lime)' }}>MODEL BOARD</span> <span style={{ color: 'var(--tbm-dim)' }}>/</span> {game.sport}</div>
            <div className="tbm-label" style={{ letterSpacing: '.08em' }}>{game.gameTime}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Logo team={game.awayTeam} /><div><b style={{ display: 'block', fontSize: 14, letterSpacing: '.02em' }}>{game.awayTeam.abbr}</b><span className="tbm-label" style={{ display: 'block', marginTop: 3, color: 'var(--tbm-dim)', letterSpacing: '.08em' }}>{game.awayTeam.record} AWAY</span></div></div>
            <span className="tbm-mono" style={{ color: 'var(--tbm-dim)', fontSize: 10, borderBottom: '1px solid var(--tbm-line)', paddingBottom: 3 }}>AT</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'right' }}><div><b style={{ display: 'block', fontSize: 14, letterSpacing: '.02em' }}>{game.homeTeam.abbr}</b><span className="tbm-label" style={{ display: 'block', marginTop: 3, color: 'var(--tbm-dim)', letterSpacing: '.08em' }}>{game.homeTeam.record} HOME</span></div><Logo team={game.homeTeam} /></div>
          </div>
        </header>
        <section style={{ padding: '16px' }}>
          <div className="tbm-label" style={{ color: 'var(--tbm-lime)' }}>TBM pick</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 5 }}>
            <h1 style={{ margin: 0, fontSize: 25, letterSpacing: '-.045em', lineHeight: 1.1 }}>{pick.name} ML</h1>
            <strong className="tbm-mono" style={{ color: 'var(--tbm-text)', fontSize: 18 }}>{american(odds)}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, paddingBottom: 15, borderBottom: '1px solid var(--tbm-line-soft)' }}>
            <span style={{ color: 'var(--tbm-lime)', fontSize: 12, fontWeight: 700, letterSpacing: '.1em' }}>{game.projection.valueRating.toUpperCase()}</span>
            <span style={{ color: 'var(--tbm-dim)' }}>•</span>
            <span className="tbm-mono" style={{ color: 'var(--tbm-lime)', fontSize: 12, fontWeight: 700 }}>{game.projection.units?.toFixed(1)}U</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 14, padding: '17px 0 13px', borderBottom: '1px solid var(--tbm-line-soft)' }}>
            <div><div className="tbm-label">Model win probability</div><div className="tbm-mono" style={{ marginTop: 6, color: 'var(--tbm-text)', fontSize: 31, fontWeight: 700, letterSpacing: '-.07em' }}>{model.toFixed(1)}%</div></div>
            <div style={{ paddingLeft: 14, borderLeft: '1px solid var(--tbm-line)' }}><div className="tbm-label">Market implied</div><div className="tbm-mono" style={{ marginTop: 11, color: 'var(--tbm-muted)', fontSize: 20, fontWeight: 700 }}>{market.toFixed(1)}%</div></div>
          </div>
          <div style={{ position: 'relative', height: 34, paddingTop: 15, borderBottom: '1px solid var(--tbm-line-soft)' }} aria-label={`Model ${model.toFixed(1)} percent, market ${market.toFixed(1)} percent`}>
            <div style={{ height: 3, background: '#28312b' }}><div style={{ width: `${Math.min(model, 100)}%`, height: 3, background: 'var(--tbm-lime)' }} /></div>
            <span style={{ position: 'absolute', top: 7, left: `${Math.min(model, 97)}%`, width: 1, height: 14, background: 'var(--tbm-lime)' }} />
            <span style={{ position: 'absolute', top: 10, left: `${Math.min(market, 97)}%`, width: 1, height: 11, background: 'var(--tbm-muted)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, color: 'var(--tbm-dim)', fontSize: 8, fontWeight: 700, letterSpacing: '.1em' }}><span>0</span><span>PROBABILITY SCALE</span><span>100</span></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', paddingTop: 14 }}>
            <div><div className="tbm-label">Model edge</div><strong className="tbm-mono" style={{ display: 'block', marginTop: 4, color: 'var(--tbm-lime)', fontSize: 21 }}>+{Math.abs(game.projection.edge).toFixed(1)}%</strong></div>
            <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} style={{ minHeight: 42, padding: '0 2px 0 14px', border: 0, background: 'transparent', color: 'var(--tbm-text)', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>{expanded ? 'Hide analysis ↑' : 'View analysis →'}</button>
          </div>
        </section>
        {expanded && <section style={{ padding: '0 16px 16px', animation: 'tbmReveal .24s ease-out' }}>
          <div style={{ paddingTop: 14, borderTop: '1px solid var(--tbm-line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div className="tbm-label" style={{ color: 'var(--tbm-text)' }}>Analysis / model read</div><span className="tbm-label" style={{ color: 'var(--tbm-lime)', letterSpacing: '.08em' }}>LIVE SIGNAL</span></div>
            <p style={{ margin: '8px 0 14px', color: '#c7cec8', fontSize: 12, lineHeight: 1.5 }}>The model sees a wider price gap on Las Vegas than the current market is assigning.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ padding: '10px', border: '1px solid var(--tbm-line-soft)', background: 'var(--tbm-surface-2)' }}><div className="tbm-label">TBM fair price</div><b className="tbm-mono" style={{ display: 'block', marginTop: 5, fontSize: 14 }}>{american(fairOdds(model))}</b></div>
              <div style={{ padding: '10px', border: '1px solid var(--tbm-line-soft)', background: 'var(--tbm-surface-2)' }}><div className="tbm-label">Current price</div><b className="tbm-mono" style={{ display: 'block', marginTop: 5, fontSize: 14 }}>{american(odds)}</b></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 13, color: 'var(--tbm-muted)', fontSize: 11 }}><span>Model score <b style={{ color: 'var(--tbm-text)' }}>{game.projection.modelScore}/100</b></span><span>Probability edge <b style={{ color: probabilityEdge >= 0 ? 'var(--tbm-lime)' : 'var(--tbm-red)' }}>{probabilityEdge >= 0 ? '+' : ''}{probabilityEdge.toFixed(1)}%</b></span></div>
            {opening && <div style={{ marginTop: 8, color: 'var(--tbm-muted)', fontSize: 11 }}>Opening {american(opening)} <span style={{ color: 'var(--tbm-dim)' }}>→</span> current {american(odds)} <span style={{ color: 'var(--tbm-lime)' }}>market moved</span></div>}
          </div>
        </section>}
      </article>
    </main>
  );
}