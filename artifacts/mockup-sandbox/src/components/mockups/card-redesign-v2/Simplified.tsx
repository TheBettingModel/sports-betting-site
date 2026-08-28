import './_group.css';
import { useState } from 'react';

type Team = { name: string; abbr: string; record: string; logoUrl?: string };
type Game = { sport: string; gameTime: string; homeTeam: Team; awayTeam: Team; projection: { homeWinPct: number; valueRating: string; modelScore: number; edge: number; units?: number; confidence: string; sharpSignal?: string }; vegasLine: { homeOdds: number; awayOdds: number; openingHomeOdds?: number; openingAwayOdds?: number } };
const game: Game = {
  sport: 'WNBA', gameTime: '9:00 PM ET',
  homeTeam: { name: 'Aces', abbr: 'LVA', record: '24-8', logoUrl: 'https://a.espncdn.com/i/teamlogos/wnba/500/lva.png' },
  awayTeam: { name: 'Liberty', abbr: 'NYL', record: '22-10', logoUrl: 'https://a.espncdn.com/i/teamlogos/wnba/500/nyl.png' },
  projection: { homeWinPct: 64, valueRating: 'Strong Buy', modelScore: 87, edge: 4.4, units: 2.5, confidence: 'High', sharpSignal: 'Sharp Play' },
  vegasLine: { homeOdds: -160, awayOdds: 140, openingHomeOdds: -145, openingAwayOdds: 125 },
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
  const [fullData, setFullData] = useState(false);
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Logo team={game.awayTeam} /><div><b style={{ display: 'block', fontSize: 14, letterSpacing: '.02em' }}>{game.awayTeam.abbr}</b><span className="tbm-label" style={{ display: 'block', marginTop: 3, color: 'var(--tbm-dim)', letterSpacing: '.08em' }}>{game.awayTeam.record}</span></div></div>
            <span className="tbm-mono" style={{ color: 'var(--tbm-dim)', fontSize: 10, borderBottom: '1px solid var(--tbm-line)', paddingBottom: 3 }}>AT</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'right' }}><div><b style={{ display: 'block', fontSize: 14, letterSpacing: '.02em' }}>{game.homeTeam.abbr}</b><span className="tbm-label" style={{ display: 'block', marginTop: 3, color: 'var(--tbm-dim)', letterSpacing: '.08em' }}>{game.homeTeam.record}</span></div><Logo team={game.homeTeam} /></div>
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
          <div style={{ padding: '14px 0 13px', borderBottom: '1px solid var(--tbm-line-soft)' }}>
            <div className="tbm-label" style={{ marginBottom: 10, color: 'var(--tbm-text)' }}>Model outlook</div>
            <div className="tbm-outlook">
              <div><div className="tbm-label">Win prob.</div><div className="tbm-mono" style={{ marginTop: 5, color: 'var(--tbm-text)', fontSize: 23, fontWeight: 700, letterSpacing: '-.07em' }}>{model.toFixed(1)}%</div></div>
              <div><div className="tbm-label">Fair price</div><div className="tbm-mono" style={{ marginTop: 8, color: 'var(--tbm-muted)', fontSize: 17, fontWeight: 700 }}>{american(fairOdds(model))}</div></div>
              <div><div className="tbm-label">Market</div><div className="tbm-mono" style={{ marginTop: 8, color: 'var(--tbm-muted)', fontSize: 17, fontWeight: 700 }}>{american(odds)}</div></div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', paddingTop: 14 }}>
            <div><div className="tbm-label">Probability edge</div><strong className="tbm-mono" style={{ display: 'block', marginTop: 4, color: 'var(--tbm-lime)', fontSize: 21 }}>+{game.projection.edge.toFixed(1)}%</strong></div>
            <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} style={{ minHeight: 42, padding: '0 2px 0 14px', border: 0, background: 'transparent', color: 'var(--tbm-text)', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>{expanded ? 'Hide analysis ↑' : 'View analysis →'}</button>
          </div>
        </section>
        {expanded && <section style={{ padding: '0 16px 15px', animation: 'tbmReveal .24s ease-out' }}>
          <div style={{ paddingTop: 13, borderTop: '1px solid var(--tbm-line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}><div className="tbm-label" style={{ color: 'var(--tbm-text)' }}>Why TBM likes {game.homeTeam.name}</div><span className="tbm-label" style={{ color: 'var(--tbm-lime)', letterSpacing: '.08em' }}>LIVE SIGNAL</span></div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div><div className="tbm-label" style={{ color: 'var(--tbm-text)' }}>Model</div><p style={{ margin: '5px 0 0', color: '#c7cec8', fontSize: 11, lineHeight: 1.4 }}>Higher weighted grades across efficiency, shot quality, and home-court inputs.</p><div style={{ marginTop: 5, color: 'var(--tbm-muted)', fontSize: 11 }}>Model score <b style={{ color: 'var(--tbm-text)' }}>{game.projection.modelScore}/100</b> · confidence <b style={{ color: 'var(--tbm-text)' }}>{game.projection.confidence}</b></div></div>
              <div><div className="tbm-label" style={{ color: 'var(--tbm-text)' }}>Matchup</div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: '#c7cec8', fontSize: 11 }}><span>Offensive efficiency</span><b style={{ color: 'var(--tbm-lime)' }}>positive</b></div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, color: '#c7cec8', fontSize: 11 }}><span>Home court</span><b style={{ color: 'var(--tbm-lime)' }}>positive</b></div></div>
              <div><div className="tbm-label" style={{ color: 'var(--tbm-text)' }}>Market</div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: 'var(--tbm-muted)', fontSize: 11 }}><span>Opening / current</span><b style={{ color: 'var(--tbm-text)' }}>{american(opening ?? odds)} → {american(odds)}</b></div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, color: 'var(--tbm-muted)', fontSize: 11 }}><span>Best available</span><b style={{ color: 'var(--tbm-text)' }}>{american(-155)} · Pinnacle</b></div><div style={{ marginTop: 4, color: 'var(--tbm-muted)', fontSize: 11 }}>Sharp signal <b style={{ color: 'var(--tbm-lime)' }}>{game.projection.sharpSignal}</b></div></div>
              <div><div className="tbm-label" style={{ color: 'var(--tbm-text)' }}>Model pricing</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginTop: 6 }}><div><span className="tbm-label">Win prob.</span><b className="tbm-mono" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>{model.toFixed(1)}%</b></div><div><span className="tbm-label">Fair</span><b className="tbm-mono" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>{american(fairOdds(model))}</b></div><div><span className="tbm-label">Market</span><b className="tbm-mono" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>{american(odds)}</b></div></div></div>
              <div><div className="tbm-label" style={{ color: 'var(--tbm-text)' }}>Risk factors</div><p style={{ margin: '5px 0 0', color: 'var(--tbm-muted)', fontSize: 11, lineHeight: 1.4 }}>Price has shortened from the opener; value is narrower than at first post.</p></div>
            </div>
            <button type="button" onClick={() => setFullData(!fullData)} aria-expanded={fullData} style={{ width: '100%', minHeight: 38, marginTop: 13, border: '1px solid var(--tbm-line)', background: 'var(--tbm-surface-2)', color: 'var(--tbm-text)', cursor: 'pointer', fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase' }}>{fullData ? 'Hide full model data ↑' : 'Full model data →'}</button>
            {fullData && <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--tbm-line-soft)', color: 'var(--tbm-muted)', fontSize: 10, lineHeight: 1.5 }}>Selected side: {pick.abbr} · vig-removed market edge: {game.projection.edge.toFixed(1)} pts · price source: current actionable line.</div>}
          </div>
        </section>}
      </article>
    </main>
  );
}